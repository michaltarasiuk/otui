import { onTestFinished } from "bun:test";

import {
  Client,
  StreamableHTTPClientTransport,
  type VersionNegotiationMode,
} from "@modelcontextprotocol/client";

import { startMcpServer } from "#mcp/mcp-server.ts";

import { freePort } from "./free-port.ts";
import type { OtlpRequest } from "./otlp.ts";
import { startTestReceiver } from "./receiver.ts";

const VERSION = "0.0.0";

interface McpOptions {
  send?: OtlpRequest[];
  mode?: VersionNegotiationMode;
}

export async function startTestMcp({ send = [], mode = { pin: "2026-07-28" } }: McpOptions = {}) {
  const resources = new AsyncDisposableStack();
  onTestFinished(() => resources.disposeAsync());

  const receiver = resources.use(await startTestReceiver());
  await receiver.send(...send);
  const connection = await receiver.connect();
  const server = resources.use(startMcpServer({ connection, port: freePort(), version: VERSION }));

  const versionNegotiation = { mode };
  const client = new Client({ name: "test", version: VERSION }, { versionNegotiation });
  await client.connect(new StreamableHTTPClientTransport(new URL(server.url)));
  resources.defer(() => client.close());

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

  return { url: server.url, client, receiver, call, callText, callJson };
}
