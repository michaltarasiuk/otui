import { MouseButton, type TabSelectOption, type TabSelectRenderable } from "@opentui/core";
import { useEffect, useRef } from "react";

import { useFocus } from "#ui/focus.tsx";
import { THEME } from "#ui/theme.ts";
import { isDefined } from "#utils/is-defined.ts";

import type { Tab } from "./router.tsx";

const TAB_WIDTH = 10;

interface TabOption extends TabSelectOption {
  value: Tab;
}

export const TABS = [
  { name: "Services", description: "", value: "services" },
  { name: "Traces", description: "", value: "traces" },
  { name: "Metrics", description: "", value: "metrics" },
  { name: "Logs", description: "", value: "logs" },
] as const satisfies TabOption[];

interface TabsProps {
  current: Tab;
  onSelect: (tab: Tab) => void;
}

export function Tabs({ current, onSelect }: TabsProps) {
  const { focused, keysEnabled, requestFocus } = useFocus();
  const tabsRef = useRef<TabSelectRenderable>(null);

  const index = TABS.findIndex((tab) => tab.value === current);

  useEffect(() => {
    tabsRef.current?.setSelectedIndex(index);
  }, [index]);

  function select(index: number) {
    const tab = TABS[index];
    if (isDefined(tab)) {
      onSelect(tab.value);
    }
  }

  return (
    <tab-select
      ref={tabsRef}
      focused={focused && keysEnabled}
      options={TABS}
      tabWidth={TAB_WIDTH}
      width={TABS.length * TAB_WIDTH}
      flexShrink={0}
      textColor={THEME.textMuted}
      selectedTextColor={THEME.text}
      selectedBackgroundColor={focused ? THEME.backgroundSelected : THEME.background}
      showDescription={false}
      showUnderline={false}
      onMouseDown={(event) => {
        if (event.button === MouseButton.LEFT) {
          requestFocus();
          select(Math.floor((event.x - (event.currentTarget?.x ?? 0)) / TAB_WIDTH));
        }
      }}
      onChange={(index) => select(index)}
    />
  );
}
