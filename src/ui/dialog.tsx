import { TextAttributes } from "@opentui/core";

import { THEME } from "./theme.ts";

interface DialogProps {
  title: string;
  children: React.ReactNode;
}

export function Dialog({ title, children }: DialogProps) {
  return (
    <box
      position="absolute"
      top={0}
      left={0}
      right={0}
      bottom={0}
      justifyContent="center"
      alignItems="center"
    >
      <box
        border
        borderColor={THEME.textMuted}
        backgroundColor={THEME.backgroundOverlay}
        paddingX={1}
      >
        <text fg={THEME.text} attributes={TextAttributes.BOLD}>
          {title}
        </text>
        {children}
      </box>
    </box>
  );
}
