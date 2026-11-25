import { isDefined } from "#utils/is-defined.ts";

import type { Span } from "./span.ts";

function spanEnd(span: Span) {
  return span.offset_ms + span.duration_ms;
}

export function traceDuration(spans: Span[]) {
  return spans.reduce((end, span) => Math.max(end, spanEnd(span)), 0);
}

export function selfTimes(spans: Span[]) {
  const children = Map.groupBy(spans, (span) => span.parent_span_id);
  return new Map(
    spans.map((span) => {
      const end = spanEnd(span);
      const earliestFirst = (children.get(span.span_id) ?? []).toSorted(
        (a, b) => a.offset_ms - b.offset_ms,
      );
      let cursor = span.offset_ms;
      let covered = 0;
      for (const child of earliestFirst) {
        const from = Math.max(child.offset_ms, cursor);
        const to = Math.min(spanEnd(child), end);
        if (to > from) {
          covered += to - from;
          cursor = to;
        }
      }
      return [span.span_id, span.duration_ms - covered];
    }),
  );
}

export function descendantCount(spans: Span[], span: Span) {
  const after = spans.slice(spans.indexOf(span) + 1);
  const end = after.findIndex((other) => other.depth <= span.depth);
  return end === -1 ? after.length : end;
}

export function hiddenCounts(spans: Span[], collapsed: ReadonlySet<string>) {
  return new Map(
    spans
      .filter((span) => collapsed.has(span.span_id))
      .map((span) => [span.span_id, descendantCount(spans, span)]),
  );
}

export function visibleSpans(spans: Span[], collapsed: ReadonlySet<string>) {
  const visible: Span[] = [];
  let hiddenBelowDepth: number | undefined;
  for (const span of spans) {
    if (isDefined(hiddenBelowDepth) && span.depth > hiddenBelowDepth) {
      continue;
    }
    hiddenBelowDepth = collapsed.has(span.span_id) ? span.depth : undefined;
    visible.push(span);
  }
  return visible;
}

export function ancestorIds(spans: Span[], spanId: string) {
  const byId = new Map(spans.map((span) => [span.span_id, span]));
  const ancestors: string[] = [];
  let parentId = byId.get(spanId)?.parent_span_id ?? null;
  while (isDefined(parentId) && byId.has(parentId)) {
    ancestors.push(parentId);
    parentId = byId.get(parentId)?.parent_span_id ?? null;
  }
  return ancestors;
}

export function expandTo(spans: Span[], collapsed: ReadonlySet<string>, spanId: string) {
  return collapsed.difference(new Set(ancestorIds(spans, spanId)));
}

export function criticalPath(spans: Span[]) {
  const children = Map.groupBy(spans, (span) => span.parent_span_id);

  const path = new Set<string>();

  function walk(span: Span, endLimit: number) {
    path.add(span.span_id);
    let cursor = Math.min(spanEnd(span), endLimit);
    const latestFirst = (children.get(span.span_id) ?? []).toSorted(
      (a, b) => spanEnd(b) - spanEnd(a),
    );
    for (const child of latestFirst) {
      if (child.offset_ms < cursor) {
        walk(child, cursor);
        cursor = child.offset_ms;
      }
    }
  }

  const [root] = spans;
  if (isDefined(root)) {
    walk(root, spanEnd(root));
  }
  return path;
}
