import { type ColorInput, TextAttributes } from "@opentui/core";

import { isDefined } from "#utils/is-defined.ts";
import type { Sort } from "#utils/sort.ts";

import { COLUMN_GAP } from "./columns.ts";
import { useFocus } from "./focus.tsx";
import { useIsSelected } from "./rows.tsx";
import { THEME } from "./theme.ts";

type Align = "left" | "right";
export type SortDirection = "ascending" | "descending";

const SORT_ARROWS = { ascending: "▲", descending: "▼" } satisfies Record<SortDirection, string>;

export function sortDirection<C>(sort: Sort<C>, column: C): SortDirection | undefined {
  if (sort.column !== column) {
    return undefined;
  }
  return sort.descending ? "descending" : "ascending";
}

interface CellLayout {
  width?: number;
  grow?: number;
  align?: Align;
}

function cellLayoutProps({ width, grow, align = "left" }: CellLayout) {
  return {
    ...(isDefined(width) ? { width } : {}),
    ...(isDefined(grow) ? { flexGrow: grow, flexBasis: 0 } : {}),
    textAlign: align,
    wrapMode: "none",
    truncate: true,
  } as const;
}

interface TableHeaderProps {
  children: React.ReactNode;
}

export function TableHeader({ children }: TableHeaderProps) {
  return <Row>{children}</Row>;
}

interface ColumnProps extends CellLayout {
  sort?: SortDirection;
  children: string;
}

export function Column({ sort, children, ...layout }: ColumnProps) {
  const arrow = isDefined(sort) ? [SORT_ARROWS[sort]] : [];
  const parts = layout.align === "right" ? [...arrow, children] : [children, ...arrow];

  return (
    <text {...cellLayoutProps(layout)} fg={THEME.textMuted} attributes={TextAttributes.BOLD}>
      {parts.join(" ")}
    </text>
  );
}

interface RowProps {
  children: React.ReactNode;
}

export function Row({ children }: RowProps) {
  const { focused } = useFocus();
  const selected = useIsSelected();

  return (
    <box
      flexDirection="row"
      gap={COLUMN_GAP}
      paddingX={1}
      backgroundColor={selected && focused ? THEME.backgroundSelected : THEME.background}
    >
      {children}
    </box>
  );
}

interface CellProps extends CellLayout {
  muted?: boolean;
  color?: ColorInput;
  children?: React.ReactNode;
}

function useMutedColor() {
  const selected = useIsSelected();
  return selected ? THEME.text : THEME.textMuted;
}

export function Cell({ muted = false, color, children, ...layout }: CellProps) {
  const mutedColor = useMutedColor();

  return (
    <text {...cellLayoutProps(layout)} fg={color ?? (muted ? mutedColor : THEME.text)}>
      {children}
    </text>
  );
}

interface SecondaryProps {
  children: React.ReactNode;
}

export function Secondary({ children }: SecondaryProps) {
  return <span fg={useMutedColor()}>{children}</span>;
}
