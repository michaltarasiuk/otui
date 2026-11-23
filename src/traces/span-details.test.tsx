import { expect, test } from "bun:test";

import { renderPage } from "#testing/app.tsx";
import { at } from "#testing/clock.ts";
import { failOnce } from "#testing/connection.ts";
import { silenceConsoleError } from "#testing/console.ts";
import { fakeSpanId, fakeTraceId, tracesRequest } from "#testing/otlp.ts";
import { startTestReceiver } from "#testing/receiver.ts";
import { detailsLines, keyHints, spanRows, tableRows } from "#testing/screen.ts";
import {
  nestedRootSpanId,
  NESTED_ROW,
  nestedTraceId,
  ERROR_MESSAGE,
  FAILED_ROW,
  nestedChildSpanId,
  openTrace,
  failedRootSpanId,
} from "#testing/traces.ts";
import spanContent from "#traces/sql/span-content.sql" with { type: "text" };

test("shows the selected span's attributes, resource, and scope", async () => {
  await using receiver = await startTestReceiver();
  await using app = await openTrace(receiver, NESTED_ROW);

  const frame = await app.waitForText("Scope");

  expect(detailsLines(frame)).toEqual([
    `operation-a ${nestedRootSpanId}`,
    "● service-a server 12:00:00.000 +0µs 120.0ms",
    "Attributes",
    "attribute.a value-a",
    "Resource",
    "resource.a value-a",
    "service.name service-a",
    "Scope",
    "scope-a 1.0.0",
  ]);
});

test("shows the selected span's events with their offsets", async () => {
  await using receiver = await startTestReceiver();
  await using app = await openTrace(receiver, NESTED_ROW);
  await app.waitForText("Scope");

  app.mockInput.pressArrow("down");
  const frame = await app.waitForText("event-b");

  expect(detailsLines(frame)).toEqual([
    `operation-b ${nestedChildSpanId}`,
    "● service-b server 12:00:00.010 +10.0ms 80.0ms",
    "Events",
    "-2.0ms event-a",
    "+5.0ms event-b",
    "attribute.b value-b",
    "event-c",
    "Resource",
    "service.name service-b",
  ]);
});

test("shows a span's links and status message", async () => {
  await using receiver = await startTestReceiver();
  await using app = await openTrace(receiver, FAILED_ROW);

  const frame = await app.waitForText("Links");

  expect(detailsLines(frame)).toEqual([
    `operation-d ${failedRootSpanId}`,
    "● service-c server 12:00:01.000 +0µs 450.0ms",
    ERROR_MESSAGE,
    "Links",
    `${nestedTraceId} ${nestedRootSpanId}`,
    "attribute.c 4",
    "Resource",
    "service.name service-c",
  ]);
});

test("opens a linked trace from the links region and comes back", async () => {
  await using receiver = await startTestReceiver();
  await using app = await openTrace(receiver, FAILED_ROW);
  await app.waitForFrame((frame) => detailsLines(frame).includes("Links"));

  app.mockInput.pressTab();
  await app.waitForFrame((frame) => keyHints(frame).includes("return open link"));
  app.mockInput.pressEnter();

  expect(await app.waitForSelection("operation-a")).toContain("● service-a operation-a");
  app.mockInput.pressEscape();
  await app.waitForSelection("operation-d");
});

test("selects a span linked within the same trace", async () => {
  await using receiver = await startTestReceiver();
  const traceId = fakeTraceId("c");
  await receiver.sendHttp(
    "/v1/traces",
    tracesRequest({
      service: "service-a",
      spans: [
        { traceId, spanId: fakeSpanId("ca"), name: "operation-a", start: at(0), end: at(100) },
        {
          traceId,
          spanId: fakeSpanId("cb"),
          parentSpanId: fakeSpanId("ca"),
          name: "operation-b",
          start: at(10),
          end: at(40),
        },
        {
          traceId,
          spanId: fakeSpanId("cc"),
          parentSpanId: fakeSpanId("ca"),
          name: "operation-c",
          start: at(50),
          end: at(90),
          links: [
            { traceId, spanId: fakeSpanId("cb") },
            { traceId: fakeTraceId("d"), spanId: fakeSpanId("da") },
          ],
        },
      ],
    }),
  );
  await using app = await renderPage(receiver, "traces");
  await app.waitForFrame((frame) => keyHints(frame).includes("return open"));
  app.mockInput.pressEnter();
  await app.waitForFrame((frame) => spanRows(frame).length === 3);
  await app.selectRow("operation-c");
  await app.waitForFrame((frame) =>
    detailsLines(frame).includes(`${traceId} ${fakeSpanId("cb")} (this trace)`),
  );

  app.mockInput.pressTab();
  const frame = await app.waitForFrame((frame) => keyHints(frame).includes("return open link"));
  expect(detailsLines(frame)).toContain(`${traceId} ${fakeSpanId("cb")} (this trace)`);
  expect(detailsLines(frame)).toContain(`${fakeTraceId("d")} ${fakeSpanId("da")} (not stored)`);
  app.mockInput.pressArrow("down");
  await app.waitForFrame((frame) => !keyHints(frame).includes("open link"));
  app.mockInput.pressArrow("up");
  await app.waitForFrame((frame) => keyHints(frame).includes("return open link"));
  app.mockInput.pressEnter();

  await app.waitForSelection("operation-b");
});

test("opens a link once its trace arrives", async () => {
  await using receiver = await startTestReceiver();
  const linkedTraceId = fakeTraceId("f");
  const linkedSpanId = fakeSpanId("fa");
  await receiver.sendHttp(
    "/v1/traces",
    tracesRequest({
      service: "service-a",
      spans: [
        {
          traceId: fakeTraceId("e"),
          spanId: fakeSpanId("ea"),
          name: "operation-a",
          start: at(0),
          end: at(100),
          links: [{ traceId: linkedTraceId, spanId: linkedSpanId }],
        },
      ],
    }),
  );
  await using app = await renderPage(receiver, "traces");
  await app.waitForFrame((frame) => keyHints(frame).includes("return open"));
  app.mockInput.pressEnter();
  await app.waitForText(`${linkedTraceId} ${linkedSpanId} (not stored)`);
  app.mockInput.pressTab();

  await receiver.sendHttp(
    "/v1/traces",
    tracesRequest({
      service: "service-b",
      spans: [
        {
          traceId: linkedTraceId,
          spanId: linkedSpanId,
          name: "operation-b",
          start: at(-200),
          end: at(-100),
        },
      ],
    }),
  );

  const frame = await app.waitForFrame((frame) => keyHints(frame).includes("return open link"));
  expect(detailsLines(frame)).toContain(`${linkedTraceId} ${linkedSpanId}`);
});

test("loads a span's details again after they failed to load", async () => {
  silenceConsoleError();
  await using receiver = await startTestReceiver();
  const connection = await receiver.connect();
  using _ = failOnce(connection, spanContent);
  await using app = await openTrace(receiver, NESTED_ROW, { connection });
  await app.waitForFrame((frame) => detailsLines(frame).includes("Failed to load span details"));

  app.mockInput.pressArrow("down");
  await app.waitForFrame((frame) => !detailsLines(frame).includes("Failed to load span details"));
  app.mockInput.pressArrow("up");

  await app.waitForFrame((frame) => detailsLines(frame).includes("attribute.a value-a"));
});

test("scrolls the span panel down and back up", async () => {
  await using receiver = await startTestReceiver();
  const attributes = Object.fromEntries(
    Array.from({ length: 30 }, (_, index) => [`attribute.${index + 1}`, "value-a"]),
  );
  await receiver.sendHttp(
    "/v1/traces",
    tracesRequest({
      service: "service-a",
      spans: [
        {
          traceId: nestedTraceId,
          spanId: nestedRootSpanId,
          name: "operation-a",
          start: at(0),
          end: at(10),
          attributes,
        },
      ],
    }),
  );
  await using app = await renderPage(receiver, "traces");
  await app.waitForFrame((frame) => tableRows(frame).length === 1);
  app.mockInput.pressEnter();
  await app.waitForFrame((frame) => detailsLines(frame).includes("attribute.1 value-a"));

  app.mockInput.pressKey("d", { ctrl: true });
  await app.waitForFrame((frame) => !detailsLines(frame).includes("attribute.1 value-a"));

  app.mockInput.pressKey("u", { ctrl: true });
  await app.waitForFrame((frame) => detailsLines(frame).includes("attribute.1 value-a"));
});
