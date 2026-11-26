import { expect, test } from "bun:test";

import { renderPage } from "#testing/app.tsx";
import { at, fakeClock } from "#testing/clock.ts";
import { renderLogList } from "#testing/logs.ts";
import { logsRequest } from "#testing/otlp.ts";
import { failedTraceId, failedRootSpanId } from "#testing/traces.ts";
import { GESTURE_PAUSE_MS } from "#ui/use-scroll-gesture.ts";

test("shows the selected log's body, attributes, resource, and scope", async () => {
  const app = await renderLogList();

  app.press("end");
  const frame = await app.waitFor((frame) => frame.details.includes("attribute.a value-a"));

  expect(frame.details).toEqual([
    `INFO ● service-c 12:00:00.000 ${failedTraceId} ${failedRootSpanId}`,
    "Body",
    "message-a",
    "Attributes",
    "attribute.a value-a",
    "Resource",
    "resource.a value-a",
    "service.name service-c",
    "Scope",
    "scope-a",
  ]);
});

test("pretty-prints a JSON body", async () => {
  const app = await renderLogList();

  await app.selectRow("field-a");
  const frame = await app.waitForText('"field-b": 200');

  expect(frame.details).toEqual([
    "DEBUG ● service-h 12:00:03.000",
    "Body",
    "{",
    '"field-a": "value-a",',
    '"field-b": 200',
    "}",
    "Resource",
    "service.name service-h",
  ]);
});

test("scrolls the log panel down and back up", async () => {
  const body = [
    "message-a",
    ...Array.from({ length: 40 }, (_, index) => `line-${index + 100}`),
  ].join("\n");
  const app = await renderPage("logs", {
    send: [logsRequest({ service: "service-a", logs: [{ time: at(0), body }] })],
  });
  await app.waitFor(
    (frame) => frame.text.includes("Logs over time") && frame.details.includes("message-a"),
  );

  app.press("ctrl+d");
  await app.waitFor((frame) => !frame.details.includes("message-a"));

  app.press("ctrl+u");
  await app.waitFor((frame) => frame.details.includes("message-a"));
});

test("scrolls the log panel only once the list's scroll gesture pauses", async () => {
  const clock = fakeClock(at(10_000));
  const body = [
    "message-a",
    ...Array.from({ length: 40 }, (_, index) => `line-${index + 100}`),
  ].join("\n");
  const app = await renderPage("logs", {
    send: [logsRequest({ service: "service-a", logs: [{ time: at(0), body }] })],
  });
  const frame = await app.waitFor(
    (frame) => frame.text.includes("Logs over time") && frame.details.includes("Body"),
  );
  const listLine = frame.lineOf("● service-a");
  const panelLine = frame.detailsLineOf("line-100");

  await app.mockMouse.scroll(2, listLine, "down");
  await app.mockMouse.scroll(2, panelLine, "down");
  expect((await app.waitForText("Body")).details).toContain("Body");

  clock.advance(GESTURE_PAUSE_MS + 1);
  await app.mockMouse.scroll(2, panelLine, "down");
  await app.waitFor((frame) => !frame.details.includes("Body"));
});
