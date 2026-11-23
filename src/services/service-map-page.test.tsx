import { beforeEach, expect, test } from "bun:test";

import { renderPage } from "#testing/app.tsx";
import { at, fakeClock } from "#testing/clock.ts";
import { fakeSpanId, fakeTraceId, SPAN_KIND, tracesRequest } from "#testing/otlp.ts";
import { startTestReceiver, type TestReceiver } from "#testing/receiver.ts";
import { keyHints, pageHeader, textLines } from "#testing/screen.ts";
import { otlpTraces } from "#testing/traces.ts";

const MAP_ROWS = [
  "● service-a",
  "● service-b 0.2/min 0.0% 80.0ms 80.0ms 80.0ms 1",
  "○ peer-a 0.2/min 0.0% 60.0ms 60.0ms 60.0ms 1",
  "● service-c",
  "● service-d 0.2/min 100.0% 300.0ms 300.0ms 300.0ms 1",
];

beforeEach(() => {
  fakeClock(at(60_000));
});

function mapRows(frame: string) {
  const lines = textLines(frame);
  const header = lines.findIndex((line) => line.startsWith("Service Rate"));
  return header === -1 ? [] : lines.slice(header + 1, -1);
}

async function renderMap(receiver: TestReceiver) {
  const app = await renderPage(receiver, "services");
  app.mockInput.pressKey("m");
  await app.waitForFrame((frame) => / dependenc(y|ies)$/.test(pageHeader(frame)));
  return app;
}

test("waits for spans that call another service", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderMap(receiver);

  const frame = await app.waitForText("Waiting for spans that call another service...");
  expect(pageHeader(frame)).toBe("last 5 min · 0 dependencies");
});

test("nests each service's calls under it, with external peers as hollow leaves", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/traces", otlpTraces);
  await using app = await renderMap(receiver);

  const frame = await app.waitForFrame((frame) => mapRows(frame).length === MAP_ROWS.length);

  expect(pageHeader(frame)).toBe("last 5 min · 3 dependencies");
  expect(mapRows(frame)).toEqual(MAP_ROWS);
  expect(frame).toContain("    ○ peer-a");
});

test("shows a peer even when its client span has children in the same service", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp(
    "/v1/traces",
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
  );
  await using app = await renderMap(receiver);

  const frame = await app.waitForFrame((frame) => mapRows(frame).length === 2);

  expect(mapRows(frame)).toEqual(["● service-a", "○ peer-a 0.2/min 0.0% 30.0ms 30.0ms 30.0ms 1"]);
});

test("opens a called service's traces and comes back to the map", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/traces", otlpTraces);
  await using app = await renderMap(receiver);
  await app.waitForFrame((frame) => mapRows(frame).length === MAP_ROWS.length);

  app.mockInput.pressArrow("down");
  await app.waitForSelection("service-b");
  app.mockInput.pressEnter();
  await app.waitForFrame((frame) => pageHeader(frame).startsWith("● service-b"));

  app.mockInput.pressEscape();
  await app.waitForFrame((frame) => / dependenc(y|ies)$/.test(pageHeader(frame)));
  app.mockInput.pressEscape();
  await app.waitForFrame((frame) => pageHeader(frame) === "last 5 min · 4 services");
});

test("has no traces key on an external peer", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/traces", otlpTraces);
  await using app = await renderMap(receiver);
  await app.waitForFrame((frame) => mapRows(frame).length === MAP_ROWS.length);

  await app.selectRow("service-b");
  await app.waitForFrame((frame) => keyHints(frame).includes("return traces"));

  await app.selectRow("peer-a");

  const frame = await app.captureFrame();
  expect(keyHints(frame)).toContain("escape back");
  expect(keyHints(frame)).not.toContain("return traces");
});
