import { useBindings } from "@opentui/keymap/react";
import { createContext, type SetStateAction, use, useEffectEvent, useId } from "react";

import { cycle, type Step } from "#utils/cycle.ts";
import { isDefined } from "#utils/is-defined.ts";
import type { Sort } from "#utils/sort.ts";

import { COLUMN_GAP } from "./columns.ts";
import { FocusRoot, useFocus } from "./focus.tsx";
import { THEME } from "./theme.ts";
import type { Selection } from "./use-selection.ts";

export const KEY_HINTS_HEIGHT = 1;

export const AppKeysContext = createContext<React.ReactNode>(null);

interface KeyHintsProps {
  children?: React.ReactNode;
}

export function KeyHints({ children }: KeyHintsProps) {
  return (
    <box flexDirection="row" gap={COLUMN_GAP} paddingX={1} marginTop="auto" overflow="hidden">
      {children}
      <FocusRoot>{use(AppKeysContext)}</FocusRoot>
    </box>
  );
}

interface KeyProps {
  name: string;
  priority?: number | undefined;
  description?: string | undefined;
  onPress: () => void | Promise<void>;
  children?: string | undefined;
}

export function Key({ name, priority = 0, description, onPress, children }: KeyProps) {
  const { focused, keysEnabled } = useFocus();
  const command = useId();
  const press = useEffectEvent(() => onPress());

  const desc = description ?? children;

  useBindings(
    () => ({
      enabled: focused && keysEnabled,
      priority,
      commands: [{ name: command, ...(isDefined(desc) ? { desc } : {}), run: () => press() }],
      bindings: [{ key: name, cmd: command }],
    }),
    [focused, keysEnabled, priority, command, desc, name],
  );

  if (!focused || !isDefined(children)) {
    return null;
  }

  return (
    <text fg={THEME.textMuted} wrapMode="none" flexShrink={0}>
      <span fg={THEME.text}>{name}</span> {children}
    </text>
  );
}

interface StepKeysProps {
  forward: string;
  backward: string;
  priority?: number | undefined;
  description?: string | undefined;
  backwardDescription: string;
  onStep: (step: Step) => void;
  children?: string | undefined;
}

export function StepKeys({
  forward,
  backward,
  priority,
  description,
  backwardDescription,
  onStep,
  children,
}: StepKeysProps) {
  return (
    <>
      <Key name={forward} priority={priority} description={description} onPress={() => onStep(1)}>
        {children}
      </Key>
      <Key
        name={backward}
        priority={priority}
        description={backwardDescription}
        onPress={() => onStep(-1)}
      />
    </>
  );
}

interface ListKeysProps<T> {
  selection: Selection<T>;
  description: string;
  backwardDescription: string;
}

export function ListKeys<T>({ selection, description, backwardDescription }: ListKeysProps<T>) {
  return (
    <>
      <Key name="down" description={description} onPress={() => selection.move(1)} />
      <Key name="up" description={backwardDescription} onPress={() => selection.move(-1)} />
      <Key name="j" description={description} onPress={() => selection.move(1)} />
      <Key name="k" description={backwardDescription} onPress={() => selection.move(-1)} />
    </>
  );
}

interface JumpKeysProps<T> extends Omit<StepKeysProps, "onStep"> {
  selection: Selection<T>;
  match: (item: T) => boolean;
}

export function JumpKeys<T>({ selection, match, ...keys }: JumpKeysProps<T>) {
  if (!selection.items.some((item) => match(item))) {
    return null;
  }

  return <StepKeys {...keys} onStep={(step) => selection.jump(step, (item) => match(item))} />;
}

interface SortKeysProps<C> {
  columns: readonly [C, ...C[]];
  ascending?: readonly NoInfer<C>[];
  onChange: (action: SetStateAction<Sort<C>>) => void;
}

export function SortKeys<C>({ columns, ascending = [], onChange }: SortKeysProps<C>) {
  function next({ column }: Sort<C>) {
    const nextColumn = cycle(columns, column, 1);
    return { column: nextColumn, descending: !ascending.includes(nextColumn) };
  }

  return (
    <>
      <Key name="o" onPress={() => onChange((sort) => next(sort))}>
        sort
      </Key>
      <Key
        name="shift+o"
        onPress={() => onChange((sort) => ({ ...sort, descending: !sort.descending }))}
      >
        reverse
      </Key>
    </>
  );
}

interface ErrorKeysProps<T> {
  selection: Selection<T>;
  isError: (item: T) => boolean;
}

export function ErrorKeys<T>({ selection, isError }: ErrorKeysProps<T>) {
  return (
    <JumpKeys
      forward="e"
      backward="shift+e"
      backwardDescription="previous error"
      selection={selection}
      match={(item) => isError(item)}
    >
      next error
    </JumpKeys>
  );
}
