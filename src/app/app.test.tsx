import { expect, type Mock, spyOn, test } from "bun:test";

import { DuckDBConnection } from "@duckdb/node-api";

import logList from "#logs/sql/log-list.sql" with { type: "text" };
import metricList from "#metrics/sql/metric-list.sql" with { type: "text" };
import { renderApp } from "#testing/app.tsx";
import { at } from "#testing/clock.ts";
import { otlpLogs } from "#testing/logs.ts";
import { fakeSpanId, fakeTraceId, logsRequest, STATUS_CODE, tracesRequest } from "#testing/otlp.ts";
import { otlpTraces } from "#testing/traces.ts";
import traceList from "#traces/sql/trace-list.sql" with { type: "text" };

function queriesRun(runAndReadAll: Mock<DuckDBConnection["runAndReadAll"]>) {
  return runAndReadAll.mock.calls.map(([sql]) => sql);
}

test("queries only the view on screen", async () => {
  using runAndReadAll = spyOn(DuckDBConnection.prototype, "runAndReadAll");
  const app = await renderApp();

  await app.waitFor(() => queriesRun(runAndReadAll).includes(traceList));
  expect(queriesRun(runAndReadAll)).not.toContain(metricList);
  expect(queriesRun(runAndReadAll)).not.toContain(logList);

  app.press("right");
  await app.waitFor(() => queriesRun(runAndReadAll).includes(metricList));
  expect(queriesRun(runAndReadAll)).not.toContain(logList);
});

test("hints the view's described keys, the selected row's actions first", async () => {
  const app = await renderApp({
    size: { width: 160, height: 10 },
    send: [
      tracesRequest({
        service: "service-a",
        spans: [{ name: "operation-a", start: at(0), end: at(10) }],
      }),
    ],
  });
  await app.openTab("traces");
  await app.waitForText("operation-a");

  app.press("tab");
  const frame = await app.waitFor((frame) => frame.onList);

  expect(frame.hints).toBe(
    "/ search return open m mark y copy id right range s status o sort shift+o reverse p pause tab next region ? help",
  );
});

test("hints the jump to the next error only when a trace has errors", async () => {
  const app = await renderApp({
    size: { width: 160, height: 10 },
    send: [
      tracesRequest({
        service: "service-a",
        spans: [
          { name: "operation-a", start: at(0), end: at(10), status: { code: STATUS_CODE.error } },
        ],
      }),
    ],
  });
  await app.openTab("traces");
  await app.waitForText("operation-a");

  app.press("tab");
  const frame = await app.waitFor((frame) => frame.onList);

  expect(frame.hints).toStartWith("/ search return open m mark y copy id e next error");
});

test("follows to the traces tab when a log opens its trace", async () => {
  const traceId = fakeTraceId("2");
  const spanId = fakeSpanId("2a");
  const app = await renderApp({
    send: [
      tracesRequest({
        service: "service-a",
        spans: [{ traceId, spanId, name: "operation-a", start: at(0), end: at(10) }],
      }),
      logsRequest({
        service: "service-a",
        logs: [{ time: at(5), body: "message-a", traceId, spanId }],
      }),
    ],
  });
  await app.openTab("logs");
  await app.waitForText("message-a");
  app.press("tab");
  await app.waitForText("return open trace");

  app.press("return");

  await app.waitForText("1 span");
  expect((await app.captureStyles()).tabs).toEqual({
    Traces: { highlighted: false, fg: "text" },
    Metrics: { highlighted: false, fg: "muted" },
    Logs: { highlighted: false, fg: "muted" },
  });
});

test("forgets where a trace was opened from after switching tabs", async () => {
  const traceId = fakeTraceId("2");
  const app = await renderApp({
    send: [
      tracesRequest({
        service: "service-a",
        spans: [{ traceId, name: "operation-a", start: at(0), end: at(10) }],
      }),
      logsRequest({ service: "service-a", logs: [{ time: at(5), body: "message-a", traceId }] }),
    ],
  });
  await app.openTab("logs");
  await app.waitForText("message-a");
  app.press("tab");
  await app.waitForText("return open trace");
  app.press("return");
  await app.waitForText("1 span");

  app.press("shift+tab");
  await app.waitFor((frame) => !frame.onDetails);
  app.press("right");
  await app.waitForText("Waiting for metrics...");
  app.press("left");
  await app.waitForText("1 span");
  app.press("tab");
  await app.waitFor((frame) => frame.onDetails);
  app.press("escape");

  await app.waitForText("1 trace");
  expect((await app.captureStyles()).tabs).toMatchObject({
    Traces: { highlighted: false, fg: "text" },
  });
});

test("clears the telemetry with ctrl+l and starts the current tab over", async () => {
  const app = await renderApp({
    send: [
      tracesRequest({
        service: "service-a",
        spans: [{ name: "operation-a", start: at(0), end: at(10) }],
      }),
    ],
  });
  await app.openTab("traces");
  app.press("tab");
  await app.waitForText("operation-a");
  app.press("return");
  await app.waitForText("1 span");

  app.press("ctrl+l");

  await app.waitForText("Waiting for traces...");
  expect((await app.captureStyles()).tabs).toMatchObject({
    Traces: { highlighted: false, fg: "text" },
  });
});

test("draws a tab whole on the frame it first shows", async () => {
  const app = await renderApp({ send: [otlpTraces, otlpLogs] });
  const traces = await app.waitForPage("traces");
  expect(traces.chart).not.toEqual([]);
  expect(traces.tableRows).toHaveLength(3);

  app.press("right");
  await app.waitForPage("metrics");
  app.press("right");
  const logs = await app.waitForPage("logs");
  expect(logs.chart).not.toEqual([]);
  expect(logs.tableRows).not.toEqual([]);
});
