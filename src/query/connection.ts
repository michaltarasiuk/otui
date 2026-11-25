import type { DuckDBConnection } from "@duckdb/node-api";
import { createContext, use } from "react";

import { isDefined } from "#utils/is-defined.ts";

export const ConnectionContext = createContext<DuckDBConnection | undefined>(undefined);

export function useConnection() {
  const connection = use(ConnectionContext);
  if (!isDefined(connection)) {
    throw new Error("useConnection must be used within a ConnectionContext provider");
  }
  return connection;
}
