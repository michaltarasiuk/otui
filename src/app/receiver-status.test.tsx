import { expect, test } from "bun:test";

import { renderApp } from "#testing/app.tsx";
import { at } from "#testing/clock.ts";
import { logsRequest } from "#testing/otlp.ts";

test("shows where the receiver listens beside the tabs", async () => {
  const app = await renderApp();

  const frame = await app.waitForText("nothing received yet");

  const http = new URL(app.receiver.httpUrl).host;
  const grpc = new URL(app.receiver.grpcUrl).host;
  expect(frame.tabBar).toBe(
    `Traces Metrics Logs nothing received yet · OTLP/HTTP ${http} · OTLP/gRPC ${grpc}`,
  );
  expect(frame.hints).toBe("tab next region ? help");
});

test("counts the items received and says when the last arrived", async () => {
  const app = await renderApp();
  await app.waitForText("nothing received yet");

  await app.receiver.send(
    logsRequest({
      service: "service-a",
      logs: [
        { time: at(0), body: "message-a" },
        { time: at(1), body: "message-b" },
      ],
    }),
  );

  const frame = await app.waitForText("2 items received");
  expect(frame.tabBar).toMatch(
    /^Traces Metrics Logs 2 items received (just now|\d+s ago) · OTLP\/HTTP/,
  );
});
