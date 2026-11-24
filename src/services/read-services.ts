import type { DuckDBConnection } from "@duckdb/node-api";

import serviceCalls from "#services/sql/service-calls.sql" with { type: "text" };
import serviceList from "#services/sql/service-list.sql" with { type: "text" };
import serviceOperations from "#services/sql/service-operations.sql" with { type: "text" };
import { substringPattern } from "#telemetry/substring-pattern.ts";
import { sortParams } from "#utils/sort.ts";

import { Call, Operation, SERVICE_WINDOW_MS, Service, type ServiceSort } from "./service.ts";

const OPERATION_LIMIT = 50;

function windowParams() {
  return { fromMs: Date.now() - SERVICE_WINDOW_MS, windowMs: SERVICE_WINDOW_MS };
}

export interface ServiceQuery {
  search: string;
  sort: ServiceSort;
}

export async function readServiceList(
  connection: DuckDBConnection,
  { search, sort }: ServiceQuery,
) {
  const reader = await connection.runAndReadAll(serviceList, {
    ...windowParams(),
    pattern: substringPattern(search),
    ...sortParams(sort),
  });
  return Service.array().parse(reader.getRowObjectsJS());
}

export async function readServiceOperations(connection: DuckDBConnection, serviceName: string) {
  const reader = await connection.runAndReadAll(serviceOperations, {
    ...windowParams(),
    serviceName,
    limit: OPERATION_LIMIT,
  });
  return Operation.array().parse(reader.getRowObjectsJS());
}

export async function readServiceCalls(connection: DuckDBConnection) {
  const reader = await connection.runAndReadAll(serviceCalls, windowParams());
  return Call.array().parse(reader.getRowObjectsJS());
}
