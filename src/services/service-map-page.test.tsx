import { beforeEach, expect, test } from "bun:test";

import { type AppOptions, renderPage } from "#testing/app.tsx";
import { at, fakeClock } from "#testing/clock.ts";
import type { Frame } from "#testing/frame.ts";
import { fakeSpanId, fakeTraceId, SPAN_KIND, tracesRequest } from "#testing/otlp.ts";
import { otlpTraces } from "#testing/traces.ts";

beforeEach(() => {
  fakeClock(at(60_000));
});

function mapRows(frame: Frame) {
  const lines = frame.lines;
  const header = lines.findIndex((line) => line.startsWith("Service Rate"));
  return header === -1 ? [] : lines.slice(header + 1, -1);
}

async function renderMap(options?: AppOptions) {
  const app = await renderPage("services", options);
  app.press("m");
  await app.waitFor((frame) => / dependenc(y|ies)$/.test(frame.header));
  return app;
}

test("waits for spans that call another service", async () => {
  const app = await renderMap();

  const frame = await app.waitForText("Waiting for spans that call another service...");
  expect(frame.header).toBe("last 5 min · 0 dependencies");
});

test("nests each service's calls under it, with external peers as hollow leaves", async () => {
  const app = await renderMap({ send: [otlpTraces] });

  const frame = await app.waitFor((frame) => mapRows(frame).length === 5);

  expect(frame.header).toBe("last 5 min · 3 dependencies");
  expect(mapRows(frame)).toEqual([
    "● service-a",
    "● service-b 0.2/min 0.0% 80.0ms 80.0ms 80.0ms 1",
    "○ peer-a 0.2/min 0.0% 60.0ms 60.0ms 60.0ms 1",
    "● service-c",
    "● service-d 0.2/min 100.0% 300.0ms 300.0ms 300.0ms 1",
  ]);
  expect(frame.text).toContain("    ○ peer-a");
});

test("shows a peer even when its client span has children in the same service", async () => {
  const app = await renderMap({
    send: [
      tracesRequest({
        service: "service-a",
        spans: [
          {
            traceId: fakeTraceId("7"),
            spanId: fakeSpanId("7a"),
            name: "operation-a",
            kind: SPAN_KIND.client,
            start: at(0),
            end: at(30),
            attributes: { "db.system.name": "peer-a" },
          },
          {
            traceId: fakeTraceId("7"),
            spanId: fakeSpanId("7b"),
            parentSpanId: fakeSpanId("7a"),
            name: "operation-b",
            start: at(0),
            end: at(5),
          },
        ],
      }),
    ],
  });

  const frame = await app.waitFor((frame) => mapRows(frame).length === 2);

  expect(mapRows(frame)).toEqual(["● service-a", "○ peer-a 0.2/min 0.0% 30.0ms 30.0ms 30.0ms 1"]);
});

test("opens a called service's traces and comes back to the map", async () => {
  const app = await renderMap({ send: [otlpTraces] });
  await app.waitFor((frame) => mapRows(frame).length === 5);

  app.press("down");
  await app.waitForSelection("service-b");
  app.press("return");
  await app.waitFor((frame) => frame.header.startsWith("● service-b"));

  app.press("escape");
  await app.waitFor((frame) => / dependenc(y|ies)$/.test(frame.header));
  app.press("escape");
  await app.waitFor((frame) => frame.header === "last 5 min · 4 services");
});

test("has no traces key on an external peer", async () => {
  const app = await renderMap({ send: [otlpTraces] });
  await app.waitFor((frame) => mapRows(frame).length === 5);

  await app.selectRow("service-b");
  await app.waitFor((frame) => frame.hints.includes("return traces"));

  await app.selectRow("peer-a");

  const frame = await app.captureFrame();
  expect(frame.hints).toContain("escape back");
  expect(frame.hints).not.toContain("return traces");
});
