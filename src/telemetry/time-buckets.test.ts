import { expect, test } from "bun:test";

import { NOON_MS } from "#testing/clock.ts";

import { bucketStart, TIME_BUCKET_MS, TimeBucket } from "./time-buckets.ts";

test("starts a bucket at the last multiple of its width", () => {
  expect(bucketStart(NOON_MS)).toBe(NOON_MS);
  expect(bucketStart(NOON_MS + 9_999)).toBe(NOON_MS);
  expect(bucketStart(NOON_MS + 10_000)).toBe(NOON_MS + 10_000);
});

test("reads a bucket row as a column one bucket wide", () => {
  const row = { bucket_start_ms: NOON_MS, count: 2, error_count: 1 };

  expect(TimeBucket.parse(row)).toEqual({
    from: NOON_MS,
    to: NOON_MS + TIME_BUCKET_MS,
    count: 2,
    errorCount: 1,
  });
});
