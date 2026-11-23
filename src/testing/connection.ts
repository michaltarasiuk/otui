import { spyOn } from "bun:test";

import type { DuckDBConnection } from "@duckdb/node-api";

export function failOnce(connection: DuckDBConnection, sql: string) {
  const runAndReadAll = connection.runAndReadAll.bind(connection);
  let failed = false;
  return spyOn(connection, "runAndReadAll").mockImplementation((...args) => {
    if (args[0] !== sql || failed) {
      return runAndReadAll(...args);
    }
    failed = true;
    return Promise.reject(new Error("The query failed"));
  });
}
