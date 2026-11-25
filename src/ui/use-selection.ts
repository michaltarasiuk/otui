import { useState } from "react";

import { findNextIndex, type Step } from "#utils/cycle.ts";
import { clamp } from "#utils/number.ts";

export function useSelection<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  initialKey?: string,
) {
  const [selectedKey, setSelectedKey] = useState(initialKey);

  function indexOf(key: string | undefined) {
    const index = items.findIndex((item) => keyOf(item) === key);
    return Math.max(index, 0);
  }

  function keyAt(index: number) {
    const item = items[clamp(index, 0, items.length - 1)];
    return item === undefined ? undefined : keyOf(item);
  }

  const selectedIndex = indexOf(selectedKey);

  return {
    items,
    index: selectedIndex,
    selected: items[selectedIndex],
    keyOf,
    move(offset: number) {
      setSelectedKey((key) => keyAt(indexOf(key) + offset) ?? key);
    },
    jump(step: Step, match: (item: T) => boolean) {
      setSelectedKey((key) => keyAt(findNextIndex(items, indexOf(key), step, match)) ?? key);
    },
    selectKey(key: string) {
      setSelectedKey(key);
    },
  };
}

export type Selection<T> = ReturnType<typeof useSelection<T>>;
