import { type AppOptions, renderPage } from "./app.tsx";
import { at } from "./clock.ts";
import { fakeSpanId, fakeTraceId, SPAN_KIND, STATUS_CODE, tracesRequest } from "./otlp.ts";
import type { TestReceiver } from "./receiver.ts";
import { onDetails, pageHeader, spanDiffRows, tableRows } from "./screen.ts";

export const nestedTraceId = fakeTraceId("1");
export const failedTraceId = fakeTraceId("2");
export const singleTraceId = fakeTraceId("3");
export const rootlessTraceId = fakeTraceId("4");
export const missingParentId = fakeSpanId("5");
export const slowNestedTraceId = fakeTraceId("6");

export const nestedRootSpanId = fakeSpanId("1a");
export const nestedChildSpanId = fakeSpanId("1b");
export const failedRootSpanId = fakeSpanId("2a");
export const failedChildSpanId = fakeSpanId("2b");

export const ERROR_CAUSE = "error-a";
export const ERROR_MESSAGE = `error-b: ${ERROR_CAUSE}`;

export const NESTED_ROW = "12:00:00.000 ● service-a operation-a 3 120.0ms";
export const FAILED_ROW = "12:00:01.000 ● service-c operation-d 3 2 500.0ms";
export const SINGLE_ROW = "12:00:02.000 ● service-f operation-g 1 1.0ms";
export const SLOW_NESTED_ROW = "12:00:04.000 ● service-a operation-a 4 300.0ms";

export const NEWEST_FIRST = [SINGLE_ROW, FAILED_ROW, NESTED_ROW];
export const WITH_SLOW_NESTED = [SLOW_NESTED_ROW, ...NEWEST_FIRST];

export const otlpTraces = tracesRequest(
  {
    service: "service-a",
    attributes: { "resource.a": "value-a" },
    scope: { name: "scope-a", version: "1.0.0" },
    spans: [
      {
        traceId: nestedTraceId,
        spanId: nestedRootSpanId,
        name: "operation-a",
        kind: SPAN_KIND.server,
        start: at(0),
        end: at(120),
        attributes: { "attribute.a": "value-a" },
      },
    ],
  },
  {
    service: "service-b",
    spans: [
      {
        traceId: nestedTraceId,
        spanId: nestedChildSpanId,
        parentSpanId: nestedRootSpanId,
        name: "operation-b",
        kind: SPAN_KIND.server,
        start: at(10),
        end: at(90),
        events: [
          { name: "event-a", time: at(8) },
          { name: "event-b", time: at(15), attributes: { "attribute.b": "value-b" } },
          { name: "event-c" },
        ],
      },
      {
        traceId: nestedTraceId,
        spanId: fakeSpanId("1c"),
        parentSpanId: nestedChildSpanId,
        name: "operation-c",
        kind: SPAN_KIND.client,
        start: at(20),
        end: at(80),
        attributes: { "db.system.name": "peer-a" },
      },
    ],
  },
  {
    service: "service-c",
    spans: [
      {
        traceId: failedTraceId,
        spanId: failedRootSpanId,
        name: "operation-d",
        kind: SPAN_KIND.server,
        start: at(1000),
        end: at(1450),
        status: { code: STATUS_CODE.error, message: ERROR_MESSAGE },
        links: [
          { traceId: nestedTraceId, spanId: nestedRootSpanId, attributes: { "attribute.c": 4 } },
        ],
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
        kind: SPAN_KIND.client,
        start: at(1100),
        end: at(1400),
        status: { code: STATUS_CODE.error, message: ERROR_CAUSE },
      },
    ],
  },
  {
    service: "service-e",
    spans: [
      {
        traceId: failedTraceId,
        spanId: fakeSpanId("2c"),
        parentSpanId: missingParentId,
        name: "operation-f",
        kind: SPAN_KIND.consumer,
        start: at(1460),
        end: at(1500),
      },
    ],
  },
  {
    service: "service-f",
    spans: [
      {
        traceId: singleTraceId,
        spanId: fakeSpanId("3a"),
        name: "operation-g",
        start: at(2000),
        end: at(2001),
      },
    ],
  },
  {
    service: "service-g",
    spans: [
      {
        traceId: rootlessTraceId,
        spanId: fakeSpanId("4b"),
        parentSpanId: fakeSpanId("4a"),
        name: "operation-h",
        start: at(3000),
        end: at(3100),
      },
    ],
  },
);

export async function renderTraceList(receiver: TestReceiver, options?: AppOptions) {
  await receiver.sendHttp("/v1/traces", otlpTraces);
  const app = await renderPage(receiver, "traces", options);
  await app.waitForFrame((frame) => tableRows(frame).length === NEWEST_FIRST.length);
  return app;
}

export async function openTrace(receiver: TestReceiver, row: string, options?: AppOptions) {
  const app = await renderTraceList(receiver, options);
  await app.selectRow(row);
  app.mockInput.pressEnter();
  await app.waitForFrame(onDetails);
  return app;
}

export const slowNestedTraces = tracesRequest(
  {
    service: "service-a",
    spans: [
      {
        traceId: slowNestedTraceId,
        spanId: fakeSpanId("6a"),
        name: "operation-a",
        kind: SPAN_KIND.server,
        start: at(4000),
        end: at(4300),
      },
    ],
  },
  {
    service: "service-b",
    spans: [
      {
        traceId: slowNestedTraceId,
        spanId: fakeSpanId("6b"),
        parentSpanId: fakeSpanId("6a"),
        name: "operation-b",
        kind: SPAN_KIND.server,
        start: at(4010),
        end: at(4250),
      },
      {
        traceId: slowNestedTraceId,
        spanId: fakeSpanId("6c"),
        parentSpanId: fakeSpanId("6b"),
        name: "operation-c",
        kind: SPAN_KIND.client,
        start: at(4020),
        end: at(4080),
      },
      {
        traceId: slowNestedTraceId,
        spanId: fakeSpanId("6d"),
        parentSpanId: fakeSpanId("6b"),
        name: "operation-c",
        kind: SPAN_KIND.client,
        start: at(4100),
        end: at(4240),
      },
    ],
  },
);

export async function renderComparison(receiver: TestReceiver, options?: AppOptions) {
  await receiver.sendHttp("/v1/traces", otlpTraces);
  await receiver.sendHttp("/v1/traces", slowNestedTraces);
  const app = await renderPage(receiver, "traces", options);
  await app.waitForRows(WITH_SLOW_NESTED);
  await app.selectRow(NESTED_ROW);
  app.mockInput.pressKey("m");
  await app.waitForFrame((frame) => pageHeader(frame).includes("vs operation-a 120.0ms"));
  await app.selectRow(SLOW_NESTED_ROW);
  app.mockInput.pressKey("v");
  await app.waitForFrame((frame) => spanDiffRows(frame).length > 0);
  return app;
}
