import { expect, test } from "bun:test";

import { type CapturedFrame, RGBA } from "@opentui/core";

import { startTestReceiver } from "#testing/receiver.ts";
import {
  color,
  detailsLines,
  keyHints,
  lineSpans,
  listLines,
  spanColors,
  spanRows,
  textLines,
} from "#testing/screen.ts";
import {
  NESTED_ROW,
  ERROR_MESSAGE,
  FAILED_ROW,
  failedTraceId,
  missingParentId,
  openTrace,
  SINGLE_ROW,
} from "#testing/traces.ts";
import { serviceColor, THEME } from "#ui/theme.ts";
import { collapseWhitespace } from "#utils/text.ts";

function barExtent({ lines }: CapturedFrame, name: string, color: string) {
  const background = RGBA.fromHex(color);
  const row = lines.find(
    ({ spans }) =>
      spans.some((span) => span.text.includes(name)) &&
      spans.some((span) => span.bg.equals(background)),
  );
  let column = 0;
  let start = -1;
  let end = -1;
  for (const span of row?.spans ?? []) {
    if (span.bg.equals(background)) {
      start = start === -1 ? column : start;
      end = column + span.width;
    }
    column += span.width;
  }
  return { start, end };
}

test("opens a trace as a span waterfall", async () => {
  await using receiver = await startTestReceiver();
  await using app = await openTrace(receiver, FAILED_ROW);

  const frame = await app.waitForFrame((frame) => spanRows(frame).length === 3);

  expect(listLines(frame).slice(0, 3)).toEqual([
    `operation-d ${failedTraceId}`,
    "● service-c 12:00:01.000 3 spans 2 errors 500.0ms",
    "Service Name Duration 0 500.0ms",
  ]);
  expect(spanRows(frame).map((row) => collapseWhitespace(row))).toEqual([
    `● service-c operation-d 450.0ms`,
    "● service-d operation-e 300.0ms",
    "● service-e operation-f 40.0ms",
  ]);
});

test("indents each span under its parent", async () => {
  await using receiver = await startTestReceiver();
  await using app = await openTrace(receiver, NESTED_ROW);

  const [root, child, grandchild] = spanRows(await app.waitForText("operation-c"));
  const nameColumn = root?.indexOf("operation-a") ?? -1;

  expect(child?.indexOf("operation-b")).toBe(nameColumn + 2);
  expect(grandchild?.indexOf("operation-c")).toBe(nameColumn + 4);
});

test("draws each span's bar inside its parent's bar", async () => {
  await using receiver = await startTestReceiver();
  await using app = await openTrace(receiver, NESTED_ROW);
  await app.waitForText("operation-c");

  const frame = await app.captureSpans();
  const root = barExtent(frame, "operation-a", serviceColor("service-a"));
  const child = barExtent(frame, "operation-b", serviceColor("service-b"));
  const grandchild = barExtent(frame, "operation-c", serviceColor("service-b"));

  expect(root.start).toBeLessThan(child.start);
  expect(child.start).toBeLessThan(grandchild.start);
  expect(grandchild.end).toBeLessThan(child.end);
  expect(child.end).toBeLessThan(root.end);
});

test("points out a span whose parent never arrived", async () => {
  await using receiver = await startTestReceiver();
  await using app = await openTrace(receiver, FAILED_ROW);
  await app.waitForFrame((frame) => detailsLines(frame).includes(ERROR_MESSAGE));

  app.mockInput.pressKey("END");
  const frame = await app.waitForText("not received");

  expect(textLines(frame)).toContain(
    `● service-e consumer 12:00:01.460 +460.0ms 40.0ms parent ${missingParentId} not received`,
  );
});

test("opens a trace whose spans have no kind", async () => {
  await using receiver = await startTestReceiver();
  await using app = await openTrace(receiver, SINGLE_ROW);

  const frame = await app.waitForText("unspecified");

  expect(textLines(frame)).toContain("● service-f unspecified 12:00:02.000 +0µs 1.0ms");
});

test("colors the names of spans with errors", async () => {
  await using receiver = await startTestReceiver();
  await using app = await openTrace(receiver, FAILED_ROW);
  await app.waitForText("operation-f");

  const frame = await app.captureSpans();

  expect(spanColors(lineSpans(frame, "operation-e"), "operation-e").fg).toEqual(
    color(THEME.textError),
  );
  expect(spanColors(lineSpans(frame, "operation-f"), "operation-f").fg).toEqual(color(THEME.text));
});

test("folds and unfolds the selected span's children", async () => {
  await using receiver = await startTestReceiver();
  await using app = await openTrace(receiver, NESTED_ROW);
  await app.waitForFrame((frame) => spanRows(frame).length === 3);

  app.mockInput.pressKey(" ");
  let frame = await app.waitForFrame((frame) => spanRows(frame).length === 1);
  expect(collapseWhitespace(spanRows(frame)[0] ?? "")).toBe("● service-a operation-a +2 120.0ms");
  expect(keyHints(frame)).toContain("space unfold");

  app.mockInput.pressKey(" ");
  frame = await app.waitForFrame((frame) => spanRows(frame).length === 3);
  expect(keyHints(frame)).toContain("space fold");
});

test("dims the spans off the critical path", async () => {
  await using receiver = await startTestReceiver();
  await using app = await openTrace(receiver, FAILED_ROW);
  await app.waitForText("operation-f");

  app.mockInput.pressKey("c");
  await app.waitForFrame((frame) => keyHints(frame).includes("c all spans"));

  const frame = await app.captureSpans();
  expect(spanColors(lineSpans(frame, "operation-e"), "operation-e").fg).toEqual(
    color(THEME.textError),
  );
  expect(spanColors(lineSpans(frame, "operation-f"), "operation-f").fg).toEqual(
    color(THEME.textMuted),
  );
});
