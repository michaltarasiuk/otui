import { expect, test } from "bun:test";

import { at, fakeClock } from "#testing/clock.ts";
import { logsRequest, SEVERITY_NUMBER } from "#testing/otlp.ts";
import { startTestReceiver } from "#testing/receiver.ts";
import {
  color,
  detailsLines,
  keyHints,
  lineOf,
  lineSpans,
  onDetails,
  pageHeader,
  spanColors,
  spanRows,
  tableRows,
  textLines,
} from "#testing/screen.ts";
import {
  nestedRootSpanId,
  NESTED_ROW,
  nestedTraceId,
  ERROR_CAUSE,
  ERROR_MESSAGE,
  failedChildSpanId,
  FAILED_ROW,
  failedTraceId,
  openTrace,
  failedRootSpanId,
  renderTraceList,
  SINGLE_ROW,
} from "#testing/traces.ts";
import { THEME } from "#ui/theme.ts";
import { GESTURE_PAUSE_MS } from "#ui/use-scroll-gesture.ts";
import { collapseWhitespace } from "#utils/text.ts";

test("draws the waterfall on the frame the trace first shows", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderTraceList(receiver);
  await app.selectRow(NESTED_ROW);

  app.mockInput.pressEnter();
  const frame = await app.waitForFrame(onDetails);

  expect(spanRows(frame)).toHaveLength(3);
});

test("clips the spans that don't fit on the frame the trace first shows", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderTraceList(receiver, { size: { width: 120, height: 10 } });
  await app.selectRow(NESTED_ROW);

  app.mockInput.pressEnter();
  const frame = await app.waitForText("3 spans");

  const rows = spanRows(frame).map((row) => collapseWhitespace(row.replace("█", "")));
  expect(rows).toEqual(["● service-a operation-a 120.0ms", "● service-b operation-b 80.0ms"]);
});

test("jumps between spans with errors", async () => {
  await using receiver = await startTestReceiver();
  await using app = await openTrace(receiver, FAILED_ROW);
  await app.waitForFrame((frame) => detailsLines(frame).includes(ERROR_MESSAGE));

  app.mockInput.pressKey("e");
  await app.waitForFrame((frame) => detailsLines(frame).includes(ERROR_CAUSE));
  app.mockInput.pressKey("e");
  await app.waitForFrame((frame) => detailsLines(frame).includes(ERROR_MESSAGE));
  app.mockInput.pressKey("e", { shift: true });
  await app.waitForFrame((frame) => detailsLines(frame).includes(ERROR_CAUSE));

  expect(await app.waitForSelection("operation-e")).toBe("● service-d operation-e 300.0ms");
});

test("dims the spans that don't match a search", async () => {
  await using receiver = await startTestReceiver();
  await using app = await openTrace(receiver, NESTED_ROW);
  await app.waitForSelection("operation-a");

  await app.search("db.system.name=peer-a");
  await app.waitForText("1 of 3 spans");

  const frame = await app.captureSpans();
  expect(spanColors(lineSpans(frame, "operation-c"), "operation-c").fg).toEqual(color(THEME.text));
  expect(spanColors(lineSpans(frame, "operation-b"), "operation-b").fg).toEqual(
    color(THEME.textMuted),
  );
});

test("jumps to the first match when the search applies", async () => {
  await using receiver = await startTestReceiver();
  await using app = await openTrace(receiver, FAILED_ROW);
  await app.waitForSelection("operation-d");

  await app.search("operation-f");
  await app.waitForText("1 of 3 spans");
  app.mockInput.pressEnter();

  expect(await app.waitForSelection("operation-f")).toBe("● service-e operation-f 40.0ms");
});

test("jumps between the matches", async () => {
  await using receiver = await startTestReceiver();
  await using app = await openTrace(receiver, FAILED_ROW);
  await app.waitForSelection("operation-d");
  await app.search("error-a");
  await app.waitForText("2 of 3 spans");
  app.mockInput.pressEnter();
  await app.waitForFrame((frame) => keyHints(frame).includes("n next match"));

  app.mockInput.pressKey("n");
  expect(await app.waitForSelection("operation-e")).toBe("● service-d operation-e 300.0ms");
  app.mockInput.pressKey("n");
  expect(await app.waitForSelection("operation-d")).toBe(`● service-c operation-d 450.0ms`);
  app.mockInput.pressKey("n", { shift: true });
  expect(await app.waitForSelection("operation-e")).toBe("● service-d operation-e 300.0ms");
});

test("matches span attribute values as text", async () => {
  await using receiver = await startTestReceiver();
  await using app = await openTrace(receiver, NESTED_ROW);
  await app.waitForSelection("operation-a");

  await app.search("peer-a");

  await app.waitForText("1 of 3 spans");
  app.mockInput.pressEnter();

  expect(await app.waitForSelection("operation-c")).toBe("● service-b operation-c 60.0ms");
});

test("keeps the spans in place while typing a search", async () => {
  await using receiver = await startTestReceiver();
  await using app = await openTrace(receiver, NESTED_ROW);
  const before = await app.waitForText("operation-c");

  await app.search("operation-c");
  const after = await app.waitForText("1 of 3 spans");

  expect(spanRows(after)).toEqual(spanRows(before));
  expect(lineOf(after, "operation-c")).toBe(lineOf(before, "operation-c"));
});

test("keeps room for the search on a narrow terminal", async () => {
  await using receiver = await startTestReceiver();
  await using app = await openTrace(receiver, FAILED_ROW);
  await app.waitForText("operation-e");
  app.resize(50, 20);

  await app.search("error-a");

  const frame = await app.waitForText("2 of 3 spans");
  expect(frame).toContain("/error-a");
});

test("unfolds a span to jump to the match inside it", async () => {
  await using receiver = await startTestReceiver();
  await using app = await openTrace(receiver, NESTED_ROW);
  await app.waitForSelection("operation-a");
  app.mockInput.pressKey(" ");
  await app.waitForFrame((frame) => spanRows(frame).length === 1);

  await app.search("operation-c");
  app.mockInput.pressEnter();

  expect(await app.waitForSelection("operation-c")).toBe("● service-b operation-c 60.0ms");
  await app.waitForFrame((frame) => spanRows(frame).length === 3);
});

test("clears the search before going back to the list", async () => {
  await using receiver = await startTestReceiver();
  await using app = await openTrace(receiver, NESTED_ROW);
  await app.search("operation-c");
  app.mockInput.pressEnter();
  await app.waitForFrame((frame) => keyHints(frame).includes("escape clear"));

  app.mockInput.pressEscape();
  const frame = await app.waitForFrame((frame) => keyHints(frame).includes("escape back"));
  expect(frame).not.toContain("1 of 3 spans");

  app.mockInput.pressEscape();
  await app.waitForFrame((frame) => tableRows(frame).length === 3);
});

test("goes back to the list with the opened trace still selected", async () => {
  await using receiver = await startTestReceiver();
  await using app = await openTrace(receiver, FAILED_ROW);

  app.mockInput.pressEscape();
  await app.waitForFrame((frame) => tableRows(frame).length === 3);

  expect(await app.waitForSelection("operation-d")).toBe(FAILED_ROW);
});

test("leaves the opened trace alone while the list's scroll gesture continues", async () => {
  const clock = fakeClock(at(10_000));
  await using receiver = await startTestReceiver();
  await using app = await renderTraceList(receiver);
  const list = await app.waitForText("Traces over time");
  const listLine = lineOf(list, SINGLE_ROW);

  await app.mockMouse.scroll(2, listLine, "down");
  expect(await app.waitForSelection("operation-d")).toBe(FAILED_ROW);
  app.mockInput.pressEnter();
  const waterfall = await app.waitForFrame((frame) => spanRows(frame).length === 3);
  const spanLine = lineOf(waterfall, `● service-c operation-d`);

  await app.mockMouse.scroll(2, spanLine, "down");
  expect(await app.waitForSelection("operation-d")).toBe(`● service-c operation-d 450.0ms`);

  clock.advance(GESTURE_PAUSE_MS + 1);
  await app.mockMouse.scroll(2, spanLine, "down");
  expect(await app.waitForSelection("operation-e")).toBe("● service-d operation-e 300.0ms");
});

const failedTraceLogs = logsRequest(
  {
    service: "service-c",
    logs: [
      {
        time: at(1100),
        severityNumber: SEVERITY_NUMBER.info,
        body: "message-a",
        traceId: failedTraceId,
        spanId: failedRootSpanId,
      },
      { time: at(1900), severityNumber: SEVERITY_NUMBER.info, body: "message-b" },
    ],
  },
  {
    service: "service-d",
    logs: [
      {
        time: at(1200),
        severityNumber: SEVERITY_NUMBER.error,
        body: "message-c",
        traceId: failedTraceId,
        spanId: failedChildSpanId,
      },
    ],
  },
);

test("opens the logs of the open trace in the logs view", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/logs", failedTraceLogs);
  await using app = await openTrace(receiver, FAILED_ROW);

  app.mockInput.pressKey("l");

  const frame = await app.waitForText("message-a");
  expect(pageHeader(frame)).toBe("trace 22222222 2 of 3 logs");
  expect(frame).toContain("message-c");
  expect(frame).not.toContain("message-b");
});

test("opens the logs of the selected span", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/logs", failedTraceLogs);
  await using app = await openTrace(receiver, FAILED_ROW);
  await app.waitForSelection("operation-d");
  app.mockInput.pressArrow("down");
  await app.waitForSelection("operation-e");

  app.mockInput.pressKey("l", { shift: true });

  const frame = await app.waitForFrame((frame) => pageHeader(frame).endsWith(" logs"));
  expect(pageHeader(frame)).toBe("trace 22222222 span 2b2b2b2b 1 of 3 logs");
  expect(frame).toContain("message-c");
  expect(frame).not.toContain("message-a");
});

test("comes back from the span's logs to the same span", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/logs", failedTraceLogs);
  await using app = await openTrace(receiver, FAILED_ROW);
  await app.waitForSelection("operation-d");
  app.mockInput.pressArrow("down");
  await app.waitForSelection("operation-e");
  app.mockInput.pressKey("l", { shift: true });
  await app.waitForText("span 2b2b2b2b");

  app.mockInput.pressEscape();

  expect(await app.waitForSelection("operation-e")).toBe("● service-d operation-e 300.0ms");
});

test("goes back from the trace's logs to the trace, then to the list", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp(
    "/v1/logs",
    logsRequest({
      service: "service-c",
      logs: [{ time: at(1100), body: "message-a", traceId: failedTraceId }],
    }),
  );
  await using app = await openTrace(receiver, FAILED_ROW);

  app.mockInput.pressKey("l");
  let frame = await app.waitForText("message-a");
  expect(keyHints(frame)).toContain("escape back");

  app.mockInput.pressEscape();
  frame = await app.waitForFrame((frame) =>
    textLines(frame).includes(`operation-d ${failedTraceId}`),
  );
  expect(frame).not.toContain("message-a");

  app.mockInput.pressEscape();
  await app.waitForFrame((frame) => tableRows(frame).length === 3);
  expect(await app.waitForSelection("operation-d")).toBe(FAILED_ROW);
});

test("says when an open trace is no longer available", async () => {
  await using receiver = await startTestReceiver();
  await using app = await openTrace(receiver, NESTED_ROW);
  await app.waitForText("operation-c");

  const connection = await receiver.connect();
  await connection.run("DELETE FROM otlp_traces WHERE trace_id = $traceId", {
    traceId: nestedTraceId,
  });

  await app.waitForText("This trace is no longer available");
});

test("copies the selected span's ID and the trace's ID", async () => {
  await using receiver = await startTestReceiver();
  await using app = await openTrace(receiver, NESTED_ROW);
  await app.waitForFrame((frame) => keyHints(frame).includes("y copy id"));

  app.mockInput.pressKey("y");
  await app.waitForFrame((frame) => keyHints(frame).includes("y copied"));
  app.mockInput.pressKey("y", { shift: true });
  await app.waitForFrame(() => app.copied.length === 2);

  expect(app.copied).toEqual([nestedRootSpanId, nestedTraceId]);
});
