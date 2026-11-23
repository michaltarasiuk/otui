import { expect, test } from "bun:test";

import { collapseWhitespace, compareText, formatJson, indent } from "./text.ts";

test("collapseWhitespace joins lines and runs of spaces into one line", () => {
  expect(collapseWhitespace("value-a    value-b")).toBe("value-a value-b");
  expect(collapseWhitespace("line-a\n\tline-b\r\n\tline-c")).toBe("line-a line-b line-c");
});

test("collapseWhitespace trims the ends", () => {
  expect(collapseWhitespace("  value-a value-b \n")).toBe("value-a value-b");
  expect(collapseWhitespace(" \n ")).toBe("");
});

test("compareText orders numbers inside text by their value", () => {
  expect(compareText("2", "10")).toBeLessThan(0);
  expect(compareText("value-10", "value-9")).toBeGreaterThan(0);
  expect(compareText("value-b", "value-a")).toBeGreaterThan(0);
  expect(compareText("value-a", "value-a")).toBe(0);
});

test("formatJson indents objects and arrays", () => {
  expect(formatJson('{"field-a":"value-a","field-b":200}')).toBe(
    '{\n  "field-a": "value-a",\n  "field-b": 200\n}',
  );
  expect(formatJson("[200,503]")).toBe("[\n  200,\n  503\n]");
});

test("formatJson keeps scalars and text that isn't JSON as written", () => {
  expect(formatJson("1.0")).toBe("1.0");
  expect(formatJson('"OK"')).toBe('"OK"');
  expect(formatJson("null")).toBe("null");
  expect(formatJson("message-a")).toBe("message-a");
  expect(formatJson('{"field-a":')).toBe('{"field-a":');
});

test("indent puts two spaces per tree level", () => {
  expect(indent(0)).toBe("");
  expect(indent(2)).toBe("    ");
});
