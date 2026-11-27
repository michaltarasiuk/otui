import { isDefined } from "./is-defined.ts";

const collator = new Intl.Collator("en-US", { numeric: true });

export function collapseWhitespace(text: string) {
  return text.trim().replace(/\s+/g, " ");
}

export function indent(depth: number) {
  return "  ".repeat(depth);
}

export function shortId(id: string) {
  return id.slice(0, 8);
}

export function compareText(a: string, b: string) {
  return collator.compare(a, b);
}

export function formatJson(text: string) {
  try {
    const value: unknown = JSON.parse(text);
    return typeof value === "object" && isDefined(value) ? JSON.stringify(value, null, 2) : text;
  } catch {
    return text;
  }
}
