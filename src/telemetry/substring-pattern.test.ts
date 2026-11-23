import { expect, test } from "bun:test";

import { substringPattern } from "./substring-pattern.ts";

test("matches the search anywhere in the text", () => {
  expect(substringPattern("value-a")).toBe("%value-a%");
});

test("matches everything for an empty search", () => {
  expect(substringPattern("")).toBe("%%");
});

test("escapes like wildcards and the escape character", () => {
  expect(substringPattern("100%")).toBe("%100\\%%");
  expect(substringPattern("value_a")).toBe("%value\\_a%");
  expect(substringPattern("C:\\temp")).toBe("%C:\\\\temp%");
});
