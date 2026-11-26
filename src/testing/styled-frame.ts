import type { CapturedFrame, CapturedSpan, RGBA } from "@opentui/core";

import { TABS } from "#app/tabs.tsx";
import { THEME } from "#ui/theme.ts";
import { isDefined } from "#utils/is-defined.ts";
import { collapseWhitespace } from "#utils/text.ts";

interface TabStyle {
  highlighted: boolean;
  fg: "text" | "muted";
}

export function hex(color: RGBA) {
  const [red, green, blue, alpha] = color.toInts();
  const channels = alpha === 255 ? [red, green, blue] : [red, green, blue, alpha];
  return `#${channels.map((channel) => channel.toString(16).padStart(2, "0").toUpperCase()).join("")}`;
}

export class StyledLine {
  readonly spans: CapturedSpan[];

  constructor(spans: CapturedSpan[]) {
    this.spans = spans;
  }

  get text() {
    return collapseWhitespace(this.spans.map((span) => span.text).join(""));
  }

  get isSelected() {
    return this.spans.some(
      (span) => span.text.trim() !== "" && hex(span.bg) === THEME.backgroundSelected,
    );
  }

  fg(text: string) {
    const span = this.spanStartingWith(text);
    return isDefined(span) ? hex(span.fg) : undefined;
  }

  bg(text: string) {
    const span = this.spanStartingWith(text);
    return isDefined(span) ? hex(span.bg) : undefined;
  }

  private spanStartingWith(text: string) {
    return this.spans.find((span) => span.text.trim().startsWith(text));
  }
}

export class StyledFrame {
  readonly lines: StyledLine[];

  constructor({ lines }: CapturedFrame) {
    this.lines = lines.map(({ spans }) => new StyledLine(spans));
  }

  line(text: string) {
    const line = this.lines.find((line) => line.text.includes(text));
    if (!isDefined(line)) {
      const lines = this.lines.map((line) => line.text).join("\n");
      throw new Error(`No line contains ${JSON.stringify(text)}. The lines were:\n${lines}`);
    }
    return line;
  }

  get selection() {
    const line = this.lines.findIndex((line) => line.isSelected);
    return line === -1 ? undefined : { line, text: this.lines[line]?.text ?? "" };
  }

  nearestLineOf(text: string, from: number) {
    let nearest = this.lines.length;
    for (const [line, { text: lineText }] of this.lines.entries()) {
      if (lineText.includes(text) && Math.abs(line - from) < Math.abs(nearest - from)) {
        nearest = line;
      }
    }
    return nearest;
  }

  get tabs() {
    const styles: Record<string, TabStyle> = {};
    for (const span of this.lines[0]?.spans ?? []) {
      const name = span.text.trim();
      if (!TABS.some((tab) => tab.name === name)) {
        continue;
      }
      styles[name] = {
        highlighted: hex(span.bg) === THEME.backgroundSelected,
        fg: hex(span.fg) === THEME.text ? "text" : "muted",
      };
    }
    return styles;
  }
}
