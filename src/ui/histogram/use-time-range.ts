import { useDeferredValue, useState } from "react";

import type { Step } from "#utils/cycle.ts";

import { type HistogramRange, stepSelection } from "./bars.ts";

export function useTimeRange() {
  const [selected, setSelected] = useState<HistogramRange | undefined>(undefined);
  const deferredSelected = useDeferredValue(selected);

  return {
    selected,
    deferredSelected,
    step(occupied: HistogramRange[], step: Step) {
      setSelected((selected) => stepSelection(occupied, selected, step));
    },
    clear() {
      setSelected(undefined);
    },
  };
}

export type TimeRange = ReturnType<typeof useTimeRange>;
