import { beforeEach, expect, test } from "bun:test";

import { renderPage } from "#testing/app.tsx";
import { at, fakeClock } from "#testing/clock.ts";
import { startTestReceiver, type TestReceiver } from "#testing/receiver.ts";
import {
  chartLines,
  detailsLines,
  keyHints,
  onDetails,
  pageHeader,
  textLines,
} from "#testing/screen.ts";
import { otlpTraces } from "#testing/traces.ts";

const SERVICE_A_ROW = "● service-a 0.2/min 0.0% 120.0ms 120.0ms 120.0ms 1";
const SERVICE_B_ROW = "● service-b 0.2/min 0.0% 80.0ms 80.0ms 80.0ms 1";
const SERVICE_C_ROW = "● service-c 0.2/min 100.0% 450.0ms 450.0ms 450.0ms 1";
const SERVICE_E_ROW = "● service-e 0.2/min 0.0% 40.0ms 40.0ms 40.0ms 1";

beforeEach(() => {
  fakeClock(at(60_000));
});

function serviceRows(frame: string) {
  const lines = textLines(frame);
  const header = lines.findIndex((line) => line.startsWith("Service"));
  return lines
    .slice(header + 1)
    .filter((line) => line.startsWith("● "))
    .slice(0, 4);
}

async function renderServices(receiver: TestReceiver) {
  await receiver.sendHttp("/v1/traces", otlpTraces);
  const app = await renderPage(receiver, "services");
  await app.waitForFrame((frame) => serviceRows(frame).length === 4);
  return app;
}

test("waits for server or consumer spans", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderPage(receiver, "services");

  const frame = await app.waitForText("Waiting for server or consumer spans...");
  expect(pageHeader(frame)).toBe("last 5 min · 0 services");
});

test("lists each service's rate, errors, and latency from its entry spans", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderServices(receiver);

  const frame = await app.captureFrame();

  expect(pageHeader(frame)).toBe("last 5 min · 4 services");
  expect(textLines(frame)).toContain("Service ▼ Rate Errors p50 p95 p99 Spans");
  expect(serviceRows(frame)).toEqual([SERVICE_A_ROW, SERVICE_B_ROW, SERVICE_C_ROW, SERVICE_E_ROW]);
});

test("sorts by errors and by p95", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderServices(receiver);

  app.mockInput.pressKey("o");
  let frame = await app.waitForFrame((frame) =>
    textLines(frame).includes("Service Rate ▼ Errors p50 p95 p99 Spans"),
  );
  expect(serviceRows(frame)[0]).toBe(SERVICE_C_ROW);

  app.mockInput.pressKey("o");
  frame = await app.waitForFrame((frame) =>
    textLines(frame).includes("Service Rate Errors p50 ▼ p95 p99 Spans"),
  );
  expect(serviceRows(frame)).toEqual([SERVICE_C_ROW, SERVICE_A_ROW, SERVICE_B_ROW, SERVICE_E_ROW]);
});

test("shows the selected service's operations", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderServices(receiver);

  await app.selectRow("service-c");

  const frame = await app.waitForFrame(
    (frame) =>
      detailsLines(frame).includes("● service-c server and consumer spans") &&
      detailsLines(frame).length === 3,
  );
  expect(detailsLines(frame)).toEqual([
    "● service-c server and consumer spans",
    "Operation Rate Errors p50 p95 p99 Spans",
    `operation-d 0.2/min 100.0% 450.0ms 450.0ms 450.0ms 1`,
  ]);
});

test("opens an operation's traces, slowest first, at the operation's span", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderServices(receiver);
  await app.selectRow("service-e");

  app.mockInput.pressTab();
  await app.waitForSelection("operation-f");
  app.mockInput.pressEnter();

  const frame = await app.waitForFrame((frame) => pageHeader(frame).endsWith("1 of 3 traces"));
  expect(pageHeader(frame)).toBe("● service-e operation-f 1 of 3 traces");
  expect(textLines(frame)).toContain("Time Service Name Spans Errors ▼ Duration");

  app.mockInput.pressEnter();
  await app.waitForFrame(onDetails);
  expect(await app.waitForSelection("operation-f")).toBe("● service-e operation-f 40.0ms");

  app.mockInput.pressEscape();
  await app.waitForFrame((frame) => pageHeader(frame).endsWith("1 of 3 traces"));
  app.mockInput.pressEscape();
  await app.waitForFrame((frame) => pageHeader(frame) === "last 5 min · 4 services");
});

test("moves between services and operations with tab", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderServices(receiver);
  await app.waitForSelection("service-a");

  app.mockInput.pressTab();
  let frame = await app.waitForFrame((frame) => !keyHints(frame).includes("o sort"));
  expect(keyHints(frame)).toContain("return traces");

  app.mockInput.pressTab({ shift: true });
  frame = await app.waitForFrame((frame) => keyHints(frame).includes("o sort"));
  expect(keyHints(frame)).toContain("return traces");
});

test("cycles focus through the tab bar, services, and operations", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderServices(receiver);
  await app.waitForSelection("service-a");
  const onServices = (frame: string) => keyHints(frame).includes("o sort");
  const onOperations = (frame: string) =>
    keyHints(frame).includes("return traces") && !onServices(frame);
  const onTabBar = (frame: string) => keyHints(frame) === "tab next region ? help";

  app.mockInput.pressTab();
  await app.waitForFrame(onOperations);
  app.mockInput.pressTab();
  await app.waitForFrame(onTabBar);
  app.mockInput.pressTab();
  await app.waitForFrame(onServices);

  app.mockInput.pressTab();
  await app.waitForFrame(onOperations);
  app.mockInput.pressTab({ shift: true });
  await app.waitForFrame(onServices);
  app.mockInput.pressTab({ shift: true });
  await app.waitForFrame(onTabBar);
});

test("opens the selected service's traces and comes back", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderServices(receiver);
  await app.waitForSelection("service-a");

  app.mockInput.pressEnter();

  const frame = await app.waitForFrame((frame) => pageHeader(frame).endsWith("1 of 3 traces"));
  expect(pageHeader(frame)).toBe("● service-a 1 of 3 traces");
  expect(keyHints(frame)).toContain("escape back");

  app.mockInput.pressEscape();
  await app.waitForFrame((frame) => pageHeader(frame) === "last 5 min · 4 services");
});

test("never shows the previous service's traces over time", async () => {
  await using receiver = await startTestReceiver();
  await using app = await renderServices(receiver);
  await app.waitForSelection("service-a");

  app.mockInput.pressEnter();
  let frame = await app.waitForFrame((frame) => chartLines(frame).length > 0);
  const previousChart = chartLines(frame);
  app.mockInput.pressEscape();
  await app.waitForFrame((frame) => pageHeader(frame) === "last 5 min · 4 services");

  await app.selectRow("service-c");
  app.mockInput.pressEnter();

  frame = await app.waitForFrame((frame) => pageHeader(frame).startsWith("● service-c"));
  expect(chartLines(frame)).not.toEqual(previousChart);
});
