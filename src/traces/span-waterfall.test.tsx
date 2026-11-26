import { expect, test } from "bun:test";

import { hex, type StyledFrame } from "#testing/styled-frame.ts";
import { ERROR_MESSAGE, failedTraceId, missingParentId, openTrace } from "#testing/traces.ts";
import { serviceColor, THEME } from "#ui/theme.ts";
import { collapseWhitespace } from "#utils/text.ts";

function barExtent({ lines }: StyledFrame, name: string, color: string) {
  const row = lines.find(
    (line) => line.text.includes(name) && line.spans.some((span) => hex(span.bg) === color),
  );
  let column = 0;
  let start = -1;
  let end = -1;
  for (const span of row?.spans ?? []) {
    if (hex(span.bg) === color) {
      start = start === -1 ? column : start;
      end = column + span.width;
    }
    column += span.width;
  }
  return { start, end };
}

test("opens a trace as a span waterfall", async () => {
  const app = await openTrace("operation-d");

  const frame = await app.waitFor((frame) => frame.spanRows.length === 3);

  expect(frame.list.slice(0, 3)).toEqual([
    `operation-d ${failedTraceId}`,
    "● service-c 12:00:01.000 3 spans 2 errors 500.0ms",
    "Service Name Duration 0 500.0ms",
  ]);
  expect(frame.spanRows.map((row) => collapseWhitespace(row))).toEqual([
    `● service-c operation-d 450.0ms`,
    "● service-d operation-e 300.0ms",
    "● service-e operation-f 40.0ms",
  ]);
});

test("indents each span under its parent", async () => {
  const app = await openTrace("operation-a");

  const [root, child, grandchild] = (await app.waitForText("operation-c")).spanRows;
  const nameColumn = root?.indexOf("operation-a") ?? -1;

  expect(child?.indexOf("operation-b")).toBe(nameColumn + 2);
  expect(grandchild?.indexOf("operation-c")).toBe(nameColumn + 4);
});

test("draws each span's bar inside its parent's bar", async () => {
  const app = await openTrace("operation-a");
  await app.waitForText("operation-c");

  const frame = await app.captureStyles();
  const root = barExtent(frame, "operation-a", serviceColor("service-a"));
  const child = barExtent(frame, "operation-b", serviceColor("service-b"));
  const grandchild = barExtent(frame, "operation-c", serviceColor("service-b"));

  expect(root.start).toBeLessThan(child.start);
  expect(child.start).toBeLessThan(grandchild.start);
  expect(grandchild.end).toBeLessThan(child.end);
  expect(child.end).toBeLessThan(root.end);
});

test("points out a span whose parent never arrived", async () => {
  const app = await openTrace("operation-d");
  await app.waitFor((frame) => frame.details.includes(ERROR_MESSAGE));

  app.press("end");
  const frame = await app.waitForText("not received");

  expect(frame.lines).toContain(
    `● service-e consumer 12:00:01.460 +460.0ms 40.0ms parent ${missingParentId} not received`,
  );
});

test("opens a trace whose spans have no kind", async () => {
  const app = await openTrace("operation-g");

  const frame = await app.waitForText("unspecified");

  expect(frame.lines).toContain("● service-f unspecified 12:00:02.000 +0µs 1.0ms");
});

test("colors the names of spans with errors", async () => {
  const app = await openTrace("operation-d");
  await app.waitForText("operation-f");

  const frame = await app.captureStyles();

  expect(frame.line("operation-e").fg("operation-e")).toBe(THEME.textError);
  expect(frame.line("operation-f").fg("operation-f")).toBe(THEME.text);
});

test("folds and unfolds the selected span's children", async () => {
  const app = await openTrace("operation-a");
  await app.waitFor((frame) => frame.spanRows.length === 3);

  app.press("space");
  let frame = await app.waitFor((frame) => frame.spanRows.length === 1);
  expect(collapseWhitespace(frame.spanRows[0] ?? "")).toBe("● service-a operation-a +2 120.0ms");
  expect(frame.hints).toContain("space unfold");

  app.press("space");
  frame = await app.waitFor((frame) => frame.spanRows.length === 3);
  expect(frame.hints).toContain("space fold");
});

test("dims the spans off the critical path", async () => {
  const app = await openTrace("operation-d");
  await app.waitForText("operation-f");

  app.press("c");
  await app.waitFor((frame) => frame.hints.includes("c all spans"));

  const frame = await app.captureStyles();
  expect(frame.line("operation-e").fg("operation-e")).toBe(THEME.textError);
  expect(frame.line("operation-f").fg("operation-f")).toBe(THEME.textMuted);
});
