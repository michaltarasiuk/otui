import { describe, expect, test } from "bun:test";

import {
  type AttributeColumn,
  attributeColumns,
  cellValue,
  seriesLabel,
  sortByColumns,
} from "./series-columns.ts";
import type { Series } from "./series.ts";

function toAttributes(values: Record<string, string>) {
  return Object.entries(values).map(([key, value]) => ({ key, value }));
}

function series(
  seriesId: string,
  attributes: Record<string, string>,
  resourceAttributes: Record<string, string> = {},
): Series {
  return {
    series_id: seriesId,
    scope_id: "",
    scope_name: null,
    scope_version: null,
    attributes: toAttributes(attributes),
    resource_attributes: toAttributes(resourceAttributes),
    first_time: 0,
    last_time: 0,
    stats: { kind: "number", value: 0, min: 0, max: 0, latestPoints: [] },
  };
}

describe("attributeColumns", () => {
  test("shows every attribute of a lone series and no resource attributes", () => {
    const lone = series(
      "1",
      { "attribute.a": "value-a", "attribute.b": "value-b" },
      { "resource.a": "value-a" },
    );

    expect(attributeColumns([lone])).toEqual([
      { key: "attribute.a", source: "attributes", weight: 8 },
      { key: "attribute.b", source: "attributes", weight: 8 },
    ]);
  });

  test("shows only attributes that tell series apart, fewest values first", () => {
    const rows = [
      series(
        "1",
        { "attribute.a": "value-a", "attribute.b": "value-a" },
        { "resource.a": "value-a", "resource.b": "value-a" },
      ),
      series(
        "2",
        { "attribute.a": "value-b", "attribute.b": "value-a" },
        { "resource.a": "value-a", "resource.b": "value-a" },
      ),
      series(
        "3",
        { "attribute.a": "value-c", "attribute.b": "value-a", "attribute.c": "value-a" },
        { "resource.a": "value-b", "resource.b": "value-a" },
      ),
    ];

    expect(attributeColumns(rows)).toEqual([
      { key: "attribute.c", source: "attributes", weight: 8 },
      { key: "attribute.a", source: "attributes", weight: 8 },
      { key: "resource.a", source: "resource_attributes", weight: 8 },
    ]);
  });

  test("weighs a column by its longest value within limits", () => {
    const rows = [
      series("1", { "attribute.a": "x".repeat(31), "attribute.b": "x" }),
      series("2", { "attribute.a": "x", "attribute.b": "x".repeat(40) }),
    ];

    expect(attributeColumns(rows).map((column) => column.weight)).toEqual([31, 32]);
  });
});

describe("seriesLabel", () => {
  const columnA: AttributeColumn = { key: "attribute.a", source: "attributes", weight: 8 };
  const columnB: AttributeColumn = { key: "attribute.b", source: "attributes", weight: 8 };

  test("joins the series' column values", () => {
    const row = series("1", { "attribute.a": "value-a", "attribute.b": "value-b" });

    expect(seriesLabel(row, [columnA, columnB])).toBe("value-a · value-b");
  });

  test("skips columns the series has no value for", () => {
    const row = series("1", { "attribute.b": "value-b" });

    expect(cellValue(row, columnA)).toBe("");
    expect(seriesLabel(row, [columnA, columnB])).toBe("value-b");
  });

  test("names a series without attributes", () => {
    expect(seriesLabel(series("1", {}), [])).toBe("no attributes");
  });
});

describe("sortByColumns", () => {
  test("orders series by each column in turn, then by ID", () => {
    const rows = [
      series("1", { "attribute.a": "value-b", "attribute.b": "value-a" }),
      series("2", { "attribute.a": "value-a", "attribute.b": "value-b" }),
      series("4", { "attribute.a": "value-a", "attribute.b": "value-a" }),
      series("3", { "attribute.a": "value-a", "attribute.b": "value-a" }),
    ];
    const columns = attributeColumns(rows);

    expect(columns.map((column) => column.key)).toEqual(["attribute.a", "attribute.b"]);
    expect(sortByColumns(rows, columns).map((row) => row.series_id)).toEqual(["3", "4", "2", "1"]);
  });
});
