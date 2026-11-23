import { expect, test } from "bun:test";

import { renderPage } from "#testing/app.tsx";
import { at, fakeClock } from "#testing/clock.ts";
import { JSON_ROW, renderLogList } from "#testing/logs.ts";
import { logsRequest } from "#testing/otlp.ts";
import { startTestReceiver } from "#testing/receiver.ts";
import { detailsLineOf, detailsLines, lineOf } from "#testing/screen.ts";
import { failedTraceId, failedRootSpanId } from "#testing/traces.ts";
import { GESTURE_PAUSE_MS } from "#ui/use-scroll-gesture.ts";

test("shows the selected log's body, attributes, resource, and scope", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderLogList(receiver);

  app.mockInput.pressKey("END");
  const frame = await app.waitForFrame((frame) =>
    detailsLines(frame).includes("attribute.a value-a"),
  );

  expect(detailsLines(frame)).toEqual([
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
  await using receiver = await startTestReceiver();
  await using app = await renderLogList(receiver);

  await app.selectRow(JSON_ROW);
  const frame = await app.waitForText('"field-b": 200');

  expect(detailsLines(frame)).toEqual([
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
  await using receiver = await startTestReceiver();
  const body = [
    "message-a",
    ...Array.from({ length: 40 }, (_, index) => `line-${index + 100}`),
  ].join("\n");
  await receiver.sendHttp(
    "/v1/logs",
    logsRequest({ service: "service-a", logs: [{ time: at(0), body }] }),
  );
  await using app = await renderPage(receiver, "logs");
  await app.waitForFrame(
    (frame) => frame.includes("Logs over time") && detailsLines(frame).includes("message-a"),
  );

  app.mockInput.pressKey("d", { ctrl: true });
  await app.waitForFrame((frame) => !detailsLines(frame).includes("message-a"));

  app.mockInput.pressKey("u", { ctrl: true });
  await app.waitForFrame((frame) => detailsLines(frame).includes("message-a"));
});

test("scrolls the log panel only once the list's scroll gesture pauses", async () => {
  const clock = fakeClock(at(10_000));
  await using receiver = await startTestReceiver();
  const body = [
    "message-a",
    ...Array.from({ length: 40 }, (_, index) => `line-${index + 100}`),
  ].join("\n");
  await receiver.sendHttp(
    "/v1/logs",
    logsRequest({ service: "service-a", logs: [{ time: at(0), body }] }),
  );
  await using app = await renderPage(receiver, "logs");
  const frame = await app.waitForFrame(
    (frame) => frame.includes("Logs over time") && detailsLines(frame).includes("Body"),
  );
  const listLine = lineOf(frame, "● service-a");
  const panelLine = detailsLineOf(frame, "line-100");

  await app.mockMouse.scroll(2, listLine, "down");
  await app.mockMouse.scroll(2, panelLine, "down");
  expect(detailsLines(await app.waitForText("Body"))).toContain("Body");

  clock.advance(GESTURE_PAUSE_MS + 1);
  await app.mockMouse.scroll(2, panelLine, "down");
  await app.waitForFrame((frame) => !detailsLines(frame).includes("Body"));
});
