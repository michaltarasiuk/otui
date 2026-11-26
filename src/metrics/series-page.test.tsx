import { beforeEach, expect, test } from "bun:test";

import { renderPage } from "#testing/app.tsx";
import { atSecond, fakeClock } from "#testing/clock.ts";
import { CHART_DOTS } from "#testing/frame.ts";
import { DETAILS_SIZE, openMetric, renderMetricList } from "#testing/metrics.ts";
import { metricsRequest, TEMPORALITY } from "#testing/otlp.ts";
import { failedChildSpanId, failedTraceId, otlpTraces } from "#testing/traces.ts";

beforeEach(() => {
  fakeClock(atSecond(60));
});

test("draws the chart on the frame the metric first shows", async () => {
  const app = await renderMetricList({ size: DETAILS_SIZE });
  await app.selectRow("metric.b");

  app.press("return");
  const frame = await app.waitFor((frame) => frame.onDetails);

  expect(frame.text).toMatch(CHART_DOTS);
});

test("opens a counter's series with their rates and totals", async () => {
  const app = await openMetric("metric.b");

  const frame = await app.waitFor(
    (frame) => frame.hasChart && frame.lines.includes("value-b 2/s 50"),
  );

  expect(frame.list).toEqual([
    "metric.b counter",
    "● service-b unit {request} cumulative 2 series",
    "description-a",
    "attribute.a Rate Total",
    "value-a 10/s 250",
    "value-b 2/s 50",
  ]);

  const panel = frame.details;
  expect(panel.slice(0, 3)).toEqual(["value-a 12:00:30.000", "rate 10/s total 250", "Rate"]);
  expect(panel[3]).toStartWith("10/s ");
  expect(panel.slice(-8)).toEqual([
    "0/s",
    "12:00:00.000 now",
    "Attributes",
    "attribute.a value-a",
    "Resource",
    "service.name service-b",
    "Scope",
    "scope-c 1.0.0",
  ]);
});

test("shows the series picked in the table", async () => {
  const app = await openMetric("metric.b");
  await app.waitFor((frame) => frame.lines.includes("value-b 2/s 50"));

  app.press("down");
  const frame = await app.waitFor((frame) => frame.details[0] === "value-b 12:00:30.000");

  expect(frame.details[1]).toBe("rate 2/s total 50");
});

test("adds up a delta counter's points", async () => {
  const app = await openMetric("metric.a");

  const frame = await app.waitFor((frame) => frame.lines.includes("none 0.5/s 12"));

  expect(frame.list).toEqual([
    "metric.a counter",
    "● service-a delta 1 series",
    "Attributes Rate Total",
    "none 0.5/s 12",
  ]);
});

test("shows the last, lowest, and highest value of gauges and updowncounters", async () => {
  const app = await openMetric("metric.e");

  let frame = await app.waitFor((frame) => frame.lines.includes("none 1.5 MiB 1.0 MiB 2.0 MiB"));
  expect(frame.list).toEqual([
    "metric.e gauge",
    "● service-c unit By 1 series",
    "Attributes Last Min Max",
    "none 1.5 MiB 1.0 MiB 2.0 MiB",
  ]);

  app.press("escape");
  await app.waitForText("6 metrics");
  app.press("up");
  await app.waitForSelection("metric.d");
  app.press("return");
  frame = await app.waitFor((frame) => frame.lines.includes("none 8 3 8"));
  expect(frame.details[1]).toBe("last 8 min 3 max 8");
});

test("shows a histogram's percentiles, buckets, and exemplars", async () => {
  const app = await openMetric("metric.c.b");

  const frame = await app.waitFor(
    (frame) =>
      frame.text.includes("Exemplars") &&
      frame.hasChart &&
      frame.lines.includes("none 10 42.0ms 125.0ms 145.0ms 150.0ms"),
  );

  expect(frame.list).toEqual([
    "metric.c.b histogram",
    "● service-b unit s delta 1 series",
    "Attributes Count p50 p95 p99 Max",
    "none 10 42.0ms 125.0ms 145.0ms 150.0ms",
  ]);

  const panel = frame.details;
  expect(panel.slice(0, 4)).toEqual([
    "no attributes 12:00:20.000",
    "count 10 p50 42.0ms p95 125.0ms p99 145.0ms max 150.0ms",
    "Percentiles",
    "● p50 ● p95 ● p99",
  ]);
  expect(panel.filter((line) => line.includes("■")).map((line) => line.replace(/ ■+/, ""))).toEqual(
    ["≤ 10.0ms 1", "≤ 50.0ms 5", "≤ 100.0ms 3", "> 100.0ms 1"],
  );

  const exemplarsIndex = panel.indexOf("Exemplars");
  expect(panel.slice(exemplarsIndex, exemplarsIndex + 3)).toEqual([
    "Exemplars",
    `12:00:19.000 140.0ms ${failedTraceId} ${failedChildSpanId} (not stored)`,
    "12:00:09.000 75.0ms no trace",
  ]);
});

test("shows an exponential histogram's buckets", async () => {
  const app = await openMetric("metric.c.a");

  const frame = await app.waitForText("Buckets");

  expect(frame.details[1]).toBe("count 6 p50 1.3 KiB p95 1.9 KiB p99 2.0 KiB max");
  expect(
    frame.details.filter((line) => line.includes("■")).map((line) => line.replace(/ ■+/, "")),
  ).toEqual(["≤ 1.0 KiB 2", "≤ 2.0 KiB 4"]);
});

test("waits for a second export before plotting a counter's rate", async () => {
  const app = await renderPage("metrics", {
    size: DETAILS_SIZE,
    send: [
      metricsRequest({
        service: "service-a",
        metrics: [
          {
            name: "metric.a",
            monotonic: true,
            temporality: TEMPORALITY.cumulative,
            sum: [{ start: atSecond(0), time: atSecond(10), value: 5 }],
          },
        ],
      }),
    ],
  });
  await app.waitFor((frame) => frame.tableRows.length === 1);

  app.press("return");

  const frame = await app.waitForText("Not enough data points");
  expect(frame.details.slice(0, 2)).toEqual(["no attributes 12:00:10.000", "rate total 5"]);
});

test("goes back to the list with the opened metric still selected", async () => {
  const app = await openMetric("metric.a");

  app.press("escape");
  await app.waitForText("6 metrics");

  await app.waitForSelection("metric.a");
});

test("adds up a delta updowncounter's changes", async () => {
  const app = await renderPage("metrics", {
    size: DETAILS_SIZE,
    send: [
      metricsRequest({
        service: "service-a",
        metrics: [
          {
            name: "metric.a",
            unit: "{request}",
            monotonic: false,
            temporality: TEMPORALITY.delta,
            sum: [
              { start: atSecond(0), time: atSecond(10), value: 2 },
              { start: atSecond(10), time: atSecond(20), value: -1 },
              { start: atSecond(20), time: atSecond(30), value: 3 },
            ],
          },
        ],
      }),
    ],
  });
  await app.waitFor((frame) => frame.tableRows.length === 1);

  app.press("return");

  const frame = await app.waitFor((frame) => frame.hasChart && frame.lines.includes("none 4 1 4"));
  const panel = frame.details;
  expect(panel.slice(0, 3)).toEqual(["no attributes 12:00:30.000", "last 4 min 1 max 4", "Value"]);
  expect(panel[3]).toStartWith("4 ");
  expect(panel).toContain("12:00:00.000 now");
});

test("opens a delta histogram that exports no buckets", async () => {
  const app = await renderPage("metrics", {
    size: DETAILS_SIZE,
    send: [
      metricsRequest({
        service: "service-a",
        metrics: [
          {
            name: "metric.a",
            unit: "s",
            temporality: TEMPORALITY.delta,
            histogram: [
              { start: atSecond(0), time: atSecond(10), count: 3, bounds: [], counts: [] },
              { start: atSecond(10), time: atSecond(20), count: 2, bounds: [], counts: [] },
            ],
          },
        ],
      }),
    ],
  });
  await app.waitFor((frame) => frame.tableRows.length === 1);

  app.press("return");

  const frame = await app.waitFor((frame) => frame.lines.includes("none 5"));
  expect(frame.details.slice(0, 2)).toEqual([
    "no attributes 12:00:20.000",
    "count 5 p50 p95 p99 max",
  ]);
});

test("scrolls the series panel down and back up", async () => {
  const app = await renderMetricList();
  await app.selectRow("metric.c.b");
  app.press("return");
  await app.waitFor((frame) => frame.details.includes("Exemplars") && frame.hasChart);

  app.press("ctrl+d");
  await app.waitFor((frame) => !frame.details.includes("Percentiles"));

  app.press("ctrl+u");
  await app.waitFor((frame) => frame.details.includes("Percentiles"));
});

test("says when an open metric is no longer available", async () => {
  const app = await openMetric("metric.a");
  await app.waitFor((frame) => frame.lines.includes("none 0.5/s 12"));

  await app.receiver.run("DELETE FROM otlp_metrics_sum WHERE name = 'metric.a'");

  await app.waitForText("This metric is no longer available");
});

test("opens an exemplar's trace from the exemplars region and comes back", async () => {
  const app = await openMetric("metric.c.b", { send: [otlpTraces] });
  const frame = await app.waitFor((frame) => frame.details.includes("Exemplars"));
  expect(frame.hints).not.toContain("open trace");

  app.press("tab");
  await app.waitFor((frame) => frame.hints.includes("return open trace"));
  app.press("return");

  expect(await app.waitForSelection("operation-e")).toBe("● service-d operation-e 300.0ms");
  app.press("escape");
  const back = await app.waitForText("metric.c.b");
  expect(back.hints).toContain("return open trace");

  app.press("tab");
  await app.waitFor((frame) => frame.hints === "tab next region ? help");
});

test("moves into the exemplars when one is clicked", async () => {
  const app = await openMetric("metric.c.b", { send: [otlpTraces] });
  const frame = await app.waitFor((frame) => frame.details.includes("Exemplars"));
  const exemplarLine = frame.lineOf("2b2b2b2b");

  await app.mockMouse.click(20, exemplarLine);

  await app.waitFor((frame) => frame.hints.includes("return open trace"));
});

test("narrows the chart to a shorter window and back", async () => {
  const app = await openMetric("metric.a");
  await app.waitFor((frame) => frame.details.includes("Rate"));

  app.press("w");
  await app.waitFor((frame) => frame.details.includes("Rate · last 15 min"));
  app.press("w");
  await app.waitFor((frame) => frame.details.includes("Rate · last 5 min"));
  app.press("shift+w");

  await app.waitFor((frame) => frame.details.includes("Rate · last 15 min"));
});
