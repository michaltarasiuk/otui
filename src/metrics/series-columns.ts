import { clamp } from "#utils/number.ts";
import { compareText } from "#utils/text.ts";

import { type AttributeValues, attributeValues } from "./attribute-values.ts";
import type { Series } from "./series.ts";

const MIN_COLUMN_WEIGHT = 8;
const MAX_COLUMN_WEIGHT = 32;

const ATTRIBUTE_SOURCES = ["attributes", "resource_attributes"] as const;

const LABEL_SEPARATOR = " · ";
const UNLABELED_SERIES = "no attributes";

type AttributeSource = (typeof ATTRIBUTE_SOURCES)[number];

export function attributeColumns(series: Series[]) {
  if (series.length === 1) {
    const attributes = attributeValues(series.map((row) => row.attributes));
    return toColumns("attributes", attributes);
  }

  return ATTRIBUTE_SOURCES.flatMap((source) => {
    const attributes = attributeValues(series.map((row) => row[source]));
    const distinguishing = attributes.filter((attribute) => tellsApart(attribute, series.length));
    return toColumns(source, distinguishing);
  });
}

export type AttributeColumn = ReturnType<typeof attributeColumns>[number];

function tellsApart({ values, count }: AttributeValues, seriesCount: number) {
  const variesInValue = values.length > 1;
  const missingFromSome = count < seriesCount;
  return variesInValue || missingFromSome;
}

function toColumns(source: AttributeSource, attributes: AttributeValues[]) {
  return attributes
    .toSorted((a, b) => a.values.length - b.values.length || compareText(a.key, b.key))
    .map(({ key, values }) => ({ key, source, weight: columnWeight(values) }));
}

function columnWeight(values: string[]) {
  const longest = Math.max(...values.map((value) => value.length));
  return clamp(longest, MIN_COLUMN_WEIGHT, MAX_COLUMN_WEIGHT);
}

export function cellValue(series: Series, { key, source }: AttributeColumn) {
  const attribute = series[source].find((candidate) => candidate.key === key);
  return attribute?.value ?? "";
}

export function seriesLabel(series: Series, columns: AttributeColumn[]) {
  const values = columns.map((column) => cellValue(series, column)).filter((value) => value !== "");
  return values.length === 0 ? UNLABELED_SERIES : values.join(LABEL_SEPARATOR);
}

export function sortByColumns(series: Series[], columns: AttributeColumn[]) {
  return series.toSorted((a, b) => {
    for (const column of columns) {
      const order = compareText(cellValue(a, column), cellValue(b, column));
      if (order !== 0) {
        return order;
      }
    }

    return compareText(a.series_id, b.series_id);
  });
}
