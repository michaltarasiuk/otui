import type { KeyEvent, Renderable } from "@opentui/core";
import type { Keymap } from "@opentui/keymap";

import { COLUMN_GAP } from "#ui/columns.ts";
import { Dialog } from "#ui/dialog.tsx";
import { Key } from "#ui/key-hints.tsx";
import { THEME } from "#ui/theme.ts";

export interface HelpEntry {
  keys: string;
  desc: string;
}

export function activeHelp(keymap: Keymap<Renderable, KeyEvent>): HelpEntry[] {
  const active = keymap.getActiveKeys({ includeMetadata: true });
  const described = active.flatMap(({ display, commandAttrs: { desc } = {} }) =>
    typeof desc === "string" ? [{ display, desc }] : [],
  );
  const byDesc = Map.groupBy(described, ({ desc }) => desc);

  return Array.from(byDesc, ([desc, group]) => {
    const keys = new Set(group.map(({ display }) => display));
    return { keys: [...keys].join(", "), desc };
  });
}

interface HelpProps {
  entries: HelpEntry[];
  onClose: () => void;
}

export function Help({ entries, onClose }: HelpProps) {
  const keysWidth = Math.max(...entries.map(({ keys }) => keys.length));

  return (
    <Dialog title="Keys">
      {entries.map(({ keys, desc }) => (
        <box key={desc} flexDirection="row" gap={COLUMN_GAP}>
          <text width={keysWidth} fg={THEME.text} flexShrink={0}>
            {keys}
          </text>
          <text fg={THEME.textMuted} wrapMode="none">
            {desc}
          </text>
        </box>
      ))}
      <box flexDirection="row" gap={COLUMN_GAP}>
        <Key name="escape" onPress={() => onClose()}>
          close
        </Key>
        <Key name="?" onPress={() => onClose()} />
      </box>
    </Dialog>
  );
}
