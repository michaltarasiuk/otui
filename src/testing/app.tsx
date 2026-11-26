import { onTestFinished, spyOn } from "bun:test";

import type { DuckDBConnection } from "@duckdb/node-api";
import { focusManager, QueryClient } from "@tanstack/react-query";

import { App } from "#app/app.tsx";
import type { Tab } from "#app/router.tsx";
import { TABS } from "#app/tabs.tsx";
import { QUERY_CLIENT_CONFIG, QueryProvider, waitForInFlightQueries } from "#app/tui.tsx";
import { ClipboardContext } from "#ui/clipboard.tsx";
import { isDefined } from "#utils/is-defined.ts";

import { silenceConsoleError } from "./console.ts";
import type { OtlpRequest } from "./otlp.ts";
import { startTestReceiver } from "./receiver.ts";
import { mount, type TestScreen } from "./render.tsx";

const DEFAULT_SIZE = { width: 120, height: 30 };

export interface AppOptions {
  size?: { width: number; height: number };
  send?: OtlpRequest[];
  failOnce?: string;
}

export type TestApp = Awaited<ReturnType<typeof renderApp>>;

export async function renderApp({ size = DEFAULT_SIZE, send = [], failOnce }: AppOptions = {}) {
  const resources = new AsyncDisposableStack();
  onTestFinished(() => resources.disposeAsync());

  const receiver = resources.use(await startTestReceiver());
  await receiver.send(...send);
  const connection = await receiver.connect();
  if (isDefined(failOnce)) {
    silenceConsoleError();
    resources.use(failFirstRun(connection, failOnce));
  }

  const queryClient = new QueryClient(QUERY_CLIENT_CONFIG);
  const copied: string[] = [];
  const { screen, unmount } = await mount(
    <QueryProvider queryClient={queryClient} connection={connection}>
      <ClipboardContext
        value={(text) => {
          copied.push(text);
          return Promise.resolve(true);
        }}
      >
        <App
          httpUrl={receiver.httpUrl}
          grpcUrl={receiver.grpcUrl}
          onClear={() => receiver.clear()}
        />
      </ClipboardContext>
    </QueryProvider>,
    size,
  );
  resources.defer(() => focusManager.setFocused(undefined));
  resources.defer(unmount);
  resources.defer(() => settleQueries(queryClient));

  function waitForRows(texts: string[]) {
    return screen.waitFor(
      (frame) =>
        frame.tableRows.length === texts.length &&
        frame.tableRows.every((row, index) => row.includes(texts[index]!)),
      `rows containing ${texts.join(", ")}`,
    );
  }

  function waitForPage(tab: Tab) {
    const count = new RegExp(` ${tab.slice(0, -1)}s?$`);
    return screen.waitFor((frame) => count.test(frame.header), `the ${tab} page`);
  }

  async function openTab(tab: Tab) {
    await clickTab(screen, tab);
    return waitForPage(tab);
  }

  async function search(text: string) {
    screen.press("/");
    await screen.waitFor((frame) => frame.hints.includes("return apply"), "the search input");
    await screen.type(text);
  }

  return { ...screen, receiver, copied, waitForRows, waitForPage, openTab, search };
}

export async function renderPage(tab: Tab, options?: AppOptions) {
  const app = await renderApp(options);
  await app.openTab(tab);
  app.press("tab");
  await app.waitFor((frame) => frame.onList);
  return app;
}

export async function renderFailedPage(tab: Tab, options: AppOptions & { failOnce: string }) {
  const app = await renderApp(options);
  await clickTab(app, tab);
  await app.waitForText("Failed to load");
  app.press("tab");
  await app.waitFor((frame) => frame.hints.includes("r retry"), "the retry key");
  return app;
}

async function clickTab(screen: TestScreen, tab: Tab) {
  const { name } = TABS.find(({ value }) => value === tab)!;
  const { x, y } = (await screen.waitForText(name)).positionOf(name);
  await screen.mockMouse.click(x, y);
}

function failFirstRun(connection: DuckDBConnection, sql: string) {
  const runAndReadAll = connection.runAndReadAll.bind(connection);
  let failed = false;
  return spyOn(connection, "runAndReadAll").mockImplementation((...args) => {
    if (args[0] !== sql || failed) {
      return runAndReadAll(...args);
    }
    failed = true;
    return Promise.reject(new Error("The query failed"));
  });
}

async function settleQueries(queryClient: QueryClient) {
  while (queryClient.isFetching() > 0) {
    await waitForInFlightQueries(queryClient);
    await new Promise((resolve) => setImmediate(resolve));
  }
}
