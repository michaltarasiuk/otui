import type { DuckDBConnection } from "@duckdb/node-api";
import { queryOptions } from "@tanstack/react-query";

import {
  type LogFilter,
  type LogQuery,
  readLogCount,
  readLogList,
  readLogTimeline,
} from "./read-logs.ts";

const LOG_LIMIT = 500;

export function logListQuery(connection: DuckDBConnection, query: LogQuery) {
  return queryOptions({
    queryKey: ["logs", query],
    queryFn: async () => {
      const [logs, totalCount] = await Promise.all([
        readLogList(connection, query, LOG_LIMIT),
        readLogCount(connection),
      ]);
      return { logs, totalCount };
    },
  });
}

export function logTimelineQuery(connection: DuckDBConnection, filter: LogFilter) {
  return queryOptions({
    queryKey: ["logs", "timeline", filter],
    queryFn: () => readLogTimeline(connection, filter),
  });
}
