import type { DuckDBConnection } from "@duckdb/node-api";
import {
  createMcpHandler,
  hostHeaderValidationResponse,
  localhostAllowedHostnames,
  localhostAllowedOrigins,
  McpServer,
  originValidationResponse,
} from "@modelcontextprotocol/server";
import dedent from "dedent";

import { LOOPBACK_HOST } from "#utils/loopback.ts";
import { StartupError } from "#utils/startup-error.ts";

import { registerTools } from "./tools.ts";

interface McpServerOptions {
  connection: DuckDBConnection;
  port: number;
  version: string;
}

export function startMcpServer({ connection, port, version }: McpServerOptions) {
  const handler = createMcpHandler(() => {
    const server = new McpServer({ name: "otui", version });
    registerTools(server, connection);
    return server;
  });

  function respond(request: Request) {
    const rejected =
      hostHeaderValidationResponse(request, localhostAllowedHostnames()) ??
      originValidationResponse(request, localhostAllowedOrigins());
    return rejected ?? handler.fetch(request);
  }

  try {
    const httpServer = Bun.serve({
      hostname: LOOPBACK_HOST,
      port,
      routes: { "/mcp": (request) => respond(request) },
      fetch: () => new Response("Not found", { status: 404 }),
    });
    return {
      url: `http://${LOOPBACK_HOST}:${port}/mcp`,
      async [Symbol.asyncDispose]() {
        await handler.close();
        await httpServer.stop(true);
      },
    };
  } catch (error) {
    throw new StartupError(
      dedent`
        couldn't serve MCP on ${LOOPBACK_HOST}:${port}; pick another port with --mcp-port
        ${error instanceof Error ? error.message : String(error)}
      `,
      { cause: error },
    );
  }
}
