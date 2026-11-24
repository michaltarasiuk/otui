import {
  Client,
  StreamableHTTPClientTransport,
  type VersionNegotiationMode,
} from "@modelcontextprotocol/client";

import { startMcpServer } from "#mcp/mcp-server.ts";

import { freePort } from "./free-port.ts";
import type { TestReceiver } from "./receiver.ts";

const VERSION = "0.0.0";

export async function startTestMcp(
  receiver: TestReceiver,
  mode: VersionNegotiationMode = { pin: "2026-07-28" },
) {
  const connection = await receiver.connect();
  const server = startMcpServer({ connection, port: freePort(), version: VERSION });

  const versionNegotiation = { mode };
  const client = new Client({ name: "test", version: VERSION }, { versionNegotiation });
  const transport = new StreamableHTTPClientTransport(new URL(server.url));
  await client.connect(transport);

  async function call(name: string, args: Record<string, unknown> = {}) {
    const result = await client.callTool({ name, arguments: args });
    const texts = result.content.flatMap((item) => (item.type === "text" ? [item.text] : []));
    return { isError: result.isError === true, texts };
  }

  async function callOk(name: string, args: Record<string, unknown>) {
    const { isError, texts } = await call(name, args);
    if (isError) {
      throw new Error(`${name} failed: ${texts.join("\n")}`);
    }
    return texts;
  }

  async function callText(name: string, args: Record<string, unknown> = {}) {
    const texts = await callOk(name, args);
    return texts.join("\n");
  }

  async function callJson(name: string, args: Record<string, unknown> = {}): Promise<unknown> {
    const [json = ""] = await callOk(name, args);
    return JSON.parse(json);
  }

  return {
    url: server.url,
    client,
    call,
    callText,
    callJson,
    async [Symbol.asyncDispose]() {
      await client.close();
      await server[Symbol.asyncDispose]();
    },
  };
}
export type TestMcp = Awaited<ReturnType<typeof startTestMcp>>;
