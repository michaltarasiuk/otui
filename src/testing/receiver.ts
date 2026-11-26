import type { DuckDBConnection } from "@duckdb/node-api";

import { startReceiver } from "#receiver/receiver.ts";
import { LOOPBACK_HOST } from "#utils/loopback.ts";

import { freePortPair } from "./free-port.ts";
import type { OtlpRequest } from "./otlp.ts";

interface TestReceiverOptions {
  retentionMs?: number;
  memoryLimitBytes?: number;
}

export async function startTestReceiver({
  retentionMs = 60 * 60 * 1000,
  memoryLimitBytes = 1024 * 1024 * 1024,
}: TestReceiverOptions = {}) {
  const [httpPort, grpcPort] = freePortPair();
  const receiver = await startReceiver({
    host: LOOPBACK_HOST,
    httpPort,
    grpcPort,
    retentionMs,
    memoryLimitBytes,
  });
  const connection = await receiver.connect();
  const uri = `otlp:${new URL(receiver.httpUrl).host}`;

  function flush() {
    return connection.run("SELECT * FROM otlp_flush($uri)", { uri });
  }

  async function post({ path, body }: OtlpRequest) {
    const response = await fetch(new URL(path, receiver.httpUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      throw new Error(`POST ${path} failed with ${response.status}: ${await response.text()}`);
    }
  }

  async function send(...requests: OtlpRequest[]) {
    for (const request of requests) {
      await post(request);
    }
    await flush();
  }

  return {
    httpUrl: receiver.httpUrl,
    grpcUrl: receiver.grpcUrl,
    connect: () => receiver.connect(),
    run: (...args: Parameters<DuckDBConnection["run"]>) => connection.run(...args),
    clear: () => receiver.clear(),
    send,
    [Symbol.asyncDispose]: () => receiver[Symbol.asyncDispose](),
  };
}
export type TestReceiver = Awaited<ReturnType<typeof startTestReceiver>>;
