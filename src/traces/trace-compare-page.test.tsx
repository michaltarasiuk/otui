import { expect, test } from "bun:test";

import type { CapturedSpan } from "@opentui/core";

import { renderPage } from "#testing/app.tsx";
import { startTestReceiver } from "#testing/receiver.ts";
import {
  color,
  onDetails,
  detailsLines,
  keyHints,
  lineSpans,
  pageHeader,
  spanDiffRows,
  textLines,
} from "#testing/screen.ts";
import {
  NESTED_ROW,
  nestedTraceId,
  FAILED_ROW,
  otlpTraces,
  renderComparison,
  SLOW_NESTED_ROW,
  slowNestedTraceId,
  slowNestedTraces,
  WITH_SLOW_NESTED,
} from "#testing/traces.ts";
import { THEME } from "#ui/theme.ts";

const WIDE = { size: { width: 140, height: 30 } };

const ROOT_ROW = "● service-a operation-a 40.0ms 60.0ms +20.0ms";
const CHILD_ROW = "● service-b operation-b 20.0ms 40.0ms +20.0ms";
const SAME_GRANDCHILD_ROW = "● service-b operation-c 60.0ms 60.0ms +0µs";
const ADDED_GRANDCHILD_ROW = "● service-b operation-c - 140.0ms added";

test("compares the marked trace with the selected one span by span", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderComparison(receiver, WIDE);

  const frame = await app.waitForFrame((frame) => spanDiffRows(frame).length === 4);

  expect(textLines(frame)).toContain("operation-a 11111111 → 66666666");
  expect(textLines(frame)).toContain("● service-a 120.0ms → 300.0ms +180.0ms 3 → 4 spans");
  expect(spanDiffRows(frame)).toEqual([
    ROOT_ROW,
    CHILD_ROW,
    SAME_GRANDCHILD_ROW,
    ADDED_GRANDCHILD_ROW,
  ]);
});

test("sums each operation's self time in both traces, biggest change first", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderComparison(receiver, WIDE);

  const frame = await app.waitForFrame((frame) => detailsLines(frame).length > 0);

  expect(detailsLines(frame).slice(0, 4)).toEqual([
    "Service Operation Spans Self before Self after Change -140.0ms 0 +140.0ms",
    "● service-b operation-c 1 → 2 60.0ms 200.0ms +140.0ms",
    "● service-a operation-a 1 → 1 40.0ms 60.0ms +20.0ms",
    `● service-b operation-b 1 → 1 20.0ms 40.0ms +20.0ms`,
  ]);
});

test("shows only the spans that changed", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderComparison(receiver, WIDE);

  app.mockInput.pressKey("d");
  const frame = await app.waitForFrame((frame) => spanDiffRows(frame).length === 3);

  expect(spanDiffRows(frame)).toEqual([ROOT_ROW, CHILD_ROW, ADDED_GRANDCHILD_ROW]);
  expect(keyHints(frame)).toContain("d all spans");
});

test("swaps the traces and keeps the selected span", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderComparison(receiver, WIDE);
  app.mockInput.pressKey("e");
  await app.waitForSelection("added");

  app.mockInput.pressKey("x");
  const frame = await app.waitForFrame((frame) =>
    textLines(frame).includes("operation-a 66666666 → 11111111"),
  );

  expect(spanDiffRows(frame)[0]).toBe("● service-a operation-a 60.0ms 40.0ms -20.0ms");
  expect(await app.waitForSelection("removed")).toBe("● service-b operation-c 140.0ms - removed");
});

test("opens a span in the trace where it took longer, then comes back", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderComparison(receiver, WIDE);
  app.mockInput.pressKey("x");
  await app.waitForFrame((frame) => textLines(frame).includes("operation-a 66666666 → 11111111"));
  app.mockInput.pressArrow("down");
  await app.waitForSelection("operation-b");

  app.mockInput.pressEnter();
  await app.waitForFrame((frame) => textLines(frame).includes(`operation-a ${slowNestedTraceId}`));
  expect(await app.waitForSelection("operation-b")).toBe(`● service-b operation-b 240.0ms`);

  app.mockInput.pressEscape();
  await app.waitForFrame((frame) => spanDiffRows(frame).length === 4);
  expect(await app.waitForSelection("operation-b")).toBe(
    `● service-b operation-b 40.0ms 20.0ms -20.0ms`,
  );

  app.mockInput.pressEscape();
  const frame = await app.waitForFrame((frame) => pageHeader(frame).endsWith("4 traces"));
  expect(pageHeader(frame)).toBe("vs operation-a 120.0ms 4 traces");
  expect(await app.waitForSelection("operation-a 4")).toBe(SLOW_NESTED_ROW);
  expect(keyHints(frame)).toContain("v compare");
});

function barColors(spans: CapturedSpan[]) {
  return spans.filter((span) => span.text.trim() === "").map((span) => span.bg.toInts());
}

test("grows the bar in red when a span got slower and in blue when it got faster", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderComparison(receiver, WIDE);
  await app.waitForFrame((frame) => spanDiffRows(frame).length === 4);

  let frame = await app.captureSpans();
  expect(barColors(lineSpans(frame, `operation-b `))).toContainEqual(color(THEME.textError));
  expect(barColors(lineSpans(frame, `operation-b `))).not.toContainEqual(color(THEME.bar));

  app.mockInput.pressKey("x");
  await app.waitForFrame((frame) => textLines(frame).includes("operation-a 66666666 → 11111111"));
  frame = await app.captureSpans();
  expect(barColors(lineSpans(frame, `operation-b `))).toContainEqual(color(THEME.bar));
  expect(barColors(lineSpans(frame, `operation-b `))).not.toContainEqual(color(THEME.textError));
});

test("offers to compare only traces with the same root span", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/traces", otlpTraces);
  await receiver.sendHttp("/v1/traces", slowNestedTraces);
  await using app = await renderPage(receiver, "traces", WIDE);
  await app.waitForRows(WITH_SLOW_NESTED);
  await app.selectRow(NESTED_ROW);
  app.mockInput.pressKey("m");
  await app.waitForFrame((frame) => keyHints(frame).includes("m unmark"));

  app.mockInput.pressArrow("up");
  const frame = await app.waitForFrame((frame) => keyHints(frame).includes("m mark"));
  expect(await app.waitForSelection("operation-d")).toBe(FAILED_ROW);
  expect(keyHints(frame)).not.toContain("v compare");

  await app.selectRow(SLOW_NESTED_ROW);
  await app.waitForFrame((frame) => keyHints(frame).includes("v compare"));
});

test("drops the compare key when the marked trace is gone", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderComparison(receiver, WIDE);
  app.mockInput.pressEscape();
  await app.waitForFrame((frame) => keyHints(frame).includes("v compare"));

  const connection = await receiver.connect();
  await connection.run("DELETE FROM otlp_traces WHERE trace_id = $traceId", {
    traceId: nestedTraceId,
  });

  const frame = await app.waitForFrame((frame) =>
    pageHeader(frame).startsWith("vs operation-a 3 traces"),
  );
  expect(keyHints(frame)).not.toContain("v compare");
});

test("marks a trace on its waterfall and compares another one from there", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/traces", otlpTraces);
  await receiver.sendHttp("/v1/traces", slowNestedTraces);
  await using app = await renderPage(receiver, "traces", WIDE);
  await app.waitForRows(WITH_SLOW_NESTED);
  await app.selectRow(NESTED_ROW);
  app.mockInput.pressEnter();
  await app.waitForFrame((frame) => textLines(frame).includes(`operation-a ${nestedTraceId}`));

  app.mockInput.pressKey("m");
  await app.waitForFrame((frame) => keyHints(frame).includes("m unmark"));
  app.mockInput.pressEscape();
  await app.waitForFrame((frame) => pageHeader(frame).includes("vs operation-a 120.0ms"));
  await app.selectRow(SLOW_NESTED_ROW);
  app.mockInput.pressEnter();
  let frame = await app.waitForFrame(
    (frame) => onDetails(frame) && keyHints(frame).includes("v compare"),
  );
  expect(textLines(frame)).toContain(`operation-a ${slowNestedTraceId}`);

  app.mockInput.pressKey("v");
  frame = await app.waitForFrame((frame) => spanDiffRows(frame).length === 4);
  expect(textLines(frame)).toContain("operation-a 11111111 → 66666666");
});
