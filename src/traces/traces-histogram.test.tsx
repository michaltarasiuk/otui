import { expect, test } from "bun:test";

import { type AppOptions, renderPage, type TestApp } from "#testing/app.tsx";
import { at, fakeClock } from "#testing/clock.ts";
import type { Frame } from "#testing/frame.ts";
import { STATUS_CODE, tracesRequest } from "#testing/otlp.ts";
import { hex } from "#testing/styled-frame.ts";
import { HISTOGRAM_COLUMN_WIDTH } from "#ui/histogram/time-histogram.tsx";
import { THEME } from "#ui/theme.ts";

const LIVE_TIME_MS = 50_000;

const bar = "█".repeat(HISTOGRAM_COLUMN_WIDTH);
const MINUTE_TICKS = "11:52 11:53 11:54 11:55 11:56 11:57 11:58 11:59 12:00";

const timelineTraces = tracesRequest(
  { service: "service-a", spans: [{ name: "operation-a", start: at(0), end: at(120) }] },
  { service: "service-c", spans: [{ name: "operation-c", start: at(40_000), end: at(40_001) }] },
  {
    service: "service-b",
    spans: [
      {
        name: "operation-b",
        start: at(20_000),
        end: at(20_500),
        status: { code: STATUS_CODE.error },
      },
    ],
  },
);

const oldTrace = tracesRequest({
  service: "service-a",
  spans: [{ name: "operation-d", start: at(-40 * 60_000), end: at(-40 * 60_000 + 10) }],
});

async function renderHistogram({ send = [], ...options }: AppOptions = {}) {
  fakeClock(at(LIVE_TIME_MS));
  const app = await renderPage("traces", { ...options, send: [timelineTraces, ...send] });
  await app.waitForText("12:00:40.000");
  return app;
}

async function showsOnly(app: TestApp, row: string, range: string, totalCount = 3) {
  const frame = await app.waitForRows([row]);
  expect(frame.header).toBe(`${range} 1 of ${totalCount} traces`);
  return frame;
}

function axisLine(frame: Frame) {
  return frame.chart.at(-1);
}

async function barColors(app: TestApp) {
  const bars = (await app.captureStyles()).line("█");
  return bars.spans.filter((span) => span.text.includes("█")).map((span) => hex(span.fg));
}

test("draws a histogram of traces over time above the list", async () => {
  const app = await renderHistogram();

  const frame = await app.waitForText("12:00");

  expect(frame.header).toBe("3 traces");
  expect(frame.chart).toEqual([
    "Traces over time ■ errors 10s per column",
    ...Array.from({ length: 4 }, () => `${bar} ${bar} ${bar}`),
    MINUTE_TICKS,
  ]);
});

test("colors the histogram's errors apart from the other traces", async () => {
  const app = await renderHistogram();
  await app.waitForText("Traces over time");

  expect(await barColors(app)).toEqual([THEME.bar, THEME.textError, THEME.bar]);
});

test("narrows the histogram with the search and the errors filter", async () => {
  const app = await renderHistogram();

  await app.search("operation-a");
  let frame = await app.waitFor((frame) => !frame.text.includes("■ errors"));
  expect(frame.chart).toEqual([
    "Traces over time 10s per column",
    ...Array.from({ length: 4 }, () => bar),
    MINUTE_TICKS,
  ]);

  app.press("escape");
  await app.waitForText("■ errors");
  app.press("s");
  frame = await app.waitForText("1 of 3 traces");
  expect(frame.chart).toEqual([
    "Traces over time ■ errors 10s per column",
    ...Array.from({ length: 4 }, () => bar),
    MINUTE_TICKS,
  ]);
});

test("moves the marker over the timeline, latest bucket first", async () => {
  const app = await renderHistogram();

  app.press("right");
  await showsOnly(app, "operation-c", "12:00:40–12:00:50");

  app.press("left");
  await showsOnly(app, "operation-b", "12:00:20–12:00:30");

  app.press("left");
  await showsOnly(app, "operation-a", "12:00:00–12:00:10");

  app.press("right");
  await showsOnly(app, "operation-b", "12:00:20–12:00:30");
});

test("scrolls the timeline to keep the marker in view", async () => {
  const app = await renderHistogram({ send: [oldTrace] });

  let frame = await app.waitForText("◀ earlier");
  expect(frame.text).not.toContain("later ▶");
  expect(axisLine(frame)).toBe(MINUTE_TICKS);

  for (const [arrow, row, range] of [
    ["right", "operation-c", "12:00:40–12:00:50"],
    ["left", "operation-b", "12:00:20–12:00:30"],
    ["left", "operation-a", "12:00:00–12:00:10"],
    ["left", "operation-d", "11:20:00–11:20:10"],
  ] as const) {
    app.press(arrow);
    frame = await showsOnly(app, row, range, 4);
  }

  expect(frame.text).toContain("later ▶");
  expect(frame.text).not.toContain("◀ earlier");
  expect(axisLine(frame)).toContain("11:20");

  app.press("escape");
  frame = await app.waitFor((frame) => frame.tableRows.length === 4);
  expect(frame.text).toContain("◀ earlier");
  expect(frame.text).not.toContain("later ▶");
});

test("highlights the selected bucket's column", async () => {
  const app = await renderHistogram();

  app.press("right");
  await app.waitForText("1 of 3 traces");

  const highlighted = (await app.captureStyles()).lines.filter(({ spans }) =>
    spans.some((span) => hex(span.bg) === THEME.backgroundSelected),
  );
  expect(highlighted).toHaveLength(4 + 1);
});

test("clears the selected bucket with escape", async () => {
  const app = await renderHistogram();
  app.press("right");
  await app.waitForText("escape any time");

  app.press("escape");

  const frame = await app.waitFor((frame) => frame.tableRows.length === 3);
  expect(frame.header).toBe("3 traces");
});

test("keeps the selected bucket when the search leaves it without traces", async () => {
  const app = await renderHistogram();
  app.press("right");
  await app.waitForText("1 of 3 traces");

  await app.search("operation-a");

  const frame = await app.waitForText("No traces match");
  expect(frame.header).toBe("12:00:40–12:00:50 0 of 3 traces");
  expect(frame.hints).toStartWith("/operation-a ");
  expect(frame.text).toContain("Traces over time");
});

test("leaves the list its room on a short terminal", async () => {
  const app = await renderHistogram({ size: { width: 120, height: 12 } });

  const frame = await app.waitFor((frame) => frame.tableRows.length === 3);

  expect(frame.text).not.toContain("Traces over time");
});

test("fits the histogram to the terminal after a resize", async () => {
  const app = await renderHistogram();
  await app.waitFor((frame) => axisLine(frame) === MINUTE_TICKS);

  app.resize(60, 30);
  const narrow = await app.waitFor((frame) => axisLine(frame) !== MINUTE_TICKS);
  expect(axisLine(narrow)).toBe("11:57 11:58 11:59 12:00");

  app.resize(120, 12);
  const short = await app.waitFor((frame) => !frame.text.includes("Traces over time"));
  expect(short.tableRows).toHaveLength(3);
});
