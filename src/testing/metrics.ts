import { renderPage } from "./app.tsx";
import { atSecond } from "./clock.ts";
import { metricsRequest, TEMPORALITY } from "./otlp.ts";
import type { TestReceiver } from "./receiver.ts";
import { onDetails, tableRows } from "./screen.ts";
import { failedChildSpanId, failedTraceId } from "./traces.ts";

export const DETAILS_SIZE = { width: 120, height: 45 };

function counterPoints(value: string, values: number[]) {
  return values.map((total, index) => ({
    attributes: { "attribute.a": value },
    start: atSecond(0),
    time: atSecond(10 * (index + 1)),
    value: total,
  }));
}

export const otlpMetrics = metricsRequest(
  {
    service: "service-a",
    scope: { name: "scope-a" },
    metrics: [
      {
        name: "metric.a",
        monotonic: true,
        temporality: TEMPORALITY.delta,
        sum: [
          { start: atSecond(0), time: atSecond(10), value: 3 },
          { start: atSecond(10), time: atSecond(20), value: 4 },
          { start: atSecond(20), time: atSecond(30), value: 5 },
        ],
      },
    ],
  },
  {
    service: "service-a",
    scope: { name: "scope-b", version: "1.0.0" },
    metrics: [
      {
        name: "metric.c.a",
        unit: "By",
        temporality: TEMPORALITY.cumulative,
        exponentialHistogram: [
          {
            start: atSecond(0),
            time: atSecond(10),
            count: 3,
            scale: 0,
            positive: { offset: 9, counts: [1, 2] },
          },
          {
            start: atSecond(0),
            time: atSecond(20),
            count: 6,
            scale: 0,
            positive: { offset: 9, counts: [2, 4] },
          },
        ],
      },
    ],
  },
  {
    service: "service-b",
    scope: { name: "scope-c", version: "1.0.0" },
    metrics: [
      {
        name: "metric.b",
        unit: "{request}",
        description: "description-a",
        monotonic: true,
        temporality: TEMPORALITY.cumulative,
        sum: [
          ...counterPoints("value-a", [100, 150, 250]),
          ...counterPoints("value-b", [20, 30, 50]),
        ],
      },
    ],
  },
  {
    service: "service-b",
    scope: { name: "scope-d" },
    metrics: [
      {
        name: "metric.c.b",
        unit: "s",
        temporality: TEMPORALITY.delta,
        histogram: [
          {
            start: atSecond(0),
            time: atSecond(10),
            count: 5,
            sum: 0.15,
            min: 0.005,
            max: 0.08,
            bounds: [0.01, 0.05, 0.1],
            counts: [1, 3, 1, 0],
            exemplars: [{ time: atSecond(9), value: 0.075 }],
          },
          {
            start: atSecond(10),
            time: atSecond(20),
            count: 5,
            sum: 0.4,
            min: 0.02,
            max: 0.15,
            bounds: [0.01, 0.05, 0.1],
            counts: [0, 2, 2, 1],
            exemplars: [
              {
                time: atSecond(19),
                value: 0.14,
                traceId: failedTraceId,
                spanId: failedChildSpanId,
              },
            ],
          },
        ],
      },
    ],
  },
  {
    service: "service-b",
    scope: { name: "scope-e", version: "1.0.0" },
    metrics: [
      {
        name: "metric.d",
        unit: "{thread}",
        monotonic: false,
        temporality: TEMPORALITY.cumulative,
        sum: [
          { start: atSecond(0), time: atSecond(10), value: 5 },
          { start: atSecond(0), time: atSecond(20), value: 3 },
          { start: atSecond(0), time: atSecond(30), value: 8 },
        ],
      },
    ],
  },
  {
    service: "service-c",
    scope: { name: "scope-f", version: "1.0.0" },
    metrics: [
      {
        name: "metric.e",
        unit: "By",
        gauge: [
          { time: atSecond(10), value: 1_048_576 },
          { time: atSecond(20), value: 2_097_152 },
          { time: atSecond(30), value: 1_572_864 },
        ],
      },
    ],
  },
);

export const DELTA_COUNTER_ROW = "12:00:30.000 ● service-a metric.a counter 1";
export const COUNTER_ROW = "12:00:30.000 ● service-b metric.b counter {request} 2";
export const EXP_HISTOGRAM_ROW = "12:00:20.000 ● service-a metric.c.a exp histogram By 1";
export const HISTOGRAM_ROW = "12:00:20.000 ● service-b metric.c.b histogram s 1";
export const UPDOWNCOUNTER_ROW = "12:00:30.000 ● service-b metric.d updowncounter {thread} 1";
export const GAUGE_ROW = "12:00:30.000 ● service-c metric.e gauge By 1";

export const BY_NAME = [
  DELTA_COUNTER_ROW,
  COUNTER_ROW,
  EXP_HISTOGRAM_ROW,
  HISTOGRAM_ROW,
  UPDOWNCOUNTER_ROW,
  GAUGE_ROW,
];

interface ListOptions {
  size?: { width: number; height: number };
}

export async function renderMetricList(receiver: TestReceiver, { size }: ListOptions = {}) {
  await receiver.sendHttp("/v1/metrics", otlpMetrics);
  const app = await renderPage(receiver, "metrics", { size });
  await app.waitForFrame((frame) => tableRows(frame).length === BY_NAME.length);
  return app;
}

export async function openMetric(receiver: TestReceiver, row: string) {
  const app = await renderMetricList(receiver, { size: DETAILS_SIZE });
  await app.selectRow(row);
  app.mockInput.pressEnter();
  await app.waitForFrame(onDetails);
  return app;
}
