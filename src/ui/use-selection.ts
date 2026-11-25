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

  function moveFrom(next: (current: T) => T | undefined) {
    setSelectedKey((key) => {
      const current = itemOf(key);
      const item = isDefined(current) ? next(current) : undefined;
      return isDefined(item) ? keyOf(item) : key;
    });
  }

  const selected = itemOf(selectedKey);

  return {
    items,
    index: isDefined(selected) ? items.indexOf(selected) : -1,
    selected,
    keyOf,
    move(offset: number) {
      moveFrom((current) => items[clamp(items.indexOf(current) + offset, 0, items.length - 1)]);
    },
    jump(step: Step, match: (item: T) => boolean) {
      moveFrom((current) => around(items, current, step).find((item) => match(item)));
    },
    select(key: string) {
      setSelectedKey(key);
    },
  };
}

export type Selection<T> = ReturnType<typeof useSelection<T>>;
