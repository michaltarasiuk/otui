import { beforeEach, expect, test } from "bun:test";

import { renderPage } from "#testing/app.tsx";
import { at, fakeClock } from "#testing/clock.ts";
import type { Frame } from "#testing/frame.ts";
import { otlpTraces } from "#testing/traces.ts";

beforeEach(() => {
  fakeClock(at(60_000));
});

function serviceRows(frame: Frame) {
  const lines = frame.lines;
  const header = lines.findIndex((line) => line.startsWith("Service"));
  return lines
    .slice(header + 1)
    .filter((line) => line.startsWith("● "))
    .slice(0, 4);
}

function serviceNames(frame: Frame) {
  return serviceRows(frame).map((row) => row.split(" ")[1]);
}

async function renderServices() {
  const app = await renderPage("services", { send: [otlpTraces] });
  await app.waitFor((frame) => serviceRows(frame).length === 4);
  return app;
}

test("waits for server or consumer spans", async () => {
  const app = await renderPage("services");

  const frame = await app.waitForText("Waiting for server or consumer spans...");
  expect(frame.header).toBe("last 5 min · 0 services");
});

test("lists each service's rate, errors, and latency from its entry spans", async () => {
  const app = await renderServices();

  const frame = await app.captureFrame();

  expect(frame.header).toBe("last 5 min · 4 services");
  expect(frame.lines).toContain("Service ▼ Rate Errors p50 p95 p99 Spans");
  expect(serviceRows(frame)).toEqual([
    "● service-a 0.2/min 0.0% 120.0ms 120.0ms 120.0ms 1",
    "● service-b 0.2/min 0.0% 80.0ms 80.0ms 80.0ms 1",
    "● service-c 0.2/min 100.0% 450.0ms 450.0ms 450.0ms 1",
    "● service-e 0.2/min 0.0% 40.0ms 40.0ms 40.0ms 1",
  ]);
});

test("sorts by errors and by p95", async () => {
  const app = await renderServices();

  app.press("o");
  let frame = await app.waitFor((frame) =>
    frame.lines.includes("Service Rate ▼ Errors p50 p95 p99 Spans"),
  );
  expect(serviceNames(frame)[0]).toBe("service-c");

  app.press("o");
  frame = await app.waitFor((frame) =>
    frame.lines.includes("Service Rate Errors p50 ▼ p95 p99 Spans"),
  );
  expect(serviceNames(frame)).toEqual(["service-c", "service-a", "service-b", "service-e"]);
});

test("shows the selected service's operations", async () => {
  const app = await renderServices();

  await app.selectRow("service-c");

  const frame = await app.waitFor(
    (frame) =>
      frame.details.includes("● service-c server and consumer spans") && frame.details.length === 3,
  );
  expect(frame.details).toEqual([
    "● service-c server and consumer spans",
    "Operation Rate Errors p50 p95 p99 Spans",
    `operation-d 0.2/min 100.0% 450.0ms 450.0ms 450.0ms 1`,
  ]);
});

test("opens an operation's traces, slowest first, at the operation's span", async () => {
  const app = await renderServices();
  await app.selectRow("service-e");

  app.press("tab");
  await app.waitForSelection("operation-f");
  app.press("return");

  const frame = await app.waitFor((frame) => frame.header.endsWith("1 of 3 traces"));
  expect(frame.header).toBe("● service-e operation-f 1 of 3 traces");
  expect(frame.lines).toContain("Time Service Name Spans Errors ▼ Duration");

  app.press("return");
  await app.waitFor((frame) => frame.onDetails);
  expect(await app.waitForSelection("operation-f")).toBe("● service-e operation-f 40.0ms");

  app.press("escape");
  await app.waitFor((frame) => frame.header.endsWith("1 of 3 traces"));
  app.press("escape");
  await app.waitFor((frame) => frame.header === "last 5 min · 4 services");
});

test("moves between services and operations with tab", async () => {
  const app = await renderServices();
  await app.waitForSelection("service-a");

  app.press("tab");
  let frame = await app.waitFor((frame) => !frame.hints.includes("o sort"));
  expect(frame.hints).toContain("return traces");

  app.press("shift+tab");
  frame = await app.waitFor((frame) => frame.hints.includes("o sort"));
  expect(frame.hints).toContain("return traces");
});

test("cycles focus through the tab bar, services, and operations", async () => {
  const app = await renderServices();
  await app.waitForSelection("service-a");
  const onServices = (frame: Frame) => frame.hints.includes("o sort");
  const onOperations = (frame: Frame) =>
    frame.hints.includes("return traces") && !onServices(frame);
  const onTabBar = (frame: Frame) => frame.hints === "tab next region ? help";

  app.press("tab");
  await app.waitFor(onOperations);
  app.press("tab");
  await app.waitFor(onTabBar);
  app.press("tab");
  await app.waitFor(onServices);

  app.press("tab");
  await app.waitFor(onOperations);
  app.press("shift+tab");
  await app.waitFor(onServices);
  app.press("shift+tab");
  await app.waitFor(onTabBar);
});

test("opens the selected service's traces and comes back", async () => {
  const app = await renderServices();
  await app.waitForSelection("service-a");

  app.press("return");

  const frame = await app.waitFor((frame) => frame.header.endsWith("1 of 3 traces"));
  expect(frame.header).toBe("● service-a 1 of 3 traces");
  expect(frame.hints).toContain("escape back");

  app.press("escape");
  await app.waitFor((frame) => frame.header === "last 5 min · 4 services");
});

test("never shows the previous service's traces over time", async () => {
  const app = await renderServices();
  await app.waitForSelection("service-a");

  app.press("return");
  let frame = await app.waitFor((frame) => frame.chart.length > 0);
  const previousChart = frame.chart;
  app.press("escape");
  await app.waitFor((frame) => frame.header === "last 5 min · 4 services");

  await app.selectRow("service-c");
  app.press("return");

  frame = await app.waitFor((frame) => frame.header.startsWith("● service-c"));
  expect(frame.chart).not.toEqual(previousChart);
});
