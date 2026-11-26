import { expect, test } from "bun:test";

import { renderApp } from "#testing/app.tsx";
import { collapseWhitespace } from "#utils/text.ts";

test("lists every key of the focused page in a help overlay", async () => {
  const app = await renderApp();
  await app.openTab("traces");
  app.press("tab");
  await app.waitFor((frame) => frame.onList);

  app.press("?");

  const frame = await app.waitForText("Keys");
  for (const line of [
    "/ search",
    "s status",
    "shift+o reverse",
    "shift+tab previous region",
    "ctrl+l clear telemetry",
  ]) {
    expect(collapseWhitespace(frame.text)).toContain(line);
  }

  app.press("escape");
  await app.waitFor((frame) => !frame.text.includes("Keys") && frame.hints.includes("/ search"));
});

test("types ? into the search instead of opening help", async () => {
  const app = await renderApp();
  await app.openTab("traces");
  app.press("tab");
  await app.waitFor((frame) => frame.onList);
  await app.search("?");

  const frame = await app.waitForText("/?");
  expect(frame.text).not.toContain("Keys");
});

test("offers only the search's keys while typing a search", async () => {
  const app = await renderApp();
  await app.openTab("traces");
  app.press("tab");
  await app.waitFor((frame) => frame.onList);
  await app.search("operation");

  let frame = await app.waitFor((frame) => frame.hints.startsWith("/operation"));
  expect(frame.hints).toEndWith("return apply escape clear");

  app.press("tab");
  await app.type("s");
  frame = await app.waitFor((frame) => frame.hints.startsWith("/operations"));
  expect(frame.hints).toEndWith("return apply escape clear");
});
