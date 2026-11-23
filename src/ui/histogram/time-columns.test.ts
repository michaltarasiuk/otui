import { expect, test } from "bun:test";

import { TIME_BUCKET_MS } from "#telemetry/time-buckets.ts";
import { NOON_MS } from "#testing/clock.ts";
import { SECOND_MS } from "#utils/time.ts";

import type { HistogramColumn } from "./bars.ts";
import {
  hiddenColumns,
  TIME_SCALE_LABEL,
  timeAxis,
  timeColumns,
  timeRangeLabel,
} from "./time-columns.ts";

function column(startMs: number, count = 0, errorCount = 0) {
  return {
    from: startMs,
    to: startMs + TIME_BUCKET_MS,
    count,
    errorCount,
  } satisfies HistogramColumn;
}

function emptyColumns(startMs: number, count: number) {
  return Array.from({ length: count }, (_, offset) => column(startMs + offset * TIME_BUCKET_MS));
}

test("buckets the timeline in fixed slices and says so", () => {
  expect(TIME_BUCKET_MS).toBe(10_000);
  expect(TIME_SCALE_LABEL).toBe("10s per column");
});

test("ends the columns at the newest bucket and fills the gaps", () => {
  const occupied = [column(NOON_MS, 2, 1), column(NOON_MS + 20 * SECOND_MS, 3)];

  const columns = timeColumns(occupied, NOON_MS + 30 * SECOND_MS, 5, undefined);

  expect(columns).toEqual([
    column(NOON_MS - 10 * SECOND_MS),
    column(NOON_MS, 2, 1),
    column(NOON_MS + 10 * SECOND_MS),
    column(NOON_MS + 20 * SECOND_MS, 3),
    column(NOON_MS + 30 * SECOND_MS),
  ]);
});

test("leaves out buckets before the first column", () => {
  const occupied = [column(NOON_MS - 60 * SECOND_MS, 4), column(NOON_MS + 30 * SECOND_MS, 1)];

  const columns = timeColumns(occupied, NOON_MS + 30 * SECOND_MS, 3, undefined);

  expect(columns.map(({ count }) => count)).toEqual([0, 0, 1]);
});

test("centers the columns on the selected bucket, up to the newest bucket", () => {
  const occupied = [column(NOON_MS - 600 * SECOND_MS, 1), column(NOON_MS, 1)];
  const newestBucketMs = NOON_MS + 30 * SECOND_MS;
  const select = (from: number) => ({ from, to: from + TIME_BUCKET_MS });

  const older = timeColumns(occupied, newestBucketMs, 5, select(NOON_MS - 600 * SECOND_MS));
  const newest = timeColumns(occupied, newestBucketMs, 5, select(newestBucketMs));

  expect(older.map(({ from }) => from)).toEqual(
    [-620, -610, -600, -590, -580].map((seconds) => NOON_MS + seconds * SECOND_MS),
  );
  expect(newest.at(-1)?.from).toBe(newestBucketMs);
});

test("has no columns when there is no room for one", () => {
  expect(timeColumns([column(NOON_MS, 1)], NOON_MS, 0, undefined)).toEqual([]);
});

test("reports traces before and after the columns", () => {
  const columns = emptyColumns(NOON_MS, 3);

  expect(hiddenColumns([column(NOON_MS - 10 * SECOND_MS, 1)], columns)).toEqual({
    earlier: true,
    later: false,
  });
  expect(hiddenColumns([column(NOON_MS + 30 * SECOND_MS, 1)], columns)).toEqual({
    earlier: false,
    later: true,
  });
  expect(hiddenColumns([column(NOON_MS + 10 * SECOND_MS, 1)], columns)).toEqual({
    earlier: false,
    later: false,
  });
  expect(hiddenColumns([], [])).toEqual({ earlier: false, later: false });
});

test("labels a range with the times it starts and ends, to the second under a minute", () => {
  expect(timeRangeLabel({ from: NOON_MS, to: NOON_MS + 10_000 })).toBe("12:00:00–12:00:10");
  expect(timeRangeLabel({ from: NOON_MS, to: NOON_MS + 5 * 60 * 1000 })).toBe("12:00–12:05");
});

test("labels the axis to the minute at round times, far enough apart to read", () => {
  const columns = emptyColumns(NOON_MS - 30 * SECOND_MS, 20);

  expect(timeAxis(columns, 2)).toBe(
    `${" ".repeat(6)}12:00${" ".repeat(7)}12:01${" ".repeat(7)}12:02`,
  );
});

test("widens the tick interval when the columns are narrower", () => {
  const columns = emptyColumns(NOON_MS - 30 * SECOND_MS, 60);

  expect(timeAxis(columns, 1).trim().split(/\s+/)).toEqual([
    "12:00",
    "12:02",
    "12:04",
    "12:06",
    "12:08",
  ]);
});

test("skips a tick whose label would run past the last column", () => {
  const columns = emptyColumns(NOON_MS - 20 * SECOND_MS, 4);

  expect(timeAxis(columns, 2)).toBe("");
});

test("has no axis without columns", () => {
  expect(timeAxis([], 2)).toBe("");
});
