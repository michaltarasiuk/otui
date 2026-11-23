import { expect, type Mock, spyOn, test } from "bun:test";

import { DuckDBConnection } from "@duckdb/node-api";

import logList from "#logs/sql/log-list.sql" with { type: "text" };
import metricList from "#metrics/sql/metric-list.sql" with { type: "text" };
import serviceList from "#services/sql/service-list.sql" with { type: "text" };
import { renderApp } from "#testing/app.tsx";
import { at } from "#testing/clock.ts";
import { otlpLogs } from "#testing/logs.ts";
import { fakeSpanId, fakeTraceId, logsRequest, STATUS_CODE, tracesRequest } from "#testing/otlp.ts";
import { startTestReceiver } from "#testing/receiver.ts";
import { chartLines, keyHints, onDetails, onList, tableRows, tabStyles } from "#testing/screen.ts";
import { otlpTraces } from "#testing/traces.ts";
import traceList from "#traces/sql/trace-list.sql" with { type: "text" };

function queriesRun(runAndReadAll: Mock<DuckDBConnection["runAndReadAll"]>) {
  return runAndReadAll.mock.calls.map(([sql]) => sql);
}

test("queries only the view on screen", async () => {
  using runAndReadAll = spyOn(DuckDBConnection.prototype, "runAndReadAll");
  await using receiver = await startTestReceiver();
  await using app = await renderApp(receiver);

  await app.waitForFrame(() => queriesRun(runAndReadAll).includes(serviceList));
  expect(queriesRun(runAndReadAll)).not.toContain(traceList);
  expect(queriesRun(runAndReadAll)).not.toContain(metricList);
  expect(queriesRun(runAndReadAll)).not.toContain(logList);

  app.mockInput.pressArrow("right");
  await app.waitForFrame(() => queriesRun(runAndReadAll).includes(traceList));
  expect(queriesRun(runAndReadAll)).not.toContain(metricList);
  expect(queriesRun(runAndReadAll)).not.toContain(logList);
});

test("hints the view's described keys, the selected row's actions first", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp(
    "/v1/traces",
    tracesRequest({
      service: "service-a",
      spans: [
        {
          traceId: fakeTraceId("1"),
          spanId: fakeSpanId("1"),
          name: "operation-a",
          start: at(0),
          end: at(10),
        },
      ],
    }),
  );
  await using app = await renderApp(receiver, { size: { width: 160, height: 10 } });
  await app.openTab("traces");
  await app.waitForText("operation-a");

  app.mockInput.pressTab();
  const frame = await app.waitForFrame(onList);

  expect(keyHints(frame)).toBe(
    "/ search return open m mark y copy id right range s status o sort shift+o reverse p pause tab next region ? help",
  );
});

test("hints the jump to the next error only when a trace has errors", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp(
    "/v1/traces",
    tracesRequest({
      service: "service-a",
      spans: [
        {
          traceId: fakeTraceId("1"),
          spanId: fakeSpanId("1"),
          name: "operation-a",
          start: at(0),
          end: at(10),
          status: { code: STATUS_CODE.error },
        },
      ],
    }),
  );
  await using app = await renderApp(receiver, { size: { width: 160, height: 10 } });
  await app.openTab("traces");
  await app.waitForText("operation-a");

  app.mockInput.pressTab();
  const frame = await app.waitForFrame(onList);

  expect(keyHints(frame)).toStartWith("/ search return open m mark y copy id e next error");
});

test("follows to the traces tab when a log opens its trace", async () => {
  await using receiver = await startTestReceiver();
  const traceId = fakeTraceId("2");
  const spanId = fakeSpanId("2a");
  await receiver.sendHttp(
    "/v1/traces",
    tracesRequest({
      service: "service-a",
      spans: [{ traceId, spanId, name: "operation-a", start: at(0), end: at(10) }],
    }),
  );
  await receiver.sendHttp(
    "/v1/logs",
    logsRequest({
      service: "service-a",
      logs: [{ time: at(5), body: "message-a", traceId, spanId }],
    }),
  );
  await using app = await renderApp(receiver);
  await app.openTab("logs");
  await app.waitForText("message-a");
  app.mockInput.pressTab();
  await app.waitForText("return open trace");

  app.mockInput.pressEnter();

  await app.waitForText("1 span");
  expect(tabStyles(await app.captureSpans())).toEqual({
    Services: { highlighted: false, fg: "muted" },
    Traces: { highlighted: false, fg: "text" },
    Metrics: { highlighted: false, fg: "muted" },
    Logs: { highlighted: false, fg: "muted" },
  });
});

test("forgets where a trace was opened from after switching tabs", async () => {
  await using receiver = await startTestReceiver();
  const traceId = fakeTraceId("2");
  await receiver.sendHttp(
    "/v1/traces",
    tracesRequest({
      service: "service-a",
      spans: [
        { traceId, spanId: fakeSpanId("2a"), name: "operation-a", start: at(0), end: at(10) },
      ],
    }),
  );
  await receiver.sendHttp(
    "/v1/logs",
    logsRequest({ service: "service-a", logs: [{ time: at(5), body: "message-a", traceId }] }),
  );
  await using app = await renderApp(receiver);
  await app.openTab("logs");
  await app.waitForText("message-a");
  app.mockInput.pressTab();
  await app.waitForText("return open trace");
  app.mockInput.pressEnter();
  await app.waitForText("1 span");

  app.mockInput.pressTab({ shift: true });
  await app.waitForFrame((frame) => !onDetails(frame));
  app.mockInput.pressArrow("right");
  await app.waitForText("Waiting for metrics...");
  app.mockInput.pressArrow("left");
  await app.waitForText("1 span");
  app.mockInput.pressTab();
  await app.waitForFrame(onDetails);
  app.mockInput.pressEscape();

  await app.waitForText("1 trace");
  expect(tabStyles(await app.captureSpans())).toMatchObject({
    Traces: { highlighted: false, fg: "text" },
  });
});

test("clears the telemetry with ctrl+l and starts the current tab over", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp(
    "/v1/traces",
    tracesRequest({
      service: "service-a",
      spans: [
        {
          traceId: fakeTraceId("3"),
          spanId: fakeSpanId("3a"),
          name: "operation-a",
          start: at(0),
          end: at(10),
        },
      ],
    }),
  );
  await using app = await renderApp(receiver);
  await app.openTab("traces");
  app.mockInput.pressTab();
  await app.waitForText("operation-a");
  app.mockInput.pressEnter();
  await app.waitForText("1 span");

  app.mockInput.pressKey("l", { ctrl: true });

  await app.waitForText("Waiting for traces...");
  expect(tabStyles(await app.captureSpans())).toMatchObject({
    Traces: { highlighted: false, fg: "text" },
  });
});

test("draws a tab whole on the frame it first shows", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/traces", otlpTraces);
  await receiver.sendHttp("/v1/logs", otlpLogs);
  await using app = await renderApp(receiver);
  await app.waitForPage("services");

  app.mockInput.pressArrow("right");
  const traces = await app.waitForPage("traces");
  expect(chartLines(traces)).not.toEqual([]);
  expect(tableRows(traces)).toHaveLength(3);

  app.mockInput.pressArrow("right");
  await app.waitForPage("metrics");
  app.mockInput.pressArrow("right");
  const logs = await app.waitForPage("logs");
  expect(chartLines(logs)).not.toEqual([]);
  expect(tableRows(logs)).not.toEqual([]);
});
