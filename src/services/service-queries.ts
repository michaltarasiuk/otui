import type { DuckDBConnection } from "@duckdb/node-api";
import { queryOptions } from "@tanstack/react-query";

import {
  readServiceCalls,
  readServiceList,
  readServiceOperations,
  type ServiceQuery,
} from "./read-services.ts";

export function serviceListQuery(connection: DuckDBConnection, query: ServiceQuery) {
  return queryOptions({
    queryKey: ["services", query],
    queryFn: () => readServiceList(connection, query),
  });
}

export function serviceOperationsQuery(
  connection: DuckDBConnection,
  serviceName: string | undefined,
) {
  return queryOptions({
    queryKey: ["services", serviceName, "operations"],
    queryFn: () =>
      serviceName === undefined ? [] : readServiceOperations(connection, serviceName),
  });
}

export function serviceCallsQuery(connection: DuckDBConnection) {
  return queryOptions({
    queryKey: ["services", "calls"],
    queryFn: () => readServiceCalls(connection),
  });
}
