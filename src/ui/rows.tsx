import { type BoxRenderable, MouseButton } from "@opentui/core";
import { useBindings } from "@opentui/keymap/react";
import { createContext, use, useEffectEvent, useRef, useState } from "react";

import type { Step } from "#utils/cycle.ts";
import { clamp } from "#utils/number.ts";

import { useFocus } from "./focus.tsx";
import { THEME } from "./theme.ts";
import { useScrollGesture } from "./use-scroll-gesture.ts";
import type { Selection } from "./use-selection.ts";

const SelectedContext = createContext(false);

interface RowsProps<T> {
  selection: Selection<T>;
  halfPageKeys?: boolean;
  children: (item: T) => React.ReactNode;
}

export function Rows<T>({ selection, halfPageKeys = false, children }: RowsProps<T>) {
  const { focused, keysEnabled } = useFocus();
  const claimScroll = useScrollGesture();
  const [measured, setMeasured] = useState({
    height: selection.items.length,
    itemCount: selection.items.length,
  });
  const rowsRef = useRef<BoxRenderable>(null);

  const { items } = selection;
  const visibleRowCount = measured.height < measured.itemCount ? measured.height : items.length;
  const hiddenRowCount = items.length - visibleRowCount;
  const halfPage = Math.max(1, Math.floor(visibleRowCount / 2));

  const firstVisibleIndex = clamp(
    selection.index - Math.floor(visibleRowCount / 2),
    0,
    hiddenRowCount,
  );
  const visibleItems = items.slice(firstVisibleIndex, firstVisibleIndex + visibleRowCount);
  const scrollThumbTop = Math.round((firstVisibleIndex / hiddenRowCount) * (visibleRowCount - 1));

  const moveBy = useEffectEvent((offset: number) => selection.move(offset));
  const movePage = useEffectEvent((direction: Step) => moveBy(direction * visibleRowCount));
  const moveHalfPage = useEffectEvent((direction: Step) => moveBy(direction * halfPage));
  const moveToFirst = useEffectEvent(() => moveBy(-items.length));
  const moveToLast = useEffectEvent(() => moveBy(items.length));

  useBindings(
    () => ({
      enabled: focused && keysEnabled,
      commands: [
        { name: "rows.next", desc: "next row", run: () => moveBy(1) },
        { name: "rows.previous", desc: "previous row", run: () => moveBy(-1) },
        { name: "rows.next-page", desc: "next page", run: () => movePage(1) },
        { name: "rows.previous-page", desc: "previous page", run: () => movePage(-1) },
        { name: "rows.first", desc: "first row", run: () => moveToFirst() },
        { name: "rows.last", desc: "last row", run: () => moveToLast() },
      ],
      bindings: [
        { key: "down", cmd: "rows.next" },
        { key: "j", cmd: "rows.next" },
        { key: "up", cmd: "rows.previous" },
        { key: "k", cmd: "rows.previous" },
        { key: "pagedown", cmd: "rows.next-page" },
        { key: "pageup", cmd: "rows.previous-page" },
        { key: "home", cmd: "rows.first" },
        { key: "end", cmd: "rows.last" },
      ],
    }),
    [focused, keysEnabled],
  );

  useBindings(
    () => ({
      enabled: focused && keysEnabled && halfPageKeys,
      commands: [
        { name: "rows.next-half-page", desc: "half page down", run: () => moveHalfPage(1) },
        { name: "rows.previous-half-page", desc: "half page up", run: () => moveHalfPage(-1) },
      ],
      bindings: [
        { key: "ctrl+d", cmd: "rows.next-half-page" },
        { key: "ctrl+u", cmd: "rows.previous-half-page" },
      ],
    }),
    [focused, keysEnabled, halfPageKeys],
  );

  function measure() {
    setMeasured({ height: rowsRef.current?.height ?? 0, itemCount: items.length });
  }

  return (
    <box
      ref={rowsRef}
      flexGrow={1}
      flexBasis={0}
      maxHeight={items.length}
      overflow="hidden"
      onSizeChange={() => measure()}
      onMouseScroll={({ scroll }) => {
        if (!claimScroll() || scroll === undefined) {
          return;
        }
        if (scroll.direction === "down") {
          selection.move(scroll.delta);
        } else if (scroll.direction === "up") {
          selection.move(-scroll.delta);
        }
      }}
    >
      <box flexShrink={0} onSizeChange={() => measure()}>
        {visibleItems.map((item) => (
          <Selectable key={selection.keyOf(item)} selection={selection} item={item}>
            {children(item)}
          </Selectable>
        ))}
      </box>
      {visibleRowCount > 0 && hiddenRowCount > 0 && (
        <text position="absolute" right={0} top={scrollThumbTop} fg={THEME.textMuted}>
          █
        </text>
      )}
    </box>
  );
}

interface SelectableProps<T> {
  selection: Selection<T>;
  item: T;
  children: React.ReactNode;
}

export function Selectable<T>({ selection, item, children }: SelectableProps<T>) {
  const { requestFocus } = useFocus();

  const key = selection.keyOf(item);
  const selected = selection.selected !== undefined && selection.keyOf(selection.selected) === key;

  return (
    <box
      flexShrink={0}
      onMouseDown={(event) => {
        if (event.button === MouseButton.LEFT) {
          requestFocus();
          selection.select(key);
        }
      }}
    >
      <SelectedContext value={selected}>{children}</SelectedContext>
    </box>
  );
}

export function useIsSelected() {
  return use(SelectedContext);
}
