import { expect, test } from "bun:test";

import { renderApp } from "#testing/app.tsx";
import { at } from "#testing/clock.ts";
import { logsRequest } from "#testing/otlp.ts";
import { startTestReceiver } from "#testing/receiver.ts";
import { keyHints, tabBar } from "#testing/screen.ts";

test("shows where the receiver listens beside the tabs", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderApp(receiver);

  const frame = await app.waitForText("nothing received yet");

  const http = new URL(receiver.httpUrl).host;
  const grpc = new URL(receiver.grpcUrl).host;
  expect(tabBar(frame)).toBe(
    `Services Traces Metrics Logs nothing received yet · OTLP/HTTP ${http} · OTLP/gRPC ${grpc}`,
  );
  expect(keyHints(frame)).toBe("tab next region ? help");
});

test("counts the items received and says when the last arrived", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderApp(receiver);
  await app.waitForText("nothing received yet");

  await receiver.sendHttp(
    "/v1/logs",
    logsRequest({
      service: "service-a",
      logs: [
        { time: at(0), body: "message-a" },
        { time: at(1), body: "message-b" },
      ],
    }),
  );

  const frame = await app.waitForText("2 items received");
  expect(tabBar(frame)).toMatch(
    /^Services Traces Metrics Logs 2 items received (just now|\d+s ago) · OTLP\/HTTP/,
  );
});
