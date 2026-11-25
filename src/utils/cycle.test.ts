import { expect, test } from "bun:test";

import { around, cycle } from "./cycle.ts";

const VIEWS = ["traces", "metrics", "logs"] as const;

test("cycle steps to the following and the preceding item", () => {
  expect(cycle(VIEWS, "traces", 1)).toBe("metrics");
  expect(cycle(VIEWS, "logs", -1)).toBe("metrics");
});

test("cycle wraps around the ends", () => {
  expect(cycle(VIEWS, "logs", 1)).toBe("traces");
  expect(cycle(VIEWS, "traces", -1)).toBe("logs");
});

test("cycle enters at the first or the last item when the current one is missing", () => {
  const values: [string, ...string[]] = ["value-a", "value-b", "value-c"];

  expect(cycle(values, "value-d", 1)).toBe("value-a");
  expect(cycle(values, "value-d", -1)).toBe("value-c");
});

test("cycle treats undefined as an item", () => {
  const severities = [undefined, "WARN", "ERROR"] as const;

  expect(cycle(severities, undefined, 1)).toBe("WARN");
  expect(cycle(severities, "ERROR", 1)).toBeUndefined();
  expect(cycle(severities, undefined, -1)).toBe("ERROR");
});

test("around visits the items after the current one, then the rest from the other end", () => {
  expect(around(VIEWS, "metrics", 1)).toEqual(["logs", "traces", "metrics"]);
  expect(around(VIEWS, "metrics", -1)).toEqual(["traces", "logs", "metrics"]);
});

test("around visits every item from the end the step enters at when the current one is missing", () => {
  const values = ["value-a", "value-b", "value-c"];

  expect(around(values, "value-d", 1)).toEqual(["value-a", "value-b", "value-c"]);
  expect(around(values, "value-d", -1)).toEqual(["value-c", "value-b", "value-a"]);
  expect(around([], "value-d", 1)).toEqual([]);
});
