import { beforeEach, expect, test } from "bun:test";

import metricList from "#metrics/sql/metric-list.sql" with { type: "text" };
import { renderFailedPage, renderPage } from "#testing/app.tsx";
import { atSecond, fakeClock } from "#testing/clock.ts";
import type { Key } from "#testing/key.ts";
import { otlpMetrics, renderMetricList } from "#testing/metrics.ts";
import { metricsRequest } from "#testing/otlp.ts";

beforeEach(() => {
  fakeClock(atSecond(60));
});

test("waits for metrics before any arrive", async () => {
  const app = await renderPage("metrics");

  const frame = await app.waitForText("Waiting for metrics...");

  expect(frame.text).toContain("0 metrics");
});

test("lists metrics by name with their type, unit, and series count", async () => {
  const app = await renderMetricList();

  const frame = await app.waitForText("6 metrics");

  expect(frame.lines).toContain("Time Service Name ▲ Type Unit Series");
  expect(frame.tableRows).toEqual([
    "12:00:30.000 ● service-a metric.a counter 1",
    "12:00:30.000 ● service-b metric.b counter {request} 2",
    "12:00:20.000 ● service-a metric.c.a exp histogram By 1",
    "12:00:20.000 ● service-b metric.c.b histogram s 1",
    "12:00:30.000 ● service-b metric.d updowncounter {thread} 1",
    "12:00:30.000 ● service-c metric.e gauge By 1",
  ]);
});

test("sorts by series count, last update, and name", async () => {
  const app = await renderMetricList();

  async function pressSortKey(key: Key, header: string, rows: string[]) {
    app.press(key);
    const frame = await app.waitForRows(rows);
    expect(frame.lines).toContain(header);
  }

  await pressSortKey("o", "Time Service Name Type Unit ▼ Series", [
    "metric.b",
    "metric.a",
    "metric.c.a",
    "metric.c.b",
    "metric.d",
    "metric.e",
  ]);
  await pressSortKey("o", "Time ▼ Service Name Type Unit Series", [
    "metric.a",
    "metric.b",
    "metric.d",
    "metric.e",
    "metric.c.a",
    "metric.c.b",
  ]);
  await pressSortKey("o", "Time Service Name ▲ Type Unit Series", [
    "metric.a",
    "metric.b",
    "metric.c.a",
    "metric.c.b",
    "metric.d",
    "metric.e",
  ]);
  await pressSortKey("shift+o", "Time Service Name ▼ Type Unit Series", [
    "metric.e",
    "metric.d",
    "metric.c.b",
    "metric.c.a",
    "metric.b",
    "metric.a",
  ]);
});

test("searches names, descriptions, attribute values, and key=value pairs", async () => {
  const app = await renderMetricList();

  async function expectSearch(text: string, rows: string[]) {
    await app.search(text);
    const frame = await app.waitForRows(rows);
    expect(frame.text).toContain(`${rows.length} of 6 metrics`);
    app.press("escape");
    await app.waitFor((frame) => frame.tableRows.length === 6);
  }

  await expectSearch("metric.c.a", ["metric.c.a"]);
  await expectSearch("description-a", ["metric.b"]);
  await expectSearch("value-b", ["metric.b"]);
  await expectSearch("attribute.a=value-a", ["metric.b"]);
});

test("keeps an applied search while browsing", async () => {
  const app = await renderMetricList();

  await app.search("metric.c");
  await app.waitFor((frame) => frame.tableRows.length === 2);
  app.press("return");
  await app.waitFor((frame) => frame.onList);

  app.press("down");

  await app.waitForSelection("metric.c.b");
  const frame = await app.waitFor((frame) => frame.header === "2 of 6 metrics");
  expect(frame.hints).toStartWith("/metric.c ");
});

test("summarizes the selected metric's attribute values", async () => {
  const app = await renderMetricList();

  app.press("down");
  const frame = await app.waitFor((frame) => frame.details.includes("scope-c 1.0.0"));

  expect(frame.details).toEqual([
    "metric.b counter",
    "● service-b unit {request} cumulative 2 series",
    "description-a",
    "Attributes",
    "attribute.a value-a, value-b",
    "Resource",
    "service.name service-b",
    "Scope",
    "scope-c 1.0.0",
  ]);
});

test("lists a few attribute values and counts the rest", async () => {
  const values = ["0", "1", "2", "3", "4"];
  const app = await renderPage("metrics", {
    send: [
      metricsRequest({
        service: "service-a",
        metrics: [
          {
            name: "metric.a",
            unit: "1",
            gauge: values.map((value) => ({
              attributes: { "attribute.a": value },
              time: atSecond(10),
              value: 0.5,
            })),
          },
        ],
      }),
    ],
  });

  const frame = await app.waitForText("Attributes");

  expect(frame.details).toContain("attribute.a 0, 1, 2 and 2 more");
});

test("scrolls the metric panel down and back up", async () => {
  const attributes = Object.fromEntries(
    Array.from({ length: 30 }, (_, index) => [`attribute.${index + 1}`, "value-a"]),
  );
  const app = await renderPage("metrics", {
    send: [
      metricsRequest({
        service: "service-a",
        metrics: [{ name: "metric.a", gauge: [{ attributes, time: atSecond(10), value: 1 }] }],
      }),
    ],
  });
  await app.waitFor((frame) => frame.details.includes("attribute.1 value-a"));

  app.press("ctrl+d");
  await app.waitFor((frame) => !frame.details.includes("attribute.1 value-a"));

  app.press("ctrl+u");
  await app.waitFor((frame) => frame.details.includes("attribute.1 value-a"));
});

test("shows an error when metrics cannot be loaded and retries", async () => {
  const app = await renderFailedPage("metrics", { send: [otlpMetrics], failOnce: metricList });
  await app.waitForText("Failed to load metrics");
  app.press("r");

  await app.waitForRows([
    "metric.a",
    "metric.b",
    "metric.c.a",
    "metric.c.b",
    "metric.d",
    "metric.e",
  ]);
});
