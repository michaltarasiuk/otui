import { expect, test } from "bun:test";

import logList from "#logs/sql/log-list.sql" with { type: "text" };
import { renderFailedPage, renderPage } from "#testing/app.tsx";
import { at, fakeClock } from "#testing/clock.ts";
import { failOnce } from "#testing/connection.ts";
import { silenceConsoleError } from "#testing/console.ts";
import {
  EVENT_ROW,
  failedTrace,
  ERROR_ROW,
  FATAL_ROW,
  NEWEST_FIRST,
  NOTICE_ROW,
  INFO_ROW,
  otlpLogs,
  renderLogList,
  WARN_ROW,
} from "#testing/logs.ts";
import { logsRequest, SEVERITY_NUMBER, tracesRequest } from "#testing/otlp.ts";
import { startTestReceiver } from "#testing/receiver.ts";
import {
  color,
  keyHints,
  lineOf,
  lineSpans,
  listLines,
  onList,
  pageHeader,
  spanColors,
  tableRows,
  textLines,
} from "#testing/screen.ts";
import { failedRootSpanId, failedTraceId } from "#testing/traces.ts";
import { THEME } from "#ui/theme.ts";

test("waits for logs before any arrive", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderPage(receiver, "logs");

  const frame = await app.waitForText("Waiting for logs...");

  expect(frame).toContain("0 logs");
});

test("lists logs newest first, falling back to the observed time", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderLogList(receiver);

  const frame = await app.waitForText("7 logs");

  expect(textLines(frame)).toContain("Time Severity Service Body");
  expect(tableRows(frame)).toEqual(NEWEST_FIRST);
});

test("raises and lowers the minimum severity", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderLogList(receiver);

  async function pressSeverityKey(shift: boolean, label: string, rows: string[]) {
    app.mockInput.pressKey("s", { shift });
    const frame = await app.waitForRows(rows);
    expect(pageHeader(frame)).toBe(`${label} ${rows.length} of 7 logs`);
  }

  await pressSeverityKey(false, "≥ DEBUG", NEWEST_FIRST.slice(1));
  await pressSeverityKey(false, "≥ INFO", [EVENT_ROW, FATAL_ROW, ERROR_ROW, WARN_ROW, INFO_ROW]);
  await pressSeverityKey(false, "≥ WARN", [FATAL_ROW, ERROR_ROW, WARN_ROW]);
  await pressSeverityKey(true, "≥ INFO", [EVENT_ROW, FATAL_ROW, ERROR_ROW, WARN_ROW, INFO_ROW]);
});

test("wraps the severity filter around to show every log again", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderLogList(receiver);

  app.mockInput.pressKey("s", { shift: true });
  let frame = await app.waitForText("1 of 7 logs");
  expect(pageHeader(frame)).toBe("≥ FATAL 1 of 7 logs");

  app.mockInput.pressKey("s");
  frame = await app.waitForFrame((frame) => tableRows(frame).length === 7);
  expect(pageHeader(frame)).toBe("7 logs");
});

test("searches bodies, attribute keys, services, trace IDs, and key=value pairs", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderLogList(receiver);

  async function expectSearch(text: string, rows: string[]) {
    await app.search(text);
    const frame = await app.waitForRows(rows);
    expect(frame).toContain(`${rows.length} of 7 logs`);
    app.mockInput.pressEscape();
    await app.waitForFrame((frame) => tableRows(frame).length === 7);
  }

  await expectSearch("message-g", [FATAL_ROW]);
  await expectSearch("attribute.a", [INFO_ROW]);
  await expectSearch("service-d", [ERROR_ROW, WARN_ROW]);
  await expectSearch(failedTraceId.slice(0, 8), [ERROR_ROW, WARN_ROW, INFO_ROW]);
  await expectSearch("attribute.b=value-b", [WARN_ROW]);
});

test("keeps an applied search while browsing", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderLogList(receiver);

  await app.search("service-d");
  await app.waitForFrame((frame) => tableRows(frame).length === 2);
  app.mockInput.pressEnter();
  await app.waitForFrame(onList);

  app.mockInput.pressArrow("down");

  expect(await app.waitForSelection("message-b")).toBe(WARN_ROW);
  const frame = await app.waitForFrame((frame) => pageHeader(frame) === "2 of 7 logs");
  expect(keyHints(frame)).toStartWith("/service-d ");
});

test("jumps between errors in both directions", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderLogList(receiver);
  await app.waitForSelection(NOTICE_ROW);

  app.mockInput.pressKey("e");
  expect(await app.waitForSelection("message-g")).toBe(FATAL_ROW);

  app.mockInput.pressKey("e");
  expect(await app.waitForSelection("message-c")).toBe(ERROR_ROW);

  app.mockInput.pressKey("e");
  expect(await app.waitForSelection("message-g")).toBe(FATAL_ROW);

  app.mockInput.pressKey("e", { shift: true });
  expect(await app.waitForSelection("message-c")).toBe(ERROR_ROW);
});

test("narrows the list to the selected log's trace and back", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderLogList(receiver);
  await app.selectRow(ERROR_ROW);

  app.mockInput.pressKey("t");
  let frame = await app.waitForFrame((frame) => tableRows(frame).length === 3);
  expect(pageHeader(frame)).toBe("trace 22222222 3 of 7 logs");
  expect(tableRows(frame)).toEqual([ERROR_ROW, WARN_ROW, INFO_ROW]);

  app.mockInput.pressKey("t");
  frame = await app.waitForFrame((frame) => tableRows(frame).length === 7);
  expect(pageHeader(frame)).toBe("7 logs");

  app.mockInput.pressKey("t");
  await app.waitForFrame((frame) => tableRows(frame).length === 3);
  app.mockInput.pressEscape();
  frame = await app.waitForFrame((frame) => tableRows(frame).length === 7);
  expect(frame).not.toContain("trace 22222222");
});

test("offers trace actions only for logs with a trace", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderLogList(receiver);

  let frame = await app.waitForText("e next error");
  expect(frame).not.toContain("t trace");

  await app.selectRow(ERROR_ROW);
  frame = await app.waitForText("t trace");
  expect(keyHints(frame)).toStartWith(
    "/ search e next error return open trace t trace y copy body",
  );
});

test("opens the selected log's trace in the traces view and goes back to the log", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp(
    "/v1/traces",
    tracesRequest({
      service: "service-c",
      spans: [
        {
          traceId: failedTraceId,
          spanId: failedRootSpanId,
          name: "operation-d",
          start: at(0),
          end: at(2500),
        },
      ],
    }),
  );
  await using app = await renderLogList(receiver);
  app.mockInput.pressKey("END");
  await app.waitForSelection(INFO_ROW);

  app.mockInput.pressEnter();
  let frame = await app.waitForText("1 span");
  expect(listLines(frame).slice(0, 2)).toEqual([
    `operation-d ${failedTraceId}`,
    "● service-c 12:00:00.000 1 span 2.50s",
  ]);

  app.mockInput.pressEscape();
  frame = await app.waitForFrame((frame) => tableRows(frame).length === NEWEST_FIRST.length);
  expect(pageHeader(frame)).toBe("7 logs");
  expect(await app.waitForSelection("message-a")).toBe(INFO_ROW);
});

test("selects the log's span in the trace it opens", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/traces", failedTrace);
  await using app = await renderLogList(receiver);
  await app.selectRow(ERROR_ROW);

  app.mockInput.pressEnter();
  await app.waitForText("2 spans");

  expect(await app.waitForSelection("operation-e")).toBe("● service-d operation-e 1.50s");
});

test("selects the log's span in a trace that is already open", async () => {
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/traces", failedTrace);
  await receiver.sendHttp("/v1/logs", otlpLogs);
  await using app = await renderPage(receiver, "traces");

  await app.waitForText("operation-d");
  app.mockInput.pressEnter();
  await app.waitForText("2 spans");
  expect(await app.waitForSelection("operation-d")).toBe(`● service-c operation-d 2.50s`);

  app.mockInput.pressTab({ shift: true });
  await app.openTab("logs");
  await app.waitForRows(NEWEST_FIRST);
  app.mockInput.pressTab();
  await app.waitForFrame(onList);
  await app.selectRow(ERROR_ROW);

  app.mockInput.pressEnter();
  await app.waitForText("2 spans");

  expect(await app.waitForSelection("operation-e")).toBe("● service-d operation-e 1.50s");
});

test("lists identical logs separately and selects each in turn", async () => {
  await using receiver = await startTestReceiver();
  const repeated = { time: at(1000), severityNumber: SEVERITY_NUMBER.info, body: "message-a" };
  const earlier = { time: at(0), severityNumber: SEVERITY_NUMBER.info, body: "message-b" };
  await receiver.sendHttp(
    "/v1/logs",
    logsRequest({ service: "service-a", logs: [repeated, repeated, earlier] }),
  );
  await using app = await renderPage(receiver, "logs");

  const frame = await app.waitForFrame((frame) => tableRows(frame).length === 3);
  expect(tableRows(frame)).toEqual([
    "12:00:01.000 INFO ● service-a message-a",
    "12:00:01.000 INFO ● service-a message-a",
    "12:00:00.000 INFO ● service-a message-b",
  ]);

  const firstRowLine = lineOf(frame, "message-a");
  await app.waitForSelection("message-a", { line: firstRowLine });
  app.mockInput.pressArrow("down");
  await app.waitForSelection("message-a", { line: firstRowLine + 1 });
  app.mockInput.pressArrow("down");
  await app.waitForSelection("message-b");
});

test("shows an error when logs cannot be loaded and retries", async () => {
  silenceConsoleError();
  await using receiver = await startTestReceiver();
  await receiver.sendHttp("/v1/logs", otlpLogs);
  const connection = await receiver.connect();
  using _ = failOnce(connection, logList);

  await using app = await renderFailedPage(receiver, "logs", { connection });
  await app.waitForText("Failed to load logs");
  app.mockInput.pressKey("r");

  await app.waitForRows(NEWEST_FIRST);
});

test("copies the selected log's body", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderLogList(receiver);

  app.mockInput.pressKey("y");

  await app.waitForFrame((frame) => keyHints(frame).includes("y copied"));
  expect(app.copied).toEqual(["message-f"]);
});

test("colors each severity", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderLogList(receiver);

  const frame = await app.captureSpans();

  expect(spanColors(lineSpans(frame, "message-c"), "ERROR").fg).toEqual(color(THEME.textError));
  expect(spanColors(lineSpans(frame, "message-b"), "WARN").fg).toEqual(color(THEME.textWarning));
  expect(spanColors(lineSpans(frame, "message-a"), "INFO").fg).toEqual(color(THEME.text));
});

test("charts the logs over time and narrows the list to a column", async () => {
  fakeClock(at(50_000));
  await using receiver = await startTestReceiver();
  await using app = await renderLogList(receiver);
  let frame = await app.waitForText("Logs over time");
  expect(textLines(frame)).toContain("Logs over time ■ errors 10s per column");

  app.mockInput.pressArrow("right");
  frame = await app.waitForFrame((frame) => pageHeader(frame).startsWith("12:00:00–12:00:10"));
  expect(pageHeader(frame)).toBe("12:00:00–12:00:10 7 logs");

  app.mockInput.pressEscape();
  await app.waitForFrame((frame) => pageHeader(frame) === "7 logs");
});
