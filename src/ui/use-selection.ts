import { useState } from "react";

import { around, type Step } from "#utils/cycle.ts";
import { isDefined } from "#utils/is-defined.ts";
import { clamp } from "#utils/number.ts";

export function useSelection<T>(
  items: readonly T[],
  keyOf: (item: T) => string,
  initialKey?: string,
) {
  const [selectedKey, setSelectedKey] = useState(initialKey);

  function itemOf(key: string | undefined) {
    return items.find((item) => keyOf(item) === key) ?? items[0];
  }

  const selected = itemOf(selectedKey);

  return {
    items,
    index: isDefined(selected) ? items.indexOf(selected) : -1,
    selected,
    keyOf,
    move(offset: number) {
      setSelectedKey((key) => {
        const current = itemOf(key);
        if (!isDefined(current)) {
          return key;
        }
        const index = clamp(items.indexOf(current) + offset, 0, items.length - 1);
        return keyOf(items[index] ?? current);
      });
    },
    jump(step: Step, match: (item: T) => boolean) {
      setSelectedKey((key) => {
        const current = itemOf(key);
        if (!isDefined(current)) {
          return key;
        }
        const next = around(items, current, step).find((item) => match(item));
        return isDefined(next) ? keyOf(next) : key;
      });
    },
    select(key: string) {
      setSelectedKey(key);
    },
  };
}

export type Selection<T> = ReturnType<typeof useSelection<T>>;
