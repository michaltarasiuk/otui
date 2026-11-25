import { expect, test } from "bun:test";

import { at, fakeClock } from "#testing/clock.ts";
import { startTestMcp } from "#testing/mcp.ts";
import { logsRequest, metricsRequest, SEVERITY_NUMBER, TEMPORALITY } from "#testing/otlp.ts";
import { startTestReceiver } from "#testing/receiver.ts";
import {
  nestedRootSpanId,
  nestedTraceId,
  ERROR_MESSAGE,
  failedTraceId,
  otlpTraces,
  failedRootSpanId,
  slowNestedTraceId,
  slowNestedTraces,
  singleTraceId,
} from "#testing/traces.ts";
import { StartupError } from "#utils/startup-error.ts";

import { startMcpServer } from "./mcp-server.ts";

test("lists read-only tools for each view", async () => {
  await using receiver = await startTestReceiver();
  await using mcp = await startTestMcp(receiver);

  const { tools } = await mcp.client.listTools();

  expect(tools.map((tool) => tool.name).toSorted()).toEqual([
    "compare_traces",
    "get_metric",
    "get_service_map",
    "get_span",
    "get_trace",
    "list_logs",
    "list_metrics",
    "list_operations",
    "list_services",
    "list_traces",
  ]);
  expect(tools.every((tool) => tool.annotations?.readOnlyHint === true)).toBe(true);
  expect(mcp.client.getInstructions()).toContain("list_traces gives trace IDs");
});

test("serves clients of the 2025 protocol", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/traces", otlpTraces);
  await using mcp = await startTestMcp(receiver, "legacy");

  const outline = await mcp.callText("get_trace", { trace_id: singleTraceId });

  expect(outline).toStartWith(`trace ${singleTraceId}: `);
});

test("rejects arguments a tool doesn't take", async () => {
  await using receiver = await startTestReceiver();
  await using mcp = await startTestMcp(receiver);

  const result = await mcp.call("list_traces", { service_name: "service-a" });

  expect(result).toMatchObject({
    isError: true,
    texts: [expect.stringContaining('Unrecognized key: "service_name"')],
  });
});

test("lists traces with the same search as the app", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/traces", otlpTraces);
  await using mcp = await startTestMcp(receiver);

  expect(await mcp.callJson("list_traces")).toEqual([
    expect.objectContaining({ trace_id: singleTraceId }),
    expect.objectContaining({ trace_id: failedTraceId }),
    expect.objectContaining({ trace_id: nestedTraceId }),
  ]);
  expect(await mcp.callJson("list_traces", { search: "duration>200ms" })).toEqual([
    expect.objectContaining({ trace_id: failedTraceId, error_count: 2 }),
  ]);
});

test("says when more traces match than the limit", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/traces", otlpTraces);
  await using mcp = await startTestMcp(receiver);

  const { texts } = await mcp.call("list_traces", { limit: 2 });

  const [json = "", note] = texts;
  expect(JSON.parse(json)).toHaveLength(2);
  expect(note).toBe(
    "More traces match than the 2 shown. Narrow the search, or raise limit up to 200.",
  );
});

test("reports a trace it doesn't store as a tool error", async () => {
  await using receiver = await startTestReceiver();
  await using mcp = await startTestMcp(receiver);

  const result = await mcp.call("get_trace", { trace_id: singleTraceId });

  expect(result).toEqual({
    isError: true,
    texts: [
      `No spans stored for trace ${singleTraceId}. list_traces returns the stored trace IDs.`,
    ],
  });
});

test("outlines a trace's spans with the critical path and errors", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/traces", otlpTraces);
  await using mcp = await startTestMcp(receiver);

  const outline = await mcp.callText("get_trace", { trace_id: failedTraceId });

  const lines = outline.split("\n");
  expect(lines[0]).toBe(`trace ${failedTraceId}: 3 spans, 500.0ms, 2 with errors`);
  expect(lines).toContain(
    `* operation-d [service-c, server] 450.0ms at +0µs ${failedRootSpanId} ERROR: ${ERROR_MESSAGE}`,
  );
  expect(lines.some((line) => line.startsWith("*   operation-e [service-d, client] 300.0ms"))).toBe(
    true,
  );
});

test("compares two traces by self time", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/traces", otlpTraces);
  await receiver.sendHttp("/v1/traces", slowNestedTraces);
  await using mcp = await startTestMcp(receiver);

  const comparison = await mcp.callJson("compare_traces", {
    before_trace_id: nestedTraceId,
    after_trace_id: slowNestedTraceId,
  });

  expect(comparison).toMatchObject({
    before: { trace_id: nestedTraceId, duration_ms: 120, span_count: 3, error_count: 0 },
    after: { trace_id: slowNestedTraceId, duration_ms: 300, span_count: 4, error_count: 0 },
    changed_spans: [
      { name: "operation-a", change: "changed", self_delta_ms: 20 },
      { name: "operation-b", change: "changed", self_delta_ms: 20 },
      { name: "operation-c", change: "added", before_span_id: null, self_delta_ms: 140 },
    ],
    changed_spans_left_out: 0,
    operations: [
      { name: "operation-c", before_count: 1, after_count: 2, after_self_ms: 200 },
      { name: "operation-a" },
      { name: "operation-b" },
    ],
  });
});

test("refuses to compare traces with different root spans", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/traces", otlpTraces);
  await using mcp = await startTestMcp(receiver);

  const result = await mcp.call("compare_traces", {
    before_trace_id: nestedTraceId,
    after_trace_id: failedTraceId,
  });

  expect(result).toMatchObject({
    isError: true,
    texts: [expect.stringContaining("The traces start with different root spans")],
  });
});

test("reads a span's attributes and resource", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/traces", otlpTraces);
  await using mcp = await startTestMcp(receiver);

  const span = await mcp.callJson("get_span", {
    trace_id: nestedTraceId,
    span_id: nestedRootSpanId,
  });

  expect(span).toMatchObject({
    attributes: { "attribute.a": "value-a" },
    resource: { "service.name": "service-a", "resource.a": "value-a" },
  });
});

test("lists services and their operations", async () => {
  fakeClock(at(60_000));
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/traces", otlpTraces);
  await using mcp = await startTestMcp(receiver);

  const services = await mcp.callJson("list_services");
  const operations = await mcp.callJson("list_operations", { service: "service-c" });

  expect(services).toContainEqual(expect.objectContaining({ service_name: "service-c" }));
  expect(operations).toEqual([expect.objectContaining({ name: "operation-d", error_ratio: 1 })]);
});

test("maps calls between services and to external peers", async () => {
  fakeClock(at(60_000));
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/traces", otlpTraces);
  await using mcp = await startTestMcp(receiver);

  const calls = await mcp.callJson("get_service_map");

  expect(calls).toEqual([
    expect.objectContaining({ caller: "service-a", callee: "service-b", is_external: false }),
    expect.objectContaining({ caller: "service-b", callee: "peer-a", is_external: true }),
    expect.objectContaining({ caller: "service-c", callee: "service-d", error_ratio: 1 }),
  ]);
});

test("lists logs at or above a severity", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp(
    "/v1/logs",
    logsRequest({
      service: "service-a",
      logs: [
        { time: new Date(), body: "message-a", severityNumber: SEVERITY_NUMBER.info },
        { time: new Date(), body: "message-b", severityNumber: SEVERITY_NUMBER.error },
      ],
    }),
  );
  await using mcp = await startTestMcp(receiver);

  const logs = await mcp.callJson("list_logs", { min_severity: "WARN" });

  expect(logs).toEqual([
    expect.objectContaining({ severity: "ERROR", service: "service-a", body: "message-b" }),
  ]);
});

test("reads a metric's series", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp(
    "/v1/metrics",
    metricsRequest({
      service: "service-a",
      metrics: [
        {
          name: "metric.a",
          gauge: [
            { time: new Date(Date.now() - 1000), value: 4 },
            { time: new Date(), value: 6 },
          ],
        },
      ],
    }),
  );
  await using mcp = await startTestMcp(receiver);

  const metrics = await mcp.callJson("get_metric", { name: "metric.a" });

  expect(metrics).toEqual([
    expect.objectContaining({
      name: "metric.a",
      type: "gauge",
      service: "service-a",
      series: [expect.objectContaining({ last: 6, min: 4, max: 6 })],
    }),
  ]);
});

test("reads a counter's rate and total like the app", async () => {
  await using receiver = await startTestReceiver();
  const start = new Date(Date.now() - 30_000);
  await receiver.sendHttp(
    "/v1/metrics",
    metricsRequest({
      service: "service-a",
      metrics: [
        {
          name: "metric.a",
          sum: [
            { start, time: new Date(start.getTime() + 10_000), value: 10 },
            { start, time: new Date(start.getTime() + 20_000), value: 30 },
          ],
          monotonic: true,
          temporality: TEMPORALITY.cumulative,
        },
      ],
    }),
  );
  await using mcp = await startTestMcp(receiver);

  const metrics = await mcp.callJson("get_metric", { name: "metric.a" });

  expect(metrics).toEqual([
    expect.objectContaining({
      type: "counter",
      series: [expect.objectContaining({ rate_per_second: 2, total: 30 })],
    }),
  ]);
});

test("finds a metric by its exact name among many that contain it", async () => {
  await using receiver = await startTestReceiver();
  const containing = Array.from({ length: 600 }, (_, index) => ({
    name: `metric.a.${index}`,
    gauge: [{ time: new Date(), value: index }],
  }));
  const exact = { name: "metric.a", gauge: [{ time: new Date(), value: 7 }] };
  await receiver.sendHttp(
    "/v1/metrics",
    metricsRequest({ service: "service-a", metrics: [...containing, exact] }),
  );
  await using mcp = await startTestMcp(receiver);

  const metrics = await mcp.callJson("get_metric", { name: "metric.a" });

  expect(metrics).toEqual([
    expect.objectContaining({ name: "metric.a", series: [expect.objectContaining({ last: 7 })] }),
  ]);
});

test("refuses requests from other hosts and origins", async () => {
  await using receiver = await startTestReceiver();
  await using mcp = await startTestMcp(receiver);
  const ping = { jsonrpc: "2.0", id: 1, method: "ping" };
  const headers = {
    "content-type": "application/json",
    accept: "application/json, text/event-stream",
  };

  const foreignOrigin = await fetch(mcp.url, {
    method: "POST",
    headers: { ...headers, origin: "http://evil.example" },
    body: JSON.stringify(ping),
  });
  const foreignHost = await fetch(mcp.url, {
    method: "POST",
    headers: { ...headers, host: "evil.example" },
    body: JSON.stringify(ping),
  });

  expect(foreignOrigin.status).toBe(403);
  expect(foreignHost.status).toBe(403);
});

test("names the port when it can't serve on it", async () => {
  await using receiver = await startTestReceiver();
  await using mcp = await startTestMcp(receiver);
  const { port } = new URL(mcp.url);

  const connection = await receiver.connect();

  expect(() => startMcpServer({ connection, port: Number(port), version: "0.0.0" })).toThrow(
    StartupError,
  );
});
