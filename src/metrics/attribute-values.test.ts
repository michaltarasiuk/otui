import { expect, test } from "bun:test";

import { attributeValues } from "./attribute-values.ts";

test("collects the distinct values of each attribute across sets", () => {
  const attributeSets = [
    [
      { key: "attribute.b", value: "value-b" },
      { key: "attribute.c", value: "14" },
    ],
    [
      { key: "attribute.b", value: "value-a" },
      { key: "attribute.c", value: "2" },
    ],
    [
      { key: "attribute.b", value: "value-a" },
      { key: "attribute.a", value: null },
    ],
  ];

  expect(attributeValues(attributeSets)).toEqual([
    { key: "attribute.b", values: ["value-a", "value-b"], count: 3 },
    { key: "attribute.c", values: ["2", "14"], count: 2 },
    { key: "attribute.a", values: ["null"], count: 1 },
  ]);
});
