import { useState } from "react";

import { cycle, type Step } from "#utils/cycle.ts";
import { isDefined } from "#utils/is-defined.ts";

import { useFocus } from "./focus.tsx";
import { StepKeys } from "./key-hints.tsx";

export function useRegion<T>(regions: readonly [T, ...T[]]) {
  const [region, setRegion] = useState(regions[0]);

  return [regions.includes(region) ? region : regions[0], setRegion] as const;
}

interface RegionKeysProps<T> {
  regions: readonly [T, ...T[]];
  region: T;
  onChange: (region: T) => void;
  children?: string;
}

export function RegionKeys<T>({ regions, region, onChange, children }: RegionKeysProps<T>) {
  const { depth, stepOut } = useFocus();

  function step(step: Step) {
    const next = regions[regions.indexOf(region) + step];
    if (isDefined(next)) {
      onChange(next);
    } else if (!isDefined(stepOut)) {
      onChange(cycle(regions, region, step));
    } else {
      onChange(regions[0]);
      stepOut(step);
    }
  }

  return (
    <StepKeys
      forward="tab"
      backward="shift+tab"
      priority={depth}
      description="next region"
      backwardDescription="previous region"
      onStep={(next) => step(next)}
    >
      {children}
    </StepKeys>
  );
}
