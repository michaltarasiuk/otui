import type { MockInput } from "@opentui/core/testing";

type Characters<S extends string> = S extends `${infer F}${infer R}` ? F | Characters<R> : never;

type Character = Characters<"abcdefghijklmnopqrstuvwxyz0123456789/?">;

type NamedKey =
  | "return"
  | "escape"
  | "tab"
  | "space"
  | "up"
  | "down"
  | "left"
  | "right"
  | "home"
  | "end"
  | "pageup"
  | "pagedown";

type Modifier = "shift" | "ctrl";

export type Key = Character | NamedKey | `${Modifier}+${Character | NamedKey}`;

const PAGE_UP = "\x1b[5~";
const PAGE_DOWN = "\x1b[6~";

export function pressKey(input: MockInput, key: Key) {
  const [modifier, name] = key.includes("+") ? key.split("+") : [undefined, key];
  const modifiers = modifier === "shift" || modifier === "ctrl" ? { [modifier]: true } : {};

  switch (name) {
    case "return":
      return input.pressEnter(modifiers);
    case "escape":
      return input.pressEscape(modifiers);
    case "tab":
      return input.pressTab(modifiers);
    case "up":
    case "down":
    case "left":
    case "right":
      return input.pressArrow(name, modifiers);
    case "space":
      return input.pressKey(" ", modifiers);
    case "home":
      return input.pressKey("HOME", modifiers);
    case "end":
      return input.pressKey("END", modifiers);
    case "pageup":
      return input.pressKey(PAGE_UP, modifiers);
    case "pagedown":
      return input.pressKey(PAGE_DOWN, modifiers);
    default:
      return input.pressKey(name ?? key, modifiers);
  }
}
