import { expect, test } from "bun:test";

import { renderPage } from "#testing/app.tsx";
import { at } from "#testing/clock.ts";
import { fakeSpanId, fakeTraceId, tracesRequest } from "#testing/otlp.ts";
import {
  nestedRootSpanId,
  nestedTraceId,
  ERROR_MESSAGE,
  nestedChildSpanId,
  openTrace,
  failedRootSpanId,
} from "#testing/traces.ts";
import spanContent from "#traces/sql/span-content.sql" with { type: "text" };

test("shows the selected span's attributes, resource, and scope", async () => {
  const app = await openTrace("operation-a");

  const frame = await app.waitForText("Scope");

  expect(frame.details).toEqual([
    `operation-a ${nestedRootSpanId}`,
    "● service-a server 12:00:00.000 +0µs 120.0ms",
    "Attributes",
    "attribute.a value-a",
    "Resource",
    "resource.a value-a",
    "service.name service-a",
    "Scope",
    "scope-a 1.0.0",
  ]);
});

test("shows the selected span's events with their offsets", async () => {
  const app = await openTrace("operation-a");
  await app.waitForText("Scope");

  app.press("down");
  const frame = await app.waitForText("event-b");

  expect(frame.details).toEqual([
    `operation-b ${nestedChildSpanId}`,
    "● service-b server 12:00:00.010 +10.0ms 80.0ms",
    "Events",
    "-2.0ms event-a",
    "+5.0ms event-b",
    "attribute.b value-b",
    "event-c",
    "Resource",
    "service.name service-b",
  ]);
});

test("shows a span's links and status message", async () => {
  const app = await openTrace("operation-d");

  const frame = await app.waitForText("Links");

  expect(frame.details).toEqual([
    `operation-d ${failedRootSpanId}`,
    "● service-c server 12:00:01.000 +0µs 450.0ms",
    ERROR_MESSAGE,
    "Links",
    `${nestedTraceId} ${nestedRootSpanId}`,
    "attribute.c 4",
    "Resource",
    "service.name service-c",
  ]);
});

test("opens a linked trace from the links region and comes back", async () => {
  const app = await openTrace("operation-d");
  await app.waitFor((frame) => frame.details.includes("Links"));

  app.press("tab");
  await app.waitFor((frame) => frame.hints.includes("return open link"));
  app.press("return");

  expect(await app.waitForSelection("operation-a")).toContain("● service-a operation-a");
  app.press("escape");
  await app.waitForSelection("operation-d");
});

test("selects a span linked within the same trace", async () => {
  const traceId = fakeTraceId("c");
  const app = await renderPage("traces", {
    send: [
      tracesRequest({
        service: "service-a",
        spans: [
          { traceId, spanId: fakeSpanId("ca"), name: "operation-a", start: at(0), end: at(100) },
          {
            traceId,
            spanId: fakeSpanId("cb"),
            parentSpanId: fakeSpanId("ca"),
            name: "operation-b",
            start: at(10),
            end: at(40),
          },
          {
            traceId,
            spanId: fakeSpanId("cc"),
            parentSpanId: fakeSpanId("ca"),
            name: "operation-c",
            start: at(50),
            end: at(90),
            links: [
              { traceId, spanId: fakeSpanId("cb") },
              { traceId: fakeTraceId("d"), spanId: fakeSpanId("da") },
            ],
          },
        ],
      }),
    ],
  });
  await app.waitFor((frame) => frame.hints.includes("return open"));
  app.press("return");
  await app.waitFor((frame) => frame.spanRows.length === 3);
  await app.selectRow("operation-c");
  await app.waitFor((frame) =>
    frame.details.includes(`${traceId} ${fakeSpanId("cb")} (this trace)`),
  );

  app.press("tab");
  const frame = await app.waitFor((frame) => frame.hints.includes("return open link"));
  expect(frame.details).toContain(`${traceId} ${fakeSpanId("cb")} (this trace)`);
  expect(frame.details).toContain(`${fakeTraceId("d")} ${fakeSpanId("da")} (not stored)`);
  app.press("down");
  await app.waitFor((frame) => !frame.hints.includes("open link"));
  app.press("up");
  await app.waitFor((frame) => frame.hints.includes("return open link"));
  app.press("return");

  await app.waitForSelection("operation-b");
});

test("opens a link once its trace arrives", async () => {
  const linkedTraceId = fakeTraceId("f");
  const linkedSpanId = fakeSpanId("fa");
  const app = await renderPage("traces", {
    send: [
      tracesRequest({
        service: "service-a",
        spans: [
          {
            name: "operation-a",
            start: at(0),
            end: at(100),
            links: [{ traceId: linkedTraceId, spanId: linkedSpanId }],
          },
        ],
      }),
    ],
  });
  await app.waitFor((frame) => frame.hints.includes("return open"));
  app.press("return");
  await app.waitForText(`${linkedTraceId} ${linkedSpanId} (not stored)`);
  app.press("tab");

  await app.receiver.send(
    tracesRequest({
      service: "service-b",
      spans: [
        {
          traceId: linkedTraceId,
          spanId: linkedSpanId,
          name: "operation-b",
          start: at(-200),
          end: at(-100),
        },
      ],
    }),
  );

  const frame = await app.waitFor((frame) => frame.hints.includes("return open link"));
  expect(frame.details).toContain(`${linkedTraceId} ${linkedSpanId}`);
});

test("loads a span's details again after they failed to load", async () => {
  const app = await openTrace("operation-a", { failOnce: spanContent });
  await app.waitFor((frame) => frame.details.includes("Failed to load span details"));

  app.press("down");
  await app.waitFor((frame) => !frame.details.includes("Failed to load span details"));
  app.press("up");

  await app.waitFor((frame) => frame.details.includes("attribute.a value-a"));
});

test("scrolls the span panel down and back up", async () => {
  const attributes = Object.fromEntries(
    Array.from({ length: 30 }, (_, index) => [`attribute.${index + 1}`, "value-a"]),
  );
  const app = await renderPage("traces", {
    send: [
      tracesRequest({
        service: "service-a",
        spans: [
          {
            traceId: nestedTraceId,
            spanId: nestedRootSpanId,
            name: "operation-a",
            start: at(0),
            end: at(10),
            attributes,
          },
        ],
      }),
    ],
  });
  await app.waitFor((frame) => frame.tableRows.length === 1);
  app.press("return");
  await app.waitFor((frame) => frame.details.includes("attribute.1 value-a"));

  app.press("ctrl+d");
  await app.waitFor((frame) => !frame.details.includes("attribute.1 value-a"));

  app.press("ctrl+u");
  await app.waitFor((frame) => frame.details.includes("attribute.1 value-a"));
});
