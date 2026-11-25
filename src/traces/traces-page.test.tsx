import { expect, test } from "bun:test";

import { renderFailedPage, renderPage, type TestApp } from "#testing/app.tsx";
import { at } from "#testing/clock.ts";
import { failOnce } from "#testing/connection.ts";
import { silenceConsoleError } from "#testing/console.ts";
import { fakeSpanId, fakeTraceId, tracesRequest } from "#testing/otlp.ts";
import { startTestReceiver } from "#testing/receiver.ts";
import {
  color,
  keyHints,
  lineSpans,
  onList,
  pageHeader,
  selectedBackground,
  spanColors,
  tabBar,
  tableRows,
  textLines,
} from "#testing/screen.ts";
import {
  NESTED_ROW,
  FAILED_ROW,
  NEWEST_FIRST,
  otlpTraces,
  renderTraceList,
  SINGLE_ROW,
  singleTraceId,
} from "#testing/traces.ts";
import traceList from "#traces/sql/trace-list.sql" with { type: "text" };
import { serviceColor, THEME } from "#ui/theme.ts";

test("waits for traces before any arrive", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderPage(receiver, "traces");

  const frame = await app.waitForText("Waiting for traces...");

  expect(frame).toContain("0 traces");
});

test("lists traces whose root span arrived, newest first, with span and error counts", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/traces", otlpTraces);
  await using app = await renderPage(receiver, "traces");

  const frame = await app.waitForFrame((frame) => tableRows(frame).length === 3);

  expect(textLines(frame)).toContain("3 traces");
  expect(textLines(frame)).toContain("Time ▼ Service Name Spans Errors Duration");
  expect(tableRows(frame)).toEqual(NEWEST_FIRST);
});

test("searches trace names, services, and IDs", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderTraceList(receiver);

  await app.search("service-b");
  let frame = await app.waitForText("1 of 3 traces");
  expect(tableRows(frame)).toEqual([NESTED_ROW]);

  app.mockInput.pressEnter();
  frame = await app.waitForFrame(onList);
  expect(pageHeader(frame)).toBe("1 of 3 traces");
  expect(keyHints(frame)).toStartWith("/service-b / search escape clear");

  app.mockInput.pressEscape();
  frame = await app.waitForFrame((frame) => tableRows(frame).length === 3);
  expect(pageHeader(frame)).toBe("3 traces");

  await app.search(singleTraceId.slice(0, 8));
  frame = await app.waitForText("1 of 3 traces");
  expect(tableRows(frame)).toEqual([SINGLE_ROW]);
});

test("filters traces by a span or resource attribute", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderTraceList(receiver);

  await app.search("db.system.name=peer-a");
  let frame = await app.waitForText("1 of 3 traces");
  expect(tableRows(frame)).toEqual([NESTED_ROW]);

  await app.mockInput.typeText(" resource.a=value-b");
  frame = await app.waitForText("No traces match");
  expect(frame).toContain("0 of 3 traces");
});

test("matches search text literally", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderTraceList(receiver);

  await app.search("_");

  const frame = await app.waitForText("No traces match");
  expect(frame).toContain("0 of 3 traces");
});

test("shows only traces with errors", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderTraceList(receiver);

  app.mockInput.pressKey("s");
  let frame = await app.waitForText("1 of 3 traces");
  expect(pageHeader(frame)).toBe("errors only 1 of 3 traces");
  expect(tableRows(frame)).toEqual([FAILED_ROW]);

  app.mockInput.pressKey("s");
  frame = await app.waitForFrame((frame) => tableRows(frame).length === 3);
  expect(frame).not.toContain("errors only");
});

test("sorts by span count, error count, duration, and time", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderTraceList(receiver);

  async function nextSort(header: string, rows: string[]) {
    app.mockInput.pressKey("o");
    const frame = await app.waitForRows(rows);
    expect(textLines(frame)).toContain(header);
  }

  await nextSort("Time Service Name ▼ Spans Errors Duration", [FAILED_ROW, NESTED_ROW, SINGLE_ROW]);
  await nextSort("Time Service Name Spans ▼ Errors Duration", [FAILED_ROW, SINGLE_ROW, NESTED_ROW]);
  await nextSort("Time Service Name Spans Errors ▼ Duration", [FAILED_ROW, NESTED_ROW, SINGLE_ROW]);
  await nextSort("Time ▼ Service Name Spans Errors Duration", NEWEST_FIRST);

  app.mockInput.pressKey("o", { shift: true });
  const frame = await app.waitForRows([NESTED_ROW, FAILED_ROW, SINGLE_ROW]);
  expect(textLines(frame)).toContain("Time ▲ Service Name Spans Errors Duration");
});

test("jumps to the next trace with errors in either direction", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderTraceList(receiver);
  await app.waitForSelection(SINGLE_ROW);

  app.mockInput.pressKey("e");
  expect(await app.waitForSelection("operation-d")).toBe(FAILED_ROW);

  app.mockInput.pressKey("HOME");
  await app.waitForSelection(SINGLE_ROW);
  app.mockInput.pressKey("e", { shift: true });
  expect(await app.waitForSelection("operation-d")).toBe(FAILED_ROW);
});

test("keeps the search and sort when switching tabs", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderTraceList(receiver);
  app.mockInput.pressKey("o");
  await app.waitForText("▼ Spans");
  await app.search("service-b");
  app.mockInput.pressEnter();
  await app.waitForFrame(onList);

  app.mockInput.pressTab({ shift: true });
  await app.waitForFrame((frame) => frame.includes("tab next region") && !onList(frame));
  app.mockInput.pressArrow("right");
  await app.waitForPage("metrics");
  app.mockInput.pressArrow("left");

  const frame = await app.waitForFrame((frame) => tableRows(frame).length === 1);
  expect(pageHeader(frame)).toBe("1 of 3 traces");
  expect(keyHints(frame)).toStartWith("/service-b ");
  expect(textLines(frame)).toContain("Time Service Name ▼ Spans Errors Duration");
  expect(tableRows(frame)).toEqual([NESTED_ROW]);
});

test("shows an error when traces cannot be loaded and retries", async () => {
  silenceConsoleError();
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/traces", otlpTraces);
  const connection = await receiver.connect();
  using _ = failOnce(connection, traceList);

  await using app = await renderFailedPage(receiver, "traces", { connection });
  await app.waitForText("Failed to load traces");
  app.mockInput.pressKey("r");

  await app.waitForFrame((frame) => tableRows(frame).length > 0);
});

test("retries traces after another page has loaded", async () => {
  silenceConsoleError();
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/traces", otlpTraces);
  const connection = await receiver.connect();
  using _ = failOnce(connection, traceList);
  await using app = await renderFailedPage(receiver, "traces", { connection });
  app.mockInput.pressTab();
  await app.waitForFrame((frame) => !keyHints(frame).includes("r retry"));
  app.mockInput.pressArrow("right");
  await app.waitForPage("metrics");
  app.mockInput.pressArrow("left");
  await app.waitForText("Failed to load traces");
  app.mockInput.pressTab();
  await app.waitForFrame((frame) => keyHints(frame).includes("r retry"));

  app.mockInput.pressKey("r");

  await app.waitForFrame((frame) => tableRows(frame).length > 0);
});

test("copies the selected trace's ID", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderTraceList(receiver);

  app.mockInput.pressKey("y");

  await app.waitForFrame((frame) => keyHints(frame).includes("y copied"));
  expect(app.copied).toEqual([singleTraceId]);
});

test("pauses and resumes live updates", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderTraceList(receiver);

  app.mockInput.pressKey("p");
  const frame = await app.waitForFrame((frame) => keyHints(frame).includes("p resume"));
  expect(tabBar(frame)).toContain("paused · ");

  await receiver.sendHttp(
    "/v1/traces",
    tracesRequest({
      service: "service-a",
      spans: [
        {
          traceId: fakeTraceId("a"),
          spanId: fakeSpanId("aa"),
          name: "operation-a",
          start: at(3000),
          end: at(3001),
        },
      ],
    }),
  );
  app.mockInput.pressKey("p");

  const resumed = await app.waitForFrame((frame) => pageHeader(frame) === "4 traces");
  expect(tabBar(resumed)).not.toContain("paused · ");
  expect(keyHints(resumed)).toContain("p pause");
});

test("colors each service and the error count", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderTraceList(receiver);

  const spans = lineSpans(await app.captureSpans(), "operation-d");

  expect(spanColors(spans, "●").fg).toEqual(color(serviceColor("service-c")));
  expect(spanColors(spans, "2").fg).toEqual(color(THEME.textError));
});

test("highlights the selected row only while its region has focus", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderTraceList(receiver);
  await app.waitForSelection(SINGLE_ROW);

  app.mockInput.pressTab({ shift: true });
  await app.waitForFrame((frame) => !keyHints(frame).includes("/ search"));

  const spans = lineSpans(await app.captureSpans(), "operation-g");
  expect(spanColors(spans, "operation-g").bg).not.toEqual(selectedBackground.toInts());
});

async function searchTraces(app: TestApp, text: string) {
  await app.search(text);
  app.mockInput.pressEnter();
  return app.waitForFrame((frame) => keyHints(frame).startsWith(`/${text} `));
}

async function clearSearch(app: TestApp) {
  app.mockInput.pressEscape();
  await app.waitForFrame((frame) => !pageHeader(frame).startsWith("/"));
}

test("filters traces by span duration", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderTraceList(receiver);

  let frame = await searchTraces(app, "duration>200ms");
  frame = await app.waitForFrame((frame) => pageHeader(frame).endsWith("1 of 3 traces"));
  expect(tableRows(frame)).toEqual([FAILED_ROW]);

  await clearSearch(app);
  await searchTraces(app, "duration<10ms");
  frame = await app.waitForFrame((frame) => pageHeader(frame).endsWith("1 of 3 traces"));
  expect(tableRows(frame)).toEqual([SINGLE_ROW]);
});

test("filters traces by spans whose attribute has a different value", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderTraceList(receiver);

  await searchTraces(app, "attribute.a!=value-b");
  let frame = await app.waitForFrame((frame) => pageHeader(frame).endsWith("1 of 3 traces"));
  expect(tableRows(frame)).toEqual([NESTED_ROW]);

  await clearSearch(app);
  await searchTraces(app, "attribute.a!=value-a");
  frame = await app.waitForText("No traces match");
  expect(pageHeader(frame)).toEndWith("0 of 3 traces");
});

test("compares numeric attributes", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp(
    "/v1/traces",
    tracesRequest({
      service: "service-a",
      spans: [1, 2, 3].map((value) => ({
        traceId: fakeTraceId(String(value)),
        spanId: fakeSpanId(`${value}a`),
        name: `operation-${value}`,
        start: at(value * 1000),
        end: at(value * 1000 + 10),
        attributes: { "attribute.a": value },
      })),
    }),
  );
  await using app = await renderPage(receiver, "traces");
  await app.waitForFrame((frame) => tableRows(frame).length === 3);

  await searchTraces(app, "attribute.a>=2");
  const frame = await app.waitForFrame((frame) => pageHeader(frame).endsWith("2 of 3 traces"));
  expect(tableRows(frame)).toMatchObject([
    expect.stringContaining("operation-3"),
    expect.stringContaining("operation-2"),
  ]);
});
