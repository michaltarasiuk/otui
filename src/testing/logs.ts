import { type AppOptions, renderPage } from "./app.tsx";
import { at } from "./clock.ts";
import { logsRequest, SEVERITY_NUMBER, tracesRequest } from "./otlp.ts";
import { failedChildSpanId, failedRootSpanId, failedTraceId } from "./traces.ts";

export const otlpLogs = logsRequest(
  {
    service: "service-c",
    attributes: { "resource.a": "value-a" },
    scope: { name: "scope-a" },
    logs: [
      {
        time: at(0),
        severityNumber: SEVERITY_NUMBER.info,
        body: "message-a",
        traceId: failedTraceId,
        spanId: failedRootSpanId,
        attributes: { "attribute.a": "value-a" },
      },
    ],
  },
  {
    service: "service-d",
    logs: [
      {
        time: at(1000),
        severityNumber: SEVERITY_NUMBER.warn,
        severityText: "warn",
        body: "message-b",
        traceId: failedTraceId,
        spanId: failedChildSpanId,
        attributes: { "attribute.b": "value-b" },
      },
      {
        time: at(2000),
        severityNumber: SEVERITY_NUMBER.error,
        body: "message-c",
        traceId: failedTraceId,
        spanId: failedChildSpanId,
      },
    ],
  },
  {
    service: "service-h",
    logs: [
      {
        time: at(3000),
        severityNumber: SEVERITY_NUMBER.debug,
        body: '{"field-a":"value-a","field-b":200}',
      },
    ],
  },
  {
    service: "service-i",
    logs: [
      {
        time: at(5000),
        severityNumber: SEVERITY_NUMBER.info,
        eventName: "event-a",
        body: "message-e\n  second line",
      },
    ],
  },
  {
    service: "service-j",
    logs: [{ observedTime: at(6000), severityText: "notice", body: "message-f" }],
  },
  {
    service: "service-k",
    logs: [{ time: at(4000), severityNumber: SEVERITY_NUMBER.fatal, body: "message-g" }],
  },
);

export const failedTrace = tracesRequest(
  {
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
  },
  {
    service: "service-d",
    spans: [
      {
        traceId: failedTraceId,
        spanId: failedChildSpanId,
        parentSpanId: failedRootSpanId,
        name: "operation-e",
        start: at(500),
        end: at(2000),
      },
    ],
  },
);

export async function renderLogList({ send = [], ...options }: AppOptions = {}) {
  const app = await renderPage("logs", { ...options, send: [otlpLogs, ...send] });
  await app.waitFor((frame) => frame.tableRows.length === 7);
  return app;
}
