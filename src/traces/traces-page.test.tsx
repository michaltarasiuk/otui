import { expect, test } from "bun:test";

import { renderFailedPage, renderPage, type TestApp } from "#testing/app.tsx";
import { at } from "#testing/clock.ts";
import { tracesRequest } from "#testing/otlp.ts";
import { otlpTraces, renderTraceList, singleTraceId } from "#testing/traces.ts";
import traceList from "#traces/sql/trace-list.sql" with { type: "text" };
import { serviceColor, THEME } from "#ui/theme.ts";

test("waits for traces before any arrive", async () => {
  const app = await renderPage("traces");

  const frame = await app.waitForText("Waiting for traces...");

  expect(frame.text).toContain("0 traces");
});

test("lists traces whose root span arrived, newest first, with span and error counts", async () => {
  const app = await renderPage("traces", { send: [otlpTraces] });

  const frame = await app.waitFor((frame) => frame.tableRows.length === 3);

  expect(frame.lines).toContain("3 traces");
  expect(frame.lines).toContain("Time ▼ Service Name Spans Errors Duration");
  expect(frame.tableRows).toEqual([
    "12:00:02.000 ● service-f operation-g 1 1.0ms",
    "12:00:01.000 ● service-c operation-d 3 2 500.0ms",
    "12:00:00.000 ● service-a operation-a 3 120.0ms",
  ]);
});

test("searches trace names, services, and IDs", async () => {
  const app = await renderTraceList();

  await app.search("service-b");
  let frame = await app.waitForText("1 of 3 traces");
  await app.waitForRows(["operation-a"]);

  app.press("return");
  frame = await app.waitFor((frame) => frame.onList);
  expect(frame.header).toBe("1 of 3 traces");
  expect(frame.hints).toStartWith("/service-b / search escape clear");

  app.press("escape");
  frame = await app.waitFor((frame) => frame.tableRows.length === 3);
  expect(frame.header).toBe("3 traces");

  await app.search(singleTraceId.slice(0, 8));
  frame = await app.waitForText("1 of 3 traces");
  await app.waitForRows(["operation-g"]);
});

test("filters traces by a span or resource attribute", async () => {
  const app = await renderTraceList();

  await app.search("db.system.name=peer-a");
  let frame = await app.waitForText("1 of 3 traces");
  await app.waitForRows(["operation-a"]);

  await app.type(" resource.a=value-b");
  frame = await app.waitForText("No traces match");
  expect(frame.text).toContain("0 of 3 traces");
});

test("matches search text literally", async () => {
  const app = await renderTraceList();

  await app.search("_");

  const frame = await app.waitForText("No traces match");
  expect(frame.text).toContain("0 of 3 traces");
});

test("shows only traces with errors", async () => {
  const app = await renderTraceList();

  app.press("s");
  let frame = await app.waitForText("1 of 3 traces");
  expect(frame.header).toBe("errors only 1 of 3 traces");
  await app.waitForRows(["operation-d"]);

  app.press("s");
  frame = await app.waitFor((frame) => frame.tableRows.length === 3);
  expect(frame.text).not.toContain("errors only");
});

test("sorts by span count, error count, duration, and time", async () => {
  const app = await renderTraceList();

  async function nextSort(header: string, rows: string[]) {
    app.press("o");
    const frame = await app.waitForRows(rows);
    expect(frame.lines).toContain(header);
  }

  await nextSort("Time Service Name ▼ Spans Errors Duration", [
    "operation-d",
    "operation-a",
    "operation-g",
  ]);
  await nextSort("Time Service Name Spans ▼ Errors Duration", [
    "operation-d",
    "operation-g",
    "operation-a",
  ]);
  await nextSort("Time Service Name Spans Errors ▼ Duration", [
    "operation-d",
    "operation-a",
    "operation-g",
  ]);
  await nextSort("Time ▼ Service Name Spans Errors Duration", [
    "operation-g",
    "operation-d",
    "operation-a",
  ]);

  app.press("shift+o");
  const frame = await app.waitForRows(["operation-a", "operation-d", "operation-g"]);
  expect(frame.lines).toContain("Time ▲ Service Name Spans Errors Duration");
});

test("jumps to the next trace with errors in either direction", async () => {
  const app = await renderTraceList();
  await app.waitForSelection("operation-g");

  app.press("e");
  await app.waitForSelection("operation-d");

  app.press("home");
  await app.waitForSelection("operation-g");
  app.press("shift+e");
  await app.waitForSelection("operation-d");
});

test("keeps the search and sort when switching tabs", async () => {
  const app = await renderTraceList();
  app.press("o");
  await app.waitForText("▼ Spans");
  await app.search("service-b");
  app.press("return");
  await app.waitFor((frame) => frame.onList);

  app.press("shift+tab");
  await app.waitFor((frame) => frame.text.includes("tab next region") && !frame.onList);
  app.press("right");
  await app.waitForPage("metrics");
  app.press("left");

  const frame = await app.waitFor((frame) => frame.tableRows.length === 1);
  expect(frame.header).toBe("1 of 3 traces");
  expect(frame.hints).toStartWith("/service-b ");
  expect(frame.lines).toContain("Time Service Name ▼ Spans Errors Duration");
  await app.waitForRows(["operation-a"]);
});

test("shows an error when traces cannot be loaded and retries", async () => {
  const app = await renderFailedPage("traces", { send: [otlpTraces], failOnce: traceList });
  await app.waitForText("Failed to load traces");
  app.press("r");

  await app.waitFor((frame) => frame.tableRows.length > 0);
});

test("retries traces after another page has loaded", async () => {
  const app = await renderFailedPage("traces", { send: [otlpTraces], failOnce: traceList });
  app.press("tab");
  await app.waitFor((frame) => !frame.hints.includes("r retry"));
  app.press("right");
  await app.waitForPage("metrics");
  app.press("left");
  await app.waitForText("Failed to load traces");
  app.press("tab");
  await app.waitFor((frame) => frame.hints.includes("r retry"));

  app.press("r");

  await app.waitFor((frame) => frame.tableRows.length > 0);
});

test("copies the selected trace's ID", async () => {
  const app = await renderTraceList();

  app.press("y");

  await app.waitFor((frame) => frame.hints.includes("y copied"));
  expect(app.copied).toEqual([singleTraceId]);
});

test("pauses and resumes live updates", async () => {
  const app = await renderTraceList();

  app.press("p");
  const frame = await app.waitFor((frame) => frame.hints.includes("p resume"));
  expect(frame.tabBar).toContain("paused · ");

  await app.receiver.send(
    tracesRequest({
      service: "service-a",
      spans: [{ name: "operation-a", start: at(3000), end: at(3001) }],
    }),
  );
  app.press("p");

  const resumed = await app.waitFor((frame) => frame.header === "4 traces");
  expect(resumed.tabBar).not.toContain("paused · ");
  expect(resumed.hints).toContain("p pause");
});

test("colors each service and the error count", async () => {
  const app = await renderTraceList();

  const row = (await app.captureStyles()).line("operation-d");

  expect(row.fg("●")).toBe(serviceColor("service-c"));
  expect(row.fg("2")).toBe(THEME.textError);
});

test("highlights the selected row only while its region has focus", async () => {
  const app = await renderTraceList();
  await app.waitForSelection("operation-g");

  app.press("shift+tab");
  await app.waitFor((frame) => !frame.hints.includes("/ search"));

  const row = (await app.captureStyles()).line("operation-g");
  expect(row.bg("operation-g")).not.toBe(THEME.backgroundSelected);
});

async function searchTraces(app: TestApp, text: string) {
  await app.search(text);
  app.press("return");
  return app.waitFor((frame) => frame.hints.startsWith(`/${text} `));
}

async function clearSearch(app: TestApp) {
  app.press("escape");
  await app.waitFor((frame) => !frame.header.startsWith("/"));
}

test("filters traces by span duration", async () => {
  const app = await renderTraceList();

  await searchTraces(app, "duration>200ms");
  await app.waitFor((frame) => frame.header.endsWith("1 of 3 traces"));
  await app.waitForRows(["operation-d"]);

  await clearSearch(app);
  await searchTraces(app, "duration<10ms");
  await app.waitFor((frame) => frame.header.endsWith("1 of 3 traces"));
  await app.waitForRows(["operation-g"]);
});

test("filters traces by spans whose attribute has a different value", async () => {
  const app = await renderTraceList();

  await searchTraces(app, "attribute.a!=value-b");
  let frame = await app.waitFor((frame) => frame.header.endsWith("1 of 3 traces"));
  await app.waitForRows(["operation-a"]);

  await clearSearch(app);
  await searchTraces(app, "attribute.a!=value-a");
  frame = await app.waitForText("No traces match");
  expect(frame.header).toEndWith("0 of 3 traces");
});

test("compares numeric attributes", async () => {
  const app = await renderPage("traces", {
    send: [
      tracesRequest({
        service: "service-a",
        spans: [1, 2, 3].map((value) => ({
          name: `operation-${value}`,
          start: at(value * 1000),
          end: at(value * 1000 + 10),
          attributes: { "attribute.a": value },
        })),
      }),
    ],
  });
  await app.waitFor((frame) => frame.tableRows.length === 3);

  await searchTraces(app, "attribute.a>=2");
  const frame = await app.waitFor((frame) => frame.header.endsWith("2 of 3 traces"));
  expect(frame.tableRows).toMatchObject([
    expect.stringContaining("operation-3"),
    expect.stringContaining("operation-2"),
  ]);
});
