import { expect, test } from "bun:test";

import { parseSearch } from "./search.ts";

test("keeps plain words as text", () => {
  expect(parseSearch("value-a  value-b")).toEqual({ text: "value-a value-b", attributes: [] });
});

test("reads key=value terms as attribute filters", () => {
  expect(parseSearch("attribute.a=value-a value-b attribute.b=value-c")).toEqual({
    text: "value-b",
    attributes: [
      { key: "attribute.a", operator: "=", value: "value-a", number: null },
      { key: "attribute.b", operator: "=", value: "value-c", number: null },
    ],
  });
});

test("matches an empty value", () => {
  expect(parseSearch("attribute.a=")).toEqual({
    text: "",
    attributes: [{ key: "attribute.a", operator: "=", value: "", number: null }],
  });
});

test("treats a term that starts with an operator as text", () => {
  expect(parseSearch("=x >5")).toEqual({ text: "=x >5", attributes: [] });
});

test("reads != as a filter on a different value", () => {
  expect(parseSearch("attribute.a!=value-a").attributes).toEqual([
    { key: "attribute.a", operator: "!=", value: "value-a", number: null },
  ]);
});

test("compares numbers with >, >=, <, and <=", () => {
  expect(
    parseSearch("attribute.a>=500 attribute.b>1 attribute.c<1.5 attribute.d<=0").attributes,
  ).toEqual([
    { key: "attribute.a", operator: ">=", value: "500", number: 500 },
    { key: "attribute.b", operator: ">", value: "1", number: 1 },
    { key: "attribute.c", operator: "<", value: "1.5", number: 1.5 },
    { key: "attribute.d", operator: "<=", value: "0", number: 0 },
  ]);
});

test("reads duration comparisons in milliseconds", () => {
  expect(parseSearch("duration>1.5s duration<=250us").attributes).toEqual([
    { key: "duration", operator: ">", value: "1.5s", number: 1500 },
    { key: "duration", operator: "<=", value: "250us", number: 0.25 },
  ]);
});

test("treats a comparison with something other than a number as text", () => {
  expect(parseSearch("a>b duration>soon status>")).toEqual({
    text: "a>b duration>soon status>",
    attributes: [],
  });
});
