import { expect, test } from "bun:test";

import logList from "#logs/sql/log-list.sql" with { type: "text" };
import { renderFailedPage, renderPage } from "#testing/app.tsx";
import { at, fakeClock } from "#testing/clock.ts";
import type { Key } from "#testing/key.ts";
import { failedTrace, otlpLogs, renderLogList } from "#testing/logs.ts";
import { logsRequest, SEVERITY_NUMBER, tracesRequest } from "#testing/otlp.ts";
import { failedRootSpanId, failedTraceId } from "#testing/traces.ts";
import { THEME } from "#ui/theme.ts";

test("waits for logs before any arrive", async () => {
  const app = await renderPage("logs");

  const frame = await app.waitForText("Waiting for logs...");

  expect(frame.text).toContain("0 logs");
});

test("lists logs newest first, falling back to the observed time", async () => {
  const app = await renderLogList();

  const frame = await app.waitForText("7 logs");

  expect(frame.lines).toContain("Time Severity Service Body");
  expect(frame.tableRows).toEqual([
    "12:00:06.000 notice ● service-j message-f",
    "12:00:05.000 INFO ● service-i event-a message-e second line",
    "12:00:04.000 FATAL ● service-k message-g",
    '12:00:03.000 DEBUG ● service-h {"field-a":"value-a","field-b":200}',
    "12:00:02.000 ERROR ● service-d message-c",
    "12:00:01.000 WARN ● service-d message-b",
    "12:00:00.000 INFO ● service-c message-a",
  ]);
});

test("raises and lowers the minimum severity", async () => {
  const app = await renderLogList();

  async function pressSeverityKey(key: Key, label: string, rows: string[]) {
    app.press(key);
    const frame = await app.waitForRows(rows);
    expect(frame.header).toBe(`${label} ${rows.length} of 7 logs`);
  }

  await pressSeverityKey("s", "≥ DEBUG", [
    "message-e",
    "message-g",
    "field-a",
    "message-c",
    "message-b",
    "message-a",
  ]);
  await pressSeverityKey("s", "≥ INFO", [
    "message-e",
    "message-g",
    "message-c",
    "message-b",
    "message-a",
  ]);
  await pressSeverityKey("s", "≥ WARN", ["message-g", "message-c", "message-b"]);
  await pressSeverityKey("shift+s", "≥ INFO", [
    "message-e",
    "message-g",
    "message-c",
    "message-b",
    "message-a",
  ]);
});

test("wraps the severity filter around to show every log again", async () => {
  const app = await renderLogList();

  app.press("shift+s");
  let frame = await app.waitForText("1 of 7 logs");
  expect(frame.header).toBe("≥ FATAL 1 of 7 logs");

  app.press("s");
  frame = await app.waitFor((frame) => frame.tableRows.length === 7);
  expect(frame.header).toBe("7 logs");
});

test("searches bodies, attribute keys, services, trace IDs, and key=value pairs", async () => {
  const app = await renderLogList();

  async function expectSearch(text: string, rows: string[]) {
    await app.search(text);
    const frame = await app.waitForRows(rows);
    expect(frame.text).toContain(`${rows.length} of 7 logs`);
    app.press("escape");
    await app.waitFor((frame) => frame.tableRows.length === 7);
  }

  await expectSearch("message-g", ["message-g"]);
  await expectSearch("attribute.a", ["message-a"]);
  await expectSearch("service-d", ["message-c", "message-b"]);
  await expectSearch(failedTraceId.slice(0, 8), ["message-c", "message-b", "message-a"]);
  await expectSearch("attribute.b=value-b", ["message-b"]);
});

test("keeps an applied search while browsing", async () => {
  const app = await renderLogList();

  await app.search("service-d");
  await app.waitFor((frame) => frame.tableRows.length === 2);
  app.press("return");
  await app.waitFor((frame) => frame.onList);

  app.press("down");

  await app.waitForSelection("message-b");
  const frame = await app.waitFor((frame) => frame.header === "2 of 7 logs");
  expect(frame.hints).toStartWith("/service-d ");
});

test("jumps between errors in both directions", async () => {
  const app = await renderLogList();
  await app.waitForSelection("message-f");

  app.press("e");
  await app.waitForSelection("message-g");

  app.press("e");
  await app.waitForSelection("message-c");

  app.press("e");
  await app.waitForSelection("message-g");

  app.press("shift+e");
  await app.waitForSelection("message-c");
});

test("narrows the list to the selected log's trace and back", async () => {
  const app = await renderLogList();
  await app.selectRow("message-c");

  app.press("t");
  let frame = await app.waitFor((frame) => frame.tableRows.length === 3);
  expect(frame.header).toBe("trace 22222222 3 of 7 logs");
  await app.waitForRows(["message-c", "message-b", "message-a"]);

  app.press("t");
  frame = await app.waitFor((frame) => frame.tableRows.length === 7);
  expect(frame.header).toBe("7 logs");

  app.press("t");
  await app.waitFor((frame) => frame.tableRows.length === 3);
  app.press("escape");
  frame = await app.waitFor((frame) => frame.tableRows.length === 7);
  expect(frame.text).not.toContain("trace 22222222");
});

test("offers trace actions only for logs with a trace", async () => {
  const app = await renderLogList();

  let frame = await app.waitForText("e next error");
  expect(frame.text).not.toContain("t trace");

  await app.selectRow("message-c");
  frame = await app.waitForText("t trace");
  expect(frame.hints).toStartWith("/ search e next error return open trace t trace y copy body");
});

test("opens the selected log's trace in the traces view and goes back to the log", async () => {
  const app = await renderLogList({
    send: [
      tracesRequest({
        service: "service-c",
        spans: [
          {
            traceId: failedTraceId,
            spanId: failedRootSpanId,
            name: "operation-d",
            start: at(0),
            end: at(2500),
          },
        ],
      }),
    ],
  });
  app.press("end");
  await app.waitForSelection("message-a");

  app.press("return");
  let frame = await app.waitForText("1 span");
  expect(frame.list.slice(0, 2)).toEqual([
    `operation-d ${failedTraceId}`,
    "● service-c 12:00:00.000 1 span 2.50s",
  ]);

  app.press("escape");
  frame = await app.waitFor((frame) => frame.tableRows.length === 7);
  expect(frame.header).toBe("7 logs");
  await app.waitForSelection("message-a");
});

test("selects the log's span in the trace it opens", async () => {
  const app = await renderLogList({ send: [failedTrace] });
  await app.selectRow("message-c");

  app.press("return");
  await app.waitForText("2 spans");

  expect(await app.waitForSelection("operation-e")).toBe("● service-d operation-e 1.50s");
});

test("selects the log's span in a trace that is already open", async () => {
  const app = await renderPage("traces", { send: [failedTrace, otlpLogs] });

  await app.waitForText("operation-d");
  app.press("return");
  await app.waitForText("2 spans");
  expect(await app.waitForSelection("operation-d")).toBe(`● service-c operation-d 2.50s`);

  app.press("shift+tab");
  await app.openTab("logs");
  await app.waitForRows([
    "message-f",
    "message-e",
    "message-g",
    "field-a",
    "message-c",
    "message-b",
    "message-a",
  ]);
  app.press("tab");
  await app.waitFor((frame) => frame.onList);
  await app.selectRow("message-c");

  app.press("return");
  await app.waitForText("2 spans");

  expect(await app.waitForSelection("operation-e")).toBe("● service-d operation-e 1.50s");
});

test("lists identical logs separately and selects each in turn", async () => {
  const repeated = { time: at(1000), severityNumber: SEVERITY_NUMBER.info, body: "message-a" };
  const earlier = { time: at(0), severityNumber: SEVERITY_NUMBER.info, body: "message-b" };
  const app = await renderPage("logs", {
    send: [logsRequest({ service: "service-a", logs: [repeated, repeated, earlier] })],
  });

  const frame = await app.waitFor((frame) => frame.tableRows.length === 3);
  expect(frame.tableRows).toEqual([
    "12:00:01.000 INFO ● service-a message-a",
    "12:00:01.000 INFO ● service-a message-a",
    "12:00:00.000 INFO ● service-a message-b",
  ]);

  const firstRowLine = frame.lineOf("message-a");
  await app.waitForSelection("message-a", { line: firstRowLine });
  app.press("down");
  await app.waitForSelection("message-a", { line: firstRowLine + 1 });
  app.press("down");
  await app.waitForSelection("message-b");
});

test("shows an error when logs cannot be loaded and retries", async () => {
  const app = await renderFailedPage("logs", { send: [otlpLogs], failOnce: logList });
  await app.waitForText("Failed to load logs");
  app.press("r");

  await app.waitForRows([
    "message-f",
    "message-e",
    "message-g",
    "field-a",
    "message-c",
    "message-b",
    "message-a",
  ]);
});

test("copies the selected log's body", async () => {
  const app = await renderLogList();

  app.press("y");

  await app.waitFor((frame) => frame.hints.includes("y copied"));
  expect(app.copied).toEqual(["message-f"]);
});

test("colors each severity", async () => {
  const app = await renderLogList();

  const frame = await app.captureStyles();

  expect(frame.line("message-c").fg("ERROR")).toBe(THEME.textError);
  expect(frame.line("message-b").fg("WARN")).toBe(THEME.textWarning);
  expect(frame.line("message-a").fg("INFO")).toBe(THEME.text);
});

test("charts the logs over time and narrows the list to a column", async () => {
  fakeClock(at(50_000));
  const app = await renderLogList();
  let frame = await app.waitForText("Logs over time");
  expect(frame.lines).toContain("Logs over time ■ errors 10s per column");

  app.press("right");
  frame = await app.waitFor((frame) => frame.header.startsWith("12:00:00–12:00:10"));
  expect(frame.header).toBe("12:00:00–12:00:10 7 logs");

  app.press("escape");
  await app.waitFor((frame) => frame.header === "7 logs");
});
