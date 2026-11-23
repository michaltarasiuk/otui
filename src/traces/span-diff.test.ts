import { expect, test } from "bun:test";

import { diffOperations, diffSpans, selfDelta, hasChanged, type SpanDiff } from "./span-diff.ts";
import type { Span } from "./span.ts";

function span(
  span_id: string,
  parent_span_id: string | null,
  depth: number,
  name: string,
  offset_ms: number,
  duration_ms: number,
): Span {
  return {
    span_id,
    parent_span_id,
    depth,
    offset_ms,
    duration_ms,
    service_name: "service-a",
    name,
    kind: "internal",
    is_error: false,
    status_message: null,
    start_time: offset_ms,
  };
}

function queries(parentId: string, count: number, durationMs: number) {
  return Array.from({ length: count }, (_, index) =>
    span(`${parentId}-q${index}`, parentId, 1, "operation-d", 10 + index, durationMs),
  );
}

function outline(rows: SpanDiff[]) {
  return rows.map(
    (row) =>
      `${"  ".repeat(row.depth)}${row.name} ${row.before?.duration_ms ?? "-"} → ${row.after?.duration_ms ?? "-"}`,
  );
}

test("pairs the spans at the same place in both traces", () => {
  const before = [
    span("a", null, 0, "operation-a", 0, 100),
    span("a1", "a", 1, "operation-b", 10, 60),
    span("a2", "a", 1, "operation-c", 70, 20),
  ];
  const after = [
    span("b", null, 0, "operation-a", 0, 300),
    span("b1", "b", 1, "operation-b", 10, 250),
    span("b2", "b", 1, "operation-c", 270, 20),
  ];

  expect(outline(diffSpans(before, after))).toEqual([
    "operation-a 100 → 300",
    "  operation-b 60 → 250",
    "  operation-c 20 → 20",
  ]);
});

test("pairs repeated siblings in order and keeps the extra ones apart", () => {
  const before = [span("a", null, 0, "operation-a", 0, 50), ...queries("a", 2, 5)];
  const after = [span("b", null, 0, "operation-a", 0, 200), ...queries("b", 4, 5)];

  expect(outline(diffSpans(before, after))).toEqual([
    "operation-a 50 → 200",
    "  operation-d 5 → 5",
    "  operation-d 5 → 5",
    "  operation-d - → 5",
    "  operation-d - → 5",
  ]);
});

test("adds or removes the whole subtree of a span only one trace has", () => {
  const before = [
    span("a", null, 0, "operation-a", 0, 100),
    span("a1", "a", 1, "operation-b", 10, 60),
    span("a2", "a1", 2, "operation-d", 20, 40),
  ];
  const after = [span("b", null, 0, "operation-a", 0, 30)];

  expect(outline(diffSpans(before, after))).toEqual([
    "operation-a 100 → 30",
    "  operation-b 60 → -",
    "    operation-d 40 → -",
  ]);
});

test("pairs spans whose parent never arrived as roots", () => {
  const before = [
    span("a", null, 0, "operation-a", 0, 100),
    span("o", "gone", 0, "operation-e", 120, 9),
  ];
  const after = [
    span("b", null, 0, "operation-a", 0, 100),
    span("p", "lost", 0, "operation-e", 110, 7),
  ];

  expect(outline(diffSpans(before, after))).toEqual(["operation-a 100 → 100", "operation-e 9 → 7"]);
});

test("keeps each row's ID when the traces swap sides", () => {
  const before = [span("a", null, 0, "operation-a", 0, 50), ...queries("a", 1, 5)];
  const after = [span("b", null, 0, "operation-a", 0, 200), ...queries("b", 3, 5)];

  const ids = diffSpans(before, after).map((row) => row.id);
  const swapped = diffSpans(after, before).map((row) => row.id);

  expect(swapped).toEqual(ids);
  expect(new Set(ids).size).toBe(ids.length);
});

test("counts a span as changed when only one trace has it or it moved by more than a tenth", () => {
  const [root, same, slower, added] = diffSpans(
    [
      span("a", null, 0, "operation-a", 0, 100),
      span("a1", "a", 1, "operation-b", 0, 100),
      span("a2", "a", 1, "operation-c", 0, 100),
    ],
    [
      span("b", null, 0, "operation-a", 0, 105),
      span("b1", "b", 1, "operation-b", 0, 105),
      span("b2", "b", 1, "operation-c", 1, 150),
      span("b3", "b", 1, "operation-f", 2, 1),
    ],
  );

  expect([root, same, slower, added].map((row) => row !== undefined && hasChanged(row))).toEqual([
    false,
    false,
    true,
    true,
  ]);
  expect(selfDelta(slower!)).toBe(50);
  expect(selfDelta(added!)).toBe(1);
});

test("sums each operation's self time in both traces, biggest change first", () => {
  const before = [span("a", null, 0, "operation-a", 0, 50), ...queries("a", 2, 5)];
  const after = [span("b", null, 0, "operation-a", 0, 60), ...queries("b", 40, 5)];

  expect(diffOperations(before, after)).toEqual([
    {
      id: JSON.stringify(["service-a", "operation-d"]),
      serviceName: "service-a",
      name: "operation-d",
      beforeCount: 2,
      afterCount: 40,
      beforeMs: 10,
      afterMs: 200,
    },
    {
      id: JSON.stringify(["service-a", "operation-a"]),
      serviceName: "service-a",
      name: "operation-a",
      beforeCount: 1,
      afterCount: 1,
      beforeMs: 44,
      afterMs: 16,
    },
  ]);
});
