import { collapseWhitespace } from "#utils/text.ts";

const DETAILS_BORDER = "─";
const SCROLLBAR = /[▀-▟]/g;
const TABLE_ROW = /^\d{2}:\d{2}:\d{2}\.\d{3} /;
const CHART_TITLE = /^\w+ over time /;

export const CHART_DOTS = /[⠁-⣿]/;

function textLines(text: string) {
  return text
    .split("\n")
    .map((line) => collapseWhitespace(line))
    .filter((line) => line !== "");
}

export class Frame {
  readonly text: string;
  readonly lines: string[];

  constructor(text: string) {
    this.text = text;
    this.lines = textLines(text);
  }

  get tabBar() {
    return this.lines[0] ?? "";
  }

  get header() {
    return this.lines[1] ?? "";
  }

  get hints() {
    return this.lines.at(-1) ?? "";
  }

  get tableRows() {
    return this.lines.filter((line) => TABLE_ROW.test(line));
  }

  get chart() {
    const title = this.lines.findIndex((line) => CHART_TITLE.test(line));
    const firstRow = this.lines.findIndex((line) => TABLE_ROW.test(line));
    const columnHeader = firstRow - 1;
    return title === -1 || firstRow === -1 ? [] : this.lines.slice(title, columnHeader);
  }

  get list() {
    const border = this.lines.findIndex((line) => line.startsWith(DETAILS_BORDER));
    return border === -1 ? [] : this.lines.slice(1, border);
  }

  get details() {
    const lines = textLines(this.text.replaceAll(SCROLLBAR, ""));
    const border = lines.findIndex((line) => line.startsWith(DETAILS_BORDER));
    return border === -1 ? [] : lines.slice(border + 1, -1);
  }

  get spanRows() {
    return this.rowsAbovePanel("Duration");
  }

  get spanDiffRows() {
    return this.rowsAbovePanel("Change").map((line) => collapseWhitespace(line));
  }

  get hasChart() {
    return CHART_DOTS.test(this.text);
  }

  get onList() {
    return this.text.includes("/ search");
  }

  get onDetails() {
    return this.text.includes("escape back");
  }

  positionOf(text: string) {
    const lines = this.text.split("\n");
    const y = lines.findIndex((line) => line.includes(text));
    return { x: lines[y]?.indexOf(text) ?? -1, y };
  }

  lineOf(text: string) {
    return this.text.split("\n").findIndex((line) => collapseWhitespace(line).includes(text));
  }

  detailsLineOf(text: string) {
    const lines = this.text.split("\n");
    const border = lines.findIndex((line) => line.startsWith(DETAILS_BORDER));
    const line = lines
      .slice(border + 1)
      .findIndex((line) => collapseWhitespace(line).includes(text));
    return border === -1 || line === -1 ? -1 : border + 1 + line;
  }

  private rowsAbovePanel(column: string) {
    const lines = this.text.split("\n");
    const header = lines.findIndex((line) => line.includes("Service") && line.includes(column));
    const panel = lines.findIndex((line) => line.startsWith(DETAILS_BORDER));
    if (header === -1 || panel === -1) {
      return [];
    }
    return lines.slice(header + 1, panel).filter((line) => line.trim() !== "");
  }
}
