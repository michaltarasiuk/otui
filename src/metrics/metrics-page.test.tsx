import { beforeEach, expect, test } from "bun:test";

import metricList from "#metrics/sql/metric-list.sql" with { type: "text" };
import { renderFailedPage, renderPage } from "#testing/app.tsx";
import { atSecond, fakeClock } from "#testing/clock.ts";
import { failOnce } from "#testing/connection.ts";
import { silenceConsoleError } from "#testing/console.ts";
import {
  EXP_HISTOGRAM_ROW,
  BY_NAME,
  HISTOGRAM_ROW,
  COUNTER_ROW,
  GAUGE_ROW,
  DELTA_COUNTER_ROW,
  otlpMetrics,
  renderMetricList,
  UPDOWNCOUNTER_ROW,
} from "#testing/metrics.ts";
import { metricsRequest } from "#testing/otlp.ts";
import { startTestReceiver } from "#testing/receiver.ts";
import {
  detailsLines,
  keyHints,
  onList,
  pageHeader,
  tableRows,
  textLines,
} from "#testing/screen.ts";

beforeEach(() => {
  fakeClock(atSecond(60));
});

test("waits for metrics before any arrive", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderPage(receiver, "metrics");

  const frame = await app.waitForText("Waiting for metrics...");

  expect(frame).toContain("0 metrics");
});

test("lists metrics by name with their type, unit, and series count", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderMetricList(receiver);

  const frame = await app.waitForText("6 metrics");

  expect(textLines(frame)).toContain("Time Service Name ▲ Type Unit Series");
  expect(tableRows(frame)).toEqual(BY_NAME);
});

test("sorts by series count, last update, and name", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderMetricList(receiver);

  async function pressSortKey(shift: boolean, header: string, rows: string[]) {
    app.mockInput.pressKey("o", { shift });
    const frame = await app.waitForRows(rows);
    expect(textLines(frame)).toContain(header);
  }

  await pressSortKey(false, "Time Service Name Type Unit ▼ Series", [
    COUNTER_ROW,
    DELTA_COUNTER_ROW,
    EXP_HISTOGRAM_ROW,
    HISTOGRAM_ROW,
    UPDOWNCOUNTER_ROW,
    GAUGE_ROW,
  ]);
  await pressSortKey(false, "Time ▼ Service Name Type Unit Series", [
    DELTA_COUNTER_ROW,
    COUNTER_ROW,
    UPDOWNCOUNTER_ROW,
    GAUGE_ROW,
    EXP_HISTOGRAM_ROW,
    HISTOGRAM_ROW,
  ]);
  await pressSortKey(false, "Time Service Name ▲ Type Unit Series", BY_NAME);
  await pressSortKey(true, "Time Service Name ▼ Type Unit Series", BY_NAME.toReversed());
});

test("searches names, descriptions, attribute values, and key=value pairs", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderMetricList(receiver);

  async function expectSearch(text: string, rows: string[]) {
    await app.search(text);
    const frame = await app.waitForRows(rows);
    expect(frame).toContain(`${rows.length} of 6 metrics`);
    app.mockInput.pressEscape();
    await app.waitForFrame((frame) => tableRows(frame).length === 6);
  }

  await expectSearch("metric.c.a", [EXP_HISTOGRAM_ROW]);
  await expectSearch("description-a", [COUNTER_ROW]);
  await expectSearch("value-b", [COUNTER_ROW]);
  await expectSearch("attribute.a=value-a", [COUNTER_ROW]);
});

test("keeps an applied search while browsing", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderMetricList(receiver);

  await app.search("metric.c");
  await app.waitForFrame((frame) => tableRows(frame).length === 2);
  app.mockInput.pressEnter();
  await app.waitForFrame(onList);

  app.mockInput.pressArrow("down");

  expect(await app.waitForSelection("metric.c.b")).toBe(HISTOGRAM_ROW);
  const frame = await app.waitForFrame((frame) => pageHeader(frame) === "2 of 6 metrics");
  expect(keyHints(frame)).toStartWith("/metric.c ");
});

test("summarizes the selected metric's attribute values", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderMetricList(receiver);

  app.mockInput.pressArrow("down");
  const frame = await app.waitForFrame((frame) => detailsLines(frame).includes("scope-c 1.0.0"));

  expect(detailsLines(frame)).toEqual([
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
  await using receiver = await startTestReceiver();
  const values = ["0", "1", "2", "3", "4"];
  await receiver.sendHttp(
    "/v1/metrics",
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
  );
  await using app = await renderPage(receiver, "metrics");

  const frame = await app.waitForText("Attributes");

  expect(detailsLines(frame)).toContain("attribute.a 0, 1, 2 and 2 more");
});

test("scrolls the metric panel down and back up", async () => {
  await using receiver = await startTestReceiver();
  const attributes = Object.fromEntries(
    Array.from({ length: 30 }, (_, index) => [`attribute.${index + 1}`, "value-a"]),
  );
  await receiver.sendHttp(
    "/v1/metrics",
    metricsRequest({
      service: "service-a",
      metrics: [{ name: "metric.a", gauge: [{ attributes, time: atSecond(10), value: 1 }] }],
    }),
  );
  await using app = await renderPage(receiver, "metrics");
  await app.waitForFrame((frame) => detailsLines(frame).includes("attribute.1 value-a"));

  app.mockInput.pressKey("d", { ctrl: true });
  await app.waitForFrame((frame) => !detailsLines(frame).includes("attribute.1 value-a"));

  app.mockInput.pressKey("u", { ctrl: true });
  await app.waitForFrame((frame) => detailsLines(frame).includes("attribute.1 value-a"));
});

test("shows an error when metrics cannot be loaded and retries", async () => {
  silenceConsoleError();
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/metrics", otlpMetrics);
  const connection = await receiver.connect();
  using _ = failOnce(connection, metricList);

  await using app = await renderFailedPage(receiver, "metrics", { connection });
  await app.waitForText("Failed to load metrics");
  app.mockInput.pressKey("r");

  await app.waitForRows(BY_NAME);
});
