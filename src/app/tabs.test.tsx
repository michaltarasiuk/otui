import { expect, test } from "bun:test";

import { renderApp } from "#testing/app.tsx";
import { at } from "#testing/clock.ts";
import { tracesRequest } from "#testing/otlp.ts";

test("starts on the traces tab with the tab bar focused", async () => {
  const app = await renderApp();

  await app.waitForText("Waiting for traces...");

  expect(await app.waitForSelection("Traces")).toStartWith("Traces Metrics Logs ");
  expect((await app.captureStyles()).tabs).toEqual({
    Traces: { highlighted: true, fg: "text" },
    Metrics: { highlighted: false, fg: "muted" },
    Logs: { highlighted: false, fg: "muted" },
  });
});

test("switches tabs with the arrow keys while the tab bar is focused", async () => {
  const app = await renderApp();
  await app.waitForText("Waiting for traces...");

  app.press("right");
  await app.waitForText("Waiting for metrics...");
  expect((await app.captureStyles()).tabs).toMatchObject({
    Metrics: { highlighted: true, fg: "text" },
  });

  app.press("right");
  await app.waitForText("Waiting for logs...");
  app.press("left");
  await app.waitForText("Waiting for metrics...");
});

test("moves focus between the tab bar and the view with tab and shift+tab", async () => {
  const app = await renderApp();

  await app.waitForText("Waiting for traces...");
  expect((await app.waitForText("tab next region")).hints).toBe("tab next region ? help");

  app.press("tab");
  await app.waitFor((frame) => frame.onList);
  expect((await app.captureStyles()).tabs).toMatchObject({
    Traces: { highlighted: false, fg: "text" },
  });

  app.press("shift+tab");
  await app.waitFor((frame) => !frame.onList);
  expect((await app.captureStyles()).tabs).toMatchObject({
    Traces: { highlighted: true, fg: "text" },
  });
});

test("keeps showing the current tab while the view has focus", async () => {
  const app = await renderApp();
  await app.openTab("traces");
  app.press("right");
  await app.waitForText("Waiting for metrics...");
  app.press("right");
  await app.waitForText("Waiting for logs...");

  app.press("tab");
  await app.waitFor((frame) => frame.onList);

  expect((await app.captureStyles()).tabs).toEqual({
    Traces: { highlighted: false, fg: "muted" },
    Metrics: { highlighted: false, fg: "muted" },
    Logs: { highlighted: false, fg: "text" },
  });
});

test("switches tabs and selects rows with the mouse", async () => {
  const app = await renderApp({
    send: [
      tracesRequest({
        service: "service-a",
        spans: ["1", "2"].map((digit, index) => ({
          name: `operation-${digit}`,
          start: at(index),
          end: at(index + 10),
        })),
      }),
    ],
  });
  await app.waitForPage("traces");
  await app.mockMouse.click(12, 0);
  await app.waitForText("Waiting for metrics...");

  await app.mockMouse.click(2, 0);
  let frame = await app.waitFor(
    (frame) => frame.text.includes("Traces over time") && frame.text.includes("operation-1"),
  );
  expect((await app.captureStyles()).tabs).toMatchObject({
    Traces: { highlighted: true, fg: "text" },
  });

  await app.mockMouse.click(30, frame.lineOf("operation-1"));

  expect(await app.waitForSelection("operation-1")).toContain("service-a");
  frame = await app.waitFor((frame) => frame.hints.includes("/ search"));
  expect((await app.captureStyles()).tabs).toMatchObject({
    Traces: { highlighted: false, fg: "text" },
  });
});
