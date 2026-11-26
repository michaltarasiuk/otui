import { expect, test } from "bun:test";

import { renderPage } from "#testing/app.tsx";
import { hex, type StyledLine } from "#testing/styled-frame.ts";
import {
  nestedTraceId,
  otlpTraces,
  renderComparison,
  slowNestedTraceId,
  slowNestedTraces,
} from "#testing/traces.ts";
import { THEME } from "#ui/theme.ts";

const WIDE = { size: { width: 140, height: 30 } };

test("compares the marked trace with the selected one span by span", async () => {
  const app = await renderComparison(WIDE);

  const frame = await app.waitFor((frame) => frame.spanDiffRows.length === 4);

  expect(frame.lines).toContain("operation-a 11111111 → 66666666");
  expect(frame.lines).toContain("● service-a 120.0ms → 300.0ms +180.0ms 3 → 4 spans");
  expect(frame.spanDiffRows).toEqual([
    "● service-a operation-a 40.0ms 60.0ms +20.0ms",
    "● service-b operation-b 20.0ms 40.0ms +20.0ms",
    "● service-b operation-c 60.0ms 60.0ms +0µs",
    "● service-b operation-c - 140.0ms added",
  ]);
});

test("sums each operation's self time in both traces, biggest change first", async () => {
  const app = await renderComparison(WIDE);

  const frame = await app.waitFor((frame) => frame.details.length > 0);

  expect(frame.details.slice(0, 4)).toEqual([
    "Service Operation Spans Self before Self after Change -140.0ms 0 +140.0ms",
    "● service-b operation-c 1 → 2 60.0ms 200.0ms +140.0ms",
    "● service-a operation-a 1 → 1 40.0ms 60.0ms +20.0ms",
    `● service-b operation-b 1 → 1 20.0ms 40.0ms +20.0ms`,
  ]);
});

test("shows only the spans that changed", async () => {
  const app = await renderComparison(WIDE);

  app.press("d");
  const frame = await app.waitFor((frame) => frame.spanDiffRows.length === 3);

  expect(frame.spanDiffRows).toEqual([
    "● service-a operation-a 40.0ms 60.0ms +20.0ms",
    "● service-b operation-b 20.0ms 40.0ms +20.0ms",
    "● service-b operation-c - 140.0ms added",
  ]);
  expect(frame.hints).toContain("d all spans");
});

test("swaps the traces and keeps the selected span", async () => {
  const app = await renderComparison(WIDE);
  app.press("e");
  await app.waitForSelection("added");

  app.press("x");
  const frame = await app.waitFor((frame) =>
    frame.lines.includes("operation-a 66666666 → 11111111"),
  );

  expect(frame.spanDiffRows[0]).toBe("● service-a operation-a 60.0ms 40.0ms -20.0ms");
  expect(await app.waitForSelection("removed")).toBe("● service-b operation-c 140.0ms - removed");
});

test("opens a span in the trace where it took longer, then comes back", async () => {
  const app = await renderComparison(WIDE);
  app.press("x");
  await app.waitFor((frame) => frame.lines.includes("operation-a 66666666 → 11111111"));
  app.press("down");
  await app.waitForSelection("operation-b");

  app.press("return");
  await app.waitFor((frame) => frame.lines.includes(`operation-a ${slowNestedTraceId}`));
  expect(await app.waitForSelection("operation-b")).toBe(`● service-b operation-b 240.0ms`);

  app.press("escape");
  await app.waitFor((frame) => frame.spanDiffRows.length === 4);
  expect(await app.waitForSelection("operation-b")).toBe(
    `● service-b operation-b 40.0ms 20.0ms -20.0ms`,
  );

  app.press("escape");
  const frame = await app.waitFor((frame) => frame.header.endsWith("4 traces"));
  expect(frame.header).toBe("vs operation-a 120.0ms 4 traces");
  await app.waitForSelection("operation-a 4 300.0ms");
  expect(frame.hints).toContain("v compare");
});

function barColors(line: StyledLine) {
  return line.spans.filter((span) => span.text.trim() === "").map((span) => hex(span.bg));
}

test("grows the bar in red when a span got slower and in blue when it got faster", async () => {
  const app = await renderComparison(WIDE);
  await app.waitFor((frame) => frame.spanDiffRows.length === 4);

  let frame = await app.captureStyles();
  expect(barColors(frame.line(`operation-b `))).toContain(THEME.textError);
  expect(barColors(frame.line(`operation-b `))).not.toContain(THEME.bar);

  app.press("x");
  await app.waitFor((frame) => frame.lines.includes("operation-a 66666666 → 11111111"));
  frame = await app.captureStyles();
  expect(barColors(frame.line(`operation-b `))).toContain(THEME.bar);
  expect(barColors(frame.line(`operation-b `))).not.toContain(THEME.textError);
});

test("offers to compare only traces with the same root span", async () => {
  const app = await renderPage("traces", { ...WIDE, send: [otlpTraces, slowNestedTraces] });
  await app.waitForRows([
    "operation-a 4 300.0ms",
    "operation-g",
    "operation-d",
    "operation-a 3 120.0ms",
  ]);
  await app.selectRow("operation-a 3 120.0ms");
  app.press("m");
  await app.waitFor((frame) => frame.hints.includes("m unmark"));

  app.press("up");
  const frame = await app.waitFor((frame) => frame.hints.includes("m mark"));
  await app.waitForSelection("operation-d");
  expect(frame.hints).not.toContain("v compare");

  await app.selectRow("operation-a 4 300.0ms");
  await app.waitFor((frame) => frame.hints.includes("v compare"));
});

test("drops the compare key when the marked trace is gone", async () => {
  const app = await renderComparison(WIDE);
  app.press("escape");
  await app.waitFor((frame) => frame.hints.includes("v compare"));

  await app.receiver.run("DELETE FROM otlp_traces WHERE trace_id = $traceId", {
    traceId: nestedTraceId,
  });

  const frame = await app.waitFor((frame) => frame.header.startsWith("vs operation-a 3 traces"));
  expect(frame.hints).not.toContain("v compare");
});

test("marks a trace on its waterfall and compares another one from there", async () => {
  const app = await renderPage("traces", { ...WIDE, send: [otlpTraces, slowNestedTraces] });
  await app.waitForRows([
    "operation-a 4 300.0ms",
    "operation-g",
    "operation-d",
    "operation-a 3 120.0ms",
  ]);
  await app.selectRow("operation-a 3 120.0ms");
  app.press("return");
  await app.waitFor((frame) => frame.lines.includes(`operation-a ${nestedTraceId}`));

  app.press("m");
  await app.waitFor((frame) => frame.hints.includes("m unmark"));
  app.press("escape");
  await app.waitFor((frame) => frame.header.includes("vs operation-a 120.0ms"));
  await app.selectRow("operation-a 4 300.0ms");
  app.press("return");
  let frame = await app.waitFor((frame) => frame.onDetails && frame.hints.includes("v compare"));
  expect(frame.lines).toContain(`operation-a ${slowNestedTraceId}`);

  app.press("v");
  frame = await app.waitFor((frame) => frame.spanDiffRows.length === 4);
  expect(frame.lines).toContain("operation-a 11111111 → 66666666");
});
