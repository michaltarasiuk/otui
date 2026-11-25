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

  function findSelected(key: string | undefined) {
    return items.find((item) => keyOf(item) === key) ?? items[0];
  }

  function setSelected(update: (prevSelected: T) => T | undefined) {
    setSelectedKey((prevKey) => {
      const prevSelected = findSelected(prevKey);
      const nextSelected = isDefined(prevSelected) ? update(prevSelected) : undefined;
      return isDefined(nextSelected) ? keyOf(nextSelected) : prevKey;
    });
  }

  const selected = findSelected(selectedKey);

  return {
    items,
    index: isDefined(selected) ? items.indexOf(selected) : -1,
    selected,
    keyOf,
    move(offset: number) {
      setSelected((prev) => items[clamp(items.indexOf(prev) + offset, 0, items.length - 1)]);
    },
    jump(step: Step, match: (item: T) => boolean) {
      setSelected((prev) => around(items, prev, step).find((item) => match(item)));
    },
    select(key: string) {
      setSelectedKey(key);
    },
  };
}

export type Selection<T> = ReturnType<typeof useSelection<T>>;
