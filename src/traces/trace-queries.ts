import type { DuckDBConnection } from "@duckdb/node-api";
import { queryOptions } from "@tanstack/react-query";

import { isDefined } from "#utils/is-defined.ts";

import {
  readSpanContent,
  readSpanMatches,
  readTraceCount,
  readTraceList,
  readTraceSpans,
  readTraceTimeline,
  type TraceFilter,
  type TraceQuery,
} from "./read-traces.ts";

const TRACE_LIMIT = 500;

export function traceListQuery(connection: DuckDBConnection, query: TraceQuery) {
  return queryOptions({
    queryKey: ["traces", query],
    queryFn: async () => {
      const [traces, totalCount] = await Promise.all([
        readTraceList(connection, query, TRACE_LIMIT),
        readTraceCount(connection),
      ]);
      return { traces, totalCount };
    },
  });
}

export function traceTimelineQuery(connection: DuckDBConnection, filter: TraceFilter) {
  return queryOptions({
    queryKey: ["traces", "timeline", filter],
    queryFn: () => readTraceTimeline(connection, filter),
  });
}

export function traceSpansQuery(connection: DuckDBConnection, traceId: string) {
  return queryOptions({
    queryKey: ["traces", traceId, "spans"],
    queryFn: () => readTraceSpans(connection, traceId),
  });
}

export function spanMatchesQuery(connection: DuckDBConnection, traceId: string, search: string) {
  return queryOptions({
    queryKey: ["traces", traceId, "matches", search],
    queryFn: () => (search === "" ? null : readSpanMatches(connection, traceId, search)),
  });
}

export function spanContentQuery(
  connection: DuckDBConnection,
  traceId: string,
  spanId: string | undefined,
) {
  return queryOptions({
    queryKey: ["traces", traceId, "spans", spanId],
    queryFn: () => (isDefined(spanId) ? readSpanContent(connection, traceId, spanId) : null),
  });
}
