import { expect, test } from "bun:test";

import { renderPage, type TestApp } from "#testing/app.tsx";
import { at, fakeClock } from "#testing/clock.ts";
import { fakeSpanId, fakeTraceId, STATUS_CODE, tracesRequest } from "#testing/otlp.ts";
import { startTestReceiver, type TestReceiver } from "#testing/receiver.ts";
import {
  chartLines,
  color,
  keyHints,
  pageHeader,
  selectedBackground,
  tableRows,
} from "#testing/screen.ts";
import { HISTOGRAM_COLUMN_WIDTH } from "#ui/histogram/time-histogram.tsx";
import { THEME } from "#ui/theme.ts";

const LIVE_TIME_MS = 50_000;

const EARLY_ROW = "12:00:00.000 ● service-a operation-a 1 120.0ms";
const ERROR_ROW = "12:00:20.000 ● service-b operation-b 1 1 500.0ms";
const LATE_ROW = "12:00:40.000 ● service-c operation-c 1 1.0ms";
const OLD_ROW = "11:20:00.000 ● service-a operation-d 1 10.0ms";

const bar = "█".repeat(HISTOGRAM_COLUMN_WIDTH);
const MINUTE_TICKS = "11:52 11:53 11:54 11:55 11:56 11:57 11:58 11:59 12:00";

const timelineTraces = tracesRequest(
  {
    service: "service-a",
    spans: [
      {
        traceId: fakeTraceId("1"),
        spanId: fakeSpanId("1a"),
        name: "operation-a",
        start: at(0),
        end: at(120),
      },
    ],
  },
  {
    service: "service-c",
    spans: [
      {
        traceId: fakeTraceId("3"),
        spanId: fakeSpanId("3a"),
        name: "operation-c",
        start: at(40_000),
        end: at(40_001),
      },
    ],
  },
  {
    service: "service-b",
    spans: [
      {
        traceId: fakeTraceId("2"),
        spanId: fakeSpanId("2a"),
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
  spans: [
    {
      traceId: fakeTraceId("4"),
      spanId: fakeSpanId("4a"),
      name: "operation-d",
      start: at(-40 * 60_000),
      end: at(-40 * 60_000 + 10),
    },
  ],
});

interface HistogramOptions {
  size?: { width: number; height: number };
  withOldTrace?: boolean;
}

async function renderHistogram(
  receiver: TestReceiver,
  { size, withOldTrace }: HistogramOptions = {},
) {
  fakeClock(at(LIVE_TIME_MS));
  await receiver.sendHttp("/v1/traces", timelineTraces);
  if (withOldTrace === true) {
    await receiver.sendHttp("/v1/traces", oldTrace);
  }
  const app = await renderPage(receiver, "traces", { size });
  await app.waitForText(LATE_ROW.slice(0, 12));
  return app;
}

async function showsOnly(app: TestApp, row: string, range: string, totalCount = 3) {
  const frame = await app.waitForRows([row]);
  expect(pageHeader(frame)).toBe(`${range} 1 of ${totalCount} traces`);
  return frame;
}

function axisLine(frame: string) {
  return chartLines(frame).at(-1);
}

async function barSpans(app: TestApp) {
  const barRow = (await app.captureSpans()).lines.find(({ spans }) =>
    spans.some((span) => span.text.includes("█")),
  );
  return (barRow?.spans ?? []).filter((span) => span.text.includes("█"));
}

test("draws a histogram of traces over time above the list", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderHistogram(receiver);

  const frame = await app.waitForText("12:00");

  expect(pageHeader(frame)).toBe("3 traces");
  expect(chartLines(frame)).toEqual([
    "Traces over time ■ errors 10s per column",
    ...Array.from({ length: 4 }, () => `${bar} ${bar} ${bar}`),
    MINUTE_TICKS,
  ]);
});

test("colors the histogram's errors apart from the other traces", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderHistogram(receiver);
  await app.waitForText("Traces over time");

  expect((await barSpans(app)).map((span) => span.fg.toInts())).toEqual([
    color(THEME.bar),
    color(THEME.textError),
    color(THEME.bar),
  ]);
});

test("narrows the histogram with the search and the errors filter", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderHistogram(receiver);

  await app.search("operation-a");
  let frame = await app.waitForFrame((frame) => !frame.includes("■ errors"));
  expect(chartLines(frame)).toEqual([
    "Traces over time 10s per column",
    ...Array.from({ length: 4 }, () => bar),
    MINUTE_TICKS,
  ]);

  app.mockInput.pressEscape();
  await app.waitForText("■ errors");
  app.mockInput.pressKey("s");
  frame = await app.waitForText("1 of 3 traces");
  expect(chartLines(frame)).toEqual([
    "Traces over time ■ errors 10s per column",
    ...Array.from({ length: 4 }, () => bar),
    MINUTE_TICKS,
  ]);
});

test("moves the marker over the timeline, latest bucket first", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderHistogram(receiver);

  app.mockInput.pressArrow("right");
  await showsOnly(app, LATE_ROW, "12:00:40–12:00:50");

  app.mockInput.pressArrow("left");
  await showsOnly(app, ERROR_ROW, "12:00:20–12:00:30");

  app.mockInput.pressArrow("left");
  await showsOnly(app, EARLY_ROW, "12:00:00–12:00:10");

  app.mockInput.pressArrow("right");
  await showsOnly(app, ERROR_ROW, "12:00:20–12:00:30");
});

test("scrolls the timeline to keep the marker in view", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderHistogram(receiver, { withOldTrace: true });

  let frame = await app.waitForText("◀ earlier");
  expect(frame).not.toContain("later ▶");
  expect(axisLine(frame)).toBe(MINUTE_TICKS);

  for (const [arrow, row, range] of [
    ["right", LATE_ROW, "12:00:40–12:00:50"],
    ["left", ERROR_ROW, "12:00:20–12:00:30"],
    ["left", EARLY_ROW, "12:00:00–12:00:10"],
    ["left", OLD_ROW, "11:20:00–11:20:10"],
  ] as const) {
    app.mockInput.pressArrow(arrow);
    frame = await showsOnly(app, row, range, 4);
  }

  expect(frame).toContain("later ▶");
  expect(frame).not.toContain("◀ earlier");
  expect(axisLine(frame)).toContain("11:20");

  app.mockInput.pressEscape();
  frame = await app.waitForFrame((frame) => tableRows(frame).length === 4);
  expect(frame).toContain("◀ earlier");
  expect(frame).not.toContain("later ▶");
});

test("highlights the selected bucket's column", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderHistogram(receiver);

  app.mockInput.pressArrow("right");
  await app.waitForText("1 of 3 traces");

  const highlighted = (await app.captureSpans()).lines.filter(({ spans }) =>
    spans.some((span) => span.bg.equals(selectedBackground)),
  );
  expect(highlighted).toHaveLength(4 + 1);
});

test("clears the selected bucket with escape", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderHistogram(receiver);
  app.mockInput.pressArrow("right");
  await app.waitForText("escape any time");

  app.mockInput.pressEscape();

  const frame = await app.waitForFrame((frame) => tableRows(frame).length === 3);
  expect(pageHeader(frame)).toBe("3 traces");
});

test("keeps the selected bucket when the search leaves it without traces", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderHistogram(receiver);
  app.mockInput.pressArrow("right");
  await app.waitForText("1 of 3 traces");

  await app.search("operation-a");

  const frame = await app.waitForText("No traces match");
  expect(pageHeader(frame)).toBe("12:00:40–12:00:50 0 of 3 traces");
  expect(keyHints(frame)).toStartWith("/operation-a ");
  expect(frame).toContain("Traces over time");
});

test("leaves the list its room on a short terminal", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderHistogram(receiver, { size: { width: 120, height: 12 } });

  const frame = await app.waitForFrame((frame) => tableRows(frame).length === 3);

  expect(frame).not.toContain("Traces over time");
});

test("fits the histogram to the terminal after a resize", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderHistogram(receiver);
  await app.waitForFrame((frame) => axisLine(frame) === MINUTE_TICKS);

  app.resize(60, 30);
  const narrow = await app.waitForFrame((frame) => axisLine(frame) !== MINUTE_TICKS);
  expect(axisLine(narrow)).toBe("11:57 11:58 11:59 12:00");

  app.resize(120, 12);
  const short = await app.waitForFrame((frame) => !frame.includes("Traces over time"));
  expect(tableRows(short)).toHaveLength(3);
});
