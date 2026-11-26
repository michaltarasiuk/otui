import { expect, test } from "bun:test";

import { at, fakeClock } from "#testing/clock.ts";
import { logsRequest, SEVERITY_NUMBER } from "#testing/otlp.ts";
import {
  nestedRootSpanId,
  nestedTraceId,
  ERROR_CAUSE,
  ERROR_MESSAGE,
  failedChildSpanId,
  failedTraceId,
  openTrace,
  failedRootSpanId,
  renderTraceList,
} from "#testing/traces.ts";
import { THEME } from "#ui/theme.ts";
import { GESTURE_PAUSE_MS } from "#ui/use-scroll-gesture.ts";
import { collapseWhitespace } from "#utils/text.ts";

test("draws the waterfall on the frame the trace first shows", async () => {
  const app = await renderTraceList();
  await app.selectRow("operation-a");

  app.press("return");
  const frame = await app.waitFor((frame) => frame.onDetails);

  expect(frame.spanRows).toHaveLength(3);
});

test("clips the spans that don't fit on the frame the trace first shows", async () => {
  const app = await renderTraceList({ size: { width: 120, height: 10 } });
  await app.selectRow("operation-a");

  app.press("return");
  const frame = await app.waitForText("3 spans");

  const rows = frame.spanRows.map((row) => collapseWhitespace(row.replace("█", "")));
  expect(rows).toEqual(["● service-a operation-a 120.0ms", "● service-b operation-b 80.0ms"]);
});

test("jumps between spans with errors", async () => {
  const app = await openTrace("operation-d");
  await app.waitFor((frame) => frame.details.includes(ERROR_MESSAGE));

  app.press("e");
  await app.waitFor((frame) => frame.details.includes(ERROR_CAUSE));
  app.press("e");
  await app.waitFor((frame) => frame.details.includes(ERROR_MESSAGE));
  app.press("shift+e");
  await app.waitFor((frame) => frame.details.includes(ERROR_CAUSE));

  expect(await app.waitForSelection("operation-e")).toBe("● service-d operation-e 300.0ms");
});

test("dims the spans that don't match a search", async () => {
  const app = await openTrace("operation-a");
  await app.waitForSelection("operation-a");

  await app.search("db.system.name=peer-a");
  await app.waitForText("1 of 3 spans");

  const frame = await app.captureStyles();
  expect(frame.line("operation-c").fg("operation-c")).toBe(THEME.text);
  expect(frame.line("operation-b").fg("operation-b")).toBe(THEME.textMuted);
});

test("jumps to the first match when the search applies", async () => {
  const app = await openTrace("operation-d");
  await app.waitForSelection("operation-d");

  await app.search("operation-f");
  await app.waitForText("1 of 3 spans");
  app.press("return");

  expect(await app.waitForSelection("operation-f")).toBe("● service-e operation-f 40.0ms");
});

test("jumps between the matches", async () => {
  const app = await openTrace("operation-d");
  await app.waitForSelection("operation-d");
  await app.search("error-a");
  await app.waitForText("2 of 3 spans");
  app.press("return");
  await app.waitFor((frame) => frame.hints.includes("n next match"));

  app.press("n");
  expect(await app.waitForSelection("operation-e")).toBe("● service-d operation-e 300.0ms");
  app.press("n");
  expect(await app.waitForSelection("operation-d")).toBe(`● service-c operation-d 450.0ms`);
  app.press("shift+n");
  expect(await app.waitForSelection("operation-e")).toBe("● service-d operation-e 300.0ms");
});

test("matches span attribute values as text", async () => {
  const app = await openTrace("operation-a");
  await app.waitForSelection("operation-a");

  await app.search("peer-a");

  await app.waitForText("1 of 3 spans");
  app.press("return");

  expect(await app.waitForSelection("operation-c")).toBe("● service-b operation-c 60.0ms");
});

test("keeps the spans in place while typing a search", async () => {
  const app = await openTrace("operation-a");
  const before = await app.waitForText("operation-c");

  await app.search("operation-c");
  const after = await app.waitForText("1 of 3 spans");

  expect(after.spanRows).toEqual(before.spanRows);
  expect(after.lineOf("operation-c")).toBe(before.lineOf("operation-c"));
});

test("keeps room for the search on a narrow terminal", async () => {
  const app = await openTrace("operation-d");
  await app.waitForText("operation-e");
  app.resize(50, 20);

  await app.search("error-a");

  const frame = await app.waitForText("2 of 3 spans");
  expect(frame.text).toContain("/error-a");
});

test("unfolds a span to jump to the match inside it", async () => {
  const app = await openTrace("operation-a");
  await app.waitForSelection("operation-a");
  app.press("space");
  await app.waitFor((frame) => frame.spanRows.length === 1);

  await app.search("operation-c");
  app.press("return");

  expect(await app.waitForSelection("operation-c")).toBe("● service-b operation-c 60.0ms");
  await app.waitFor((frame) => frame.spanRows.length === 3);
});

test("clears the search before going back to the list", async () => {
  const app = await openTrace("operation-a");
  await app.search("operation-c");
  app.press("return");
  await app.waitFor((frame) => frame.hints.includes("escape clear"));

  app.press("escape");
  const frame = await app.waitFor((frame) => frame.hints.includes("escape back"));
  expect(frame.text).not.toContain("1 of 3 spans");

  app.press("escape");
  await app.waitFor((frame) => frame.tableRows.length === 3);
});

test("goes back to the list with the opened trace still selected", async () => {
  const app = await openTrace("operation-d");

  app.press("escape");
  await app.waitFor((frame) => frame.tableRows.length === 3);

  await app.waitForSelection("operation-d");
});

test("leaves the opened trace alone while the list's scroll gesture continues", async () => {
  const clock = fakeClock(at(10_000));
  const app = await renderTraceList();
  const list = await app.waitForText("Traces over time");
  const listLine = list.lineOf("operation-g");

  await app.mockMouse.scroll(2, listLine, "down");
  await app.waitForSelection("operation-d");
  app.press("return");
  const waterfall = await app.waitFor((frame) => frame.spanRows.length === 3);
  const spanLine = waterfall.lineOf(`● service-c operation-d`);

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
  const app = await openTrace("operation-d", { send: [failedTraceLogs] });

  app.press("l");

  const frame = await app.waitForText("message-a");
  expect(frame.header).toBe("trace 22222222 2 of 3 logs");
  expect(frame.text).toContain("message-c");
  expect(frame.text).not.toContain("message-b");
});

test("opens the logs of the selected span", async () => {
  const app = await openTrace("operation-d", { send: [failedTraceLogs] });
  await app.waitForSelection("operation-d");
  app.press("down");
  await app.waitForSelection("operation-e");

  app.press("shift+l");

  const frame = await app.waitFor((frame) => frame.header.endsWith(" logs"));
  expect(frame.header).toBe("trace 22222222 span 2b2b2b2b 1 of 3 logs");
  expect(frame.text).toContain("message-c");
  expect(frame.text).not.toContain("message-a");
});

test("comes back from the span's logs to the same span", async () => {
  const app = await openTrace("operation-d", { send: [failedTraceLogs] });
  await app.waitForSelection("operation-d");
  app.press("down");
  await app.waitForSelection("operation-e");
  app.press("shift+l");
  await app.waitForText("span 2b2b2b2b");

  app.press("escape");

  expect(await app.waitForSelection("operation-e")).toBe("● service-d operation-e 300.0ms");
});

test("goes back from the trace's logs to the trace, then to the list", async () => {
  const app = await openTrace("operation-d", {
    send: [
      logsRequest({
        service: "service-c",
        logs: [{ time: at(1100), body: "message-a", traceId: failedTraceId }],
      }),
    ],
  });

  app.press("l");
  let frame = await app.waitForText("message-a");
  expect(frame.hints).toContain("escape back");

  app.press("escape");
  frame = await app.waitFor((frame) => frame.lines.includes(`operation-d ${failedTraceId}`));
  expect(frame.text).not.toContain("message-a");

  app.press("escape");
  await app.waitFor((frame) => frame.tableRows.length === 3);
  await app.waitForSelection("operation-d");
});

test("says when an open trace is no longer available", async () => {
  const app = await openTrace("operation-a");
  await app.waitForText("operation-c");

  await app.receiver.run("DELETE FROM otlp_traces WHERE trace_id = $traceId", {
    traceId: nestedTraceId,
  });

  await app.waitForText("This trace is no longer available");
});

test("copies the selected span's ID and the trace's ID", async () => {
  const app = await openTrace("operation-a");
  await app.waitFor((frame) => frame.hints.includes("y copy id"));

  app.press("y");
  await app.waitFor((frame) => frame.hints.includes("y copied"));
  app.press("shift+y");
  await app.waitFor(() => app.copied.length === 2);

  expect(app.copied).toEqual([nestedRootSpanId, nestedTraceId]);
});
