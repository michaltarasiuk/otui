import { expect, jest, test } from "bun:test";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";

import type { DuckDBConnection } from "@duckdb/node-api";
import { z } from "zod";

import { fakeTimers } from "#testing/clock.ts";
import { silenceConsoleError } from "#testing/console.ts";
import { logsRequest, metricsRequest, TEMPORALITY, tracesRequest } from "#testing/otlp.ts";
import { pollUntil } from "#testing/poll.ts";
import { startTestReceiver, type TestReceiver } from "#testing/receiver.ts";
import { LOOPBACK_HOST } from "#utils/loopback.ts";
import { StartupError } from "#utils/startup-error.ts";

import { PRUNE_INTERVAL_MS, startReceiver } from "./receiver.ts";

const TABLES = [
  "otlp_traces",
  "otlp_logs",
  "otlp_metrics_gauge",
  "otlp_metrics_sum",
  "otlp_metrics_histogram",
  "otlp_metrics_exp_histogram",
];

const RETENTION_MS = 60 * 1000;

const MEMORY_LIMIT_BYTES = 8 * 1024 * 1024;
const MEMORY_BATCH_COUNT = 20;
const MEMORY_BATCH_SIZE = 5000;

async function sendOneOfEach(receiver: TestReceiver, time: Date) {
  const end = new Date(time.getTime() + 1);
  await receiver.send(
    tracesRequest({ service: "service-a", spans: [{ name: "operation-a", start: time, end }] }),
  );
  await receiver.send(logsRequest({ service: "service-a", logs: [{ time, body: "message-a" }] }));
  await receiver.send(
    metricsRequest({
      service: "service-a",
      metrics: [
        { name: "metric.a", gauge: [{ time, value: 4 }] },
        {
          name: "metric.b",
          sum: [{ start: time, time, value: 1 }],
          monotonic: true,
          temporality: TEMPORALITY.cumulative,
        },
        {
          name: "metric.c",
          histogram: [{ start: time, time, count: 1, bounds: [10], counts: [1, 0] }],
          temporality: TEMPORALITY.cumulative,
        },
        {
          name: "metric.d",
          exponentialHistogram: [
            { start: time, time, count: 1, scale: 0, positive: { offset: 0, counts: [1] } },
          ],
          temporality: TEMPORALITY.cumulative,
        },
      ],
    }),
  );
}

function uncompressibleLog() {
  const uuids = Array.from({ length: 4 }, () => crypto.randomUUID());
  return `message-a ${uuids.join(" ")}`;
}

async function sendLogBatches(receiver: TestReceiver) {
  const start = Date.now() - MEMORY_BATCH_COUNT * 1000;
  const times = Array.from(
    { length: MEMORY_BATCH_COUNT },
    (_, batch) => new Date(start + batch * 1000),
  );
  for (const time of times) {
    await receiver.send(
      logsRequest({
        service: "service-a",
        logs: Array.from({ length: MEMORY_BATCH_SIZE }, () => ({
          time,
          body: uncompressibleLog(),
        })),
      }),
    );
  }
  return times;
}

async function logCountAt(connection: DuckDBConnection, time: Date) {
  const reader = await connection.runAndReadAll(
    "SELECT count(*)::INTEGER FROM otlp_logs WHERE epoch_ms(time_unix_nano) = $timeMs",
    { timeMs: time.getTime() },
  );
  return z.number().parse(reader.value(0, 0));
}

async function rowCounts(connection: DuckDBConnection) {
  const reader = await connection.runAndReadAll(
    TABLES.map(
      (table) => `SELECT '${table}' AS name, count(*)::INTEGER AS rows FROM ${table}`,
    ).join(" UNION ALL "),
  );
  return z
    .record(z.string(), z.number())
    .parse(Object.fromEntries(reader.getRowObjectsJS().map(({ name, rows }) => [name, rows])));
}

async function tableMemoryBytes(connection: DuckDBConnection) {
  const reader = await connection.runAndReadAll(
    "SELECT memory_usage_bytes::INTEGER FROM duckdb_memory() WHERE tag = 'IN_MEMORY_TABLE'",
  );
  return z.number().parse(reader.value(0, 0));
}

async function spillDirectory(connection: DuckDBConnection) {
  const reader = await connection.runAndReadAll("SELECT current_setting('temp_directory')");
  return z.string().parse(reader.value(0, 0));
}

function eachTableWith(rows: number) {
  return Object.fromEntries(TABLES.map((table) => [table, rows]));
}

function triggerPrune() {
  jest.advanceTimersByTime(PRUNE_INTERVAL_MS);
  jest.useRealTimers();
}

function pruneAndWaitFor(connection: DuckDBConnection, expected: Record<string, number>) {
  triggerPrune();
  return pollUntil(
    () => rowCounts(connection),
    (counts) => Bun.deepEquals(counts, expected),
  );
}

test("listens for OTLP/HTTP and OTLP/gRPC on the IPv4 loopback address", async () => {
  await using receiver = await startTestReceiver();

  expect(receiver.httpUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
  expect(receiver.grpcUrl).toMatch(/^http:\/\/127\.0\.0\.1:\d+$/);
});

test("stores every signal where its connections can query it", async () => {
  await using receiver = await startTestReceiver();
  const connection = await receiver.connect();

  await sendOneOfEach(receiver, new Date());

  expect(await rowCounts(connection)).toEqual(eachTableWith(1));
});

test("drops telemetry older than the retention period", async () => {
  fakeTimers();
  await using receiver = await startTestReceiver({ retentionMs: RETENTION_MS });
  const connection = await receiver.connect();

  await sendOneOfEach(receiver, new Date(Date.now() - 2 * RETENTION_MS));
  await sendOneOfEach(receiver, new Date());

  expect(await rowCounts(connection)).toEqual(eachTableWith(2));

  expect(await pruneAndWaitFor(connection, eachTableWith(1))).toEqual(eachTableWith(1));
});

test("drops logs by their observed time when they carry no time", async () => {
  fakeTimers();
  await using receiver = await startTestReceiver({ retentionMs: RETENTION_MS });
  const connection = await receiver.connect();

  await receiver.send(
    logsRequest({
      service: "service-a",
      logs: [
        { observedTime: new Date(Date.now() - 2 * RETENTION_MS), body: "message-a" },
        { observedTime: new Date(), body: "message-b" },
      ],
    }),
  );

  const expected = { ...eachTableWith(0), otlp_logs: 1 };
  expect(await pruneAndWaitFor(connection, expected)).toEqual(expected);
});

test("drops logs that carry neither a time nor an observed time", async () => {
  fakeTimers();
  await using receiver = await startTestReceiver({ retentionMs: RETENTION_MS });
  const connection = await receiver.connect();

  await receiver.send(logsRequest({ service: "service-a", logs: [{ body: "message-a" }] }));

  expect(await pruneAndWaitFor(connection, eachTableWith(0))).toEqual(eachTableWith(0));
});

test("releases the memory of pruned telemetry", async () => {
  fakeTimers();
  await using receiver = await startTestReceiver({ retentionMs: RETENTION_MS });
  const connection = await receiver.connect();
  const expired = new Date(Date.now() - 2 * RETENTION_MS);

  await receiver.send(
    logsRequest({
      service: "service-a",
      logs: Array.from({ length: 10_000 }, (_, index) => ({
        time: expired,
        body: `message-${index}`,
      })),
    }),
  );

  expect(await tableMemoryBytes(connection)).toBeGreaterThan(0);

  triggerPrune();

  expect(
    await pollUntil(
      () => tableMemoryBytes(connection),
      (bytes) => bytes === 0,
    ),
  ).toBe(0);
});

test("accepts telemetry beyond its memory limit", async () => {
  fakeTimers();
  await using receiver = await startTestReceiver({ memoryLimitBytes: MEMORY_LIMIT_BYTES });
  const connection = await receiver.connect();

  await sendLogBatches(receiver);

  expect(await rowCounts(connection)).toEqual({
    ...eachTableWith(0),
    otlp_logs: MEMORY_BATCH_COUNT * MEMORY_BATCH_SIZE,
  });
});

test("drops the oldest telemetry when it nears the memory limit", async () => {
  fakeTimers();
  await using receiver = await startTestReceiver({ memoryLimitBytes: MEMORY_LIMIT_BYTES });
  const connection = await receiver.connect();

  const times = await sendLogBatches(receiver);
  const oldest = times.at(0)!;
  const newest = times.at(-1)!;

  triggerPrune();

  expect(
    await pollUntil(
      () => logCountAt(connection, oldest),
      (count) => count === 0,
    ),
  ).toBe(0);
  expect(await logCountAt(connection, newest)).toBe(MEMORY_BATCH_SIZE);
});

test("spills to a temporary directory only while it needs one", async () => {
  fakeTimers();
  const receiver = await startTestReceiver({ memoryLimitBytes: MEMORY_LIMIT_BYTES });
  const directory = await spillDirectory(await receiver.connect());

  expect(directory).toStartWith(tmpdir());
  expect(existsSync(directory)).toBe(false);

  await sendLogBatches(receiver);

  expect(existsSync(directory)).toBe(true);

  await receiver[Symbol.asyncDispose]();

  expect(existsSync(directory)).toBe(false);
});

test("reports a failed prune and keeps running", async () => {
  fakeTimers();
  const consoleError = silenceConsoleError();
  await using receiver = await startTestReceiver({ retentionMs: RETENTION_MS });
  const connection = await receiver.connect();

  await connection.run("DROP TABLE otlp_traces");

  triggerPrune();

  await pollUntil(
    () => consoleError.mock.calls.length,
    (calls) => calls > 0,
  );
  expect(consoleError).toHaveBeenCalledWith("Failed to prune telemetry", expect.any(Error));
});

test("deletes all telemetry when cleared", async () => {
  await using receiver = await startTestReceiver();
  const connection = await receiver.connect();
  await sendOneOfEach(receiver, new Date());

  await receiver.clear();

  expect(await rowCounts(connection)).toEqual(eachTableWith(0));
});

test("closes its connections and stops listening when disposed", async () => {
  const receiver = await startTestReceiver();
  const connection = await receiver.connect();

  await receiver[Symbol.asyncDispose]();

  expect(connection.run("SELECT 1")).rejects.toThrow("connection disconnected");
  expect(fetch(receiver.httpUrl)).rejects.toMatchObject({ code: "ECONNREFUSED" });
  expect(fetch(receiver.grpcUrl)).rejects.toMatchObject({ code: "ECONNREFUSED" });
});

test("names the ports when it can't listen on them", async () => {
  await using receiver = await startTestReceiver();
  const { port: httpPort } = new URL(receiver.httpUrl);
  const { port: grpcPort } = new URL(receiver.grpcUrl);

  const error = await startReceiver({
    host: LOOPBACK_HOST,
    httpPort: Number(httpPort),
    grpcPort: Number(grpcPort),
    retentionMs: RETENTION_MS,
    memoryLimitBytes: MEMORY_LIMIT_BYTES,
  }).catch((error: unknown) => error);

  expect(error).toBeInstanceOf(StartupError);
  expect(error).toHaveProperty(
    "message",
    expect.stringContaining(
      `couldn't listen on ${LOOPBACK_HOST}:${httpPort} and ${LOOPBACK_HOST}:${grpcPort}`,
    ),
  );
});
