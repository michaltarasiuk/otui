import { test } from "bun:test";

import { useState } from "react";

import type { Frame } from "#testing/frame.ts";
import { render } from "#testing/render.tsx";

import { Key } from "./key-hints.tsx";
import { type Selection, useSelection } from "./use-selection.ts";

const SCREEN_SIZE = { width: 30, height: 3 };

type Action = (selection: Selection<string>, setItems: (items: string[]) => void) => void;

interface SelectionProbeProps {
  items: string[];
  initialKey?: string;
  keys: Record<string, Action>;
}

function SelectionProbe({ items: initialItems, initialKey, keys }: SelectionProbeProps) {
  const [items, setItems] = useState(initialItems);
  const selection = useSelection(items, (item) => item, initialKey);

  return (
    <>
      <text>{`selected: ${selection.selected ?? "none"} (${selection.index})`}</text>
      {Object.entries(keys).map(([name, action]) => (
        <Key key={name} name={name} onPress={() => action(selection, setItems)} />
      ))}
    </>
  );
}

function shows(selected: string) {
  return (frame: Frame) => frame.lines.includes(`selected: ${selected}`);
}

function isError(item: string) {
  return item.startsWith("error");
}

test("starts on the initial key", async () => {
  const screen = await render(
    <SelectionProbe items={["alpha", "beta", "gamma"]} initialKey="gamma" keys={{}} />,
    SCREEN_SIZE,
  );

  await screen.waitFor(shows("gamma (2)"));
});

test("follows the selected item when the list is reordered", async () => {
  const screen = await render(
    <SelectionProbe
      items={["alpha", "beta", "gamma"]}
      keys={{
        j: (selection) => selection.move(1),
        r: (_, setItems) => setItems(["gamma", "alpha", "beta"]),
      }}
    />,
    SCREEN_SIZE,
  );
  await screen.waitFor(shows("alpha (0)"));
  screen.press("j");
  await screen.waitFor(shows("beta (1)"));

  screen.press("r");

  await screen.waitFor(shows("beta (2)"));
});

test("selects a key that joins the list in the same update", async () => {
  const screen = await render(
    <SelectionProbe
      items={["alpha", "beta"]}
      keys={{
        d: (selection, setItems) => {
          setItems([...selection.items, "delta"]);
          selection.select("delta");
        },
      }}
    />,
    SCREEN_SIZE,
  );
  await screen.waitFor(shows("alpha (0)"));

  screen.press("d");

  await screen.waitFor(shows("delta (2)"));
});

test("falls back to the first item while the selected one is gone and returns to it", async () => {
  const screen = await render(
    <SelectionProbe
      items={["alpha", "beta", "gamma"]}
      keys={{
        j: (selection) => selection.move(1),
        x: (_, setItems) => setItems(["alpha", "gamma"]),
        y: (_, setItems) => setItems(["alpha", "beta", "gamma"]),
      }}
    />,
    SCREEN_SIZE,
  );
  await screen.waitFor(shows("alpha (0)"));
  screen.press("j");
  await screen.waitFor(shows("beta (1)"));

  screen.press("x");
  await screen.waitFor(shows("alpha (0)"));
  screen.press("y");

  await screen.waitFor(shows("beta (1)"));
});

test("selects nothing in an empty list and the first item once items arrive", async () => {
  const screen = await render(
    <SelectionProbe
      items={[]}
      keys={{
        j: (selection) => selection.move(1),
        e: (selection) => selection.jump(1, () => true),
        a: (_, setItems) => setItems(["alpha", "beta"]),
      }}
    />,
    SCREEN_SIZE,
  );
  await screen.waitFor(shows("none (-1)"));
  screen.press("j");
  screen.press("e");

  screen.press("a");

  await screen.waitFor(shows("alpha (0)"));
});

test("counts every move and jump made in one update", async () => {
  const screen = await render(
    <SelectionProbe
      items={["alpha", "error 1", "beta", "error 2", "gamma"]}
      keys={{
        j: (selection) => {
          selection.move(1);
          selection.move(1);
        },
        e: (selection) => {
          selection.jump(1, isError);
          selection.jump(1, isError);
        },
      }}
    />,
    SCREEN_SIZE,
  );
  await screen.waitFor(shows("alpha (0)"));

  screen.press("j");
  await screen.waitFor(shows("beta (2)"));
  screen.press("e");

  await screen.waitFor(shows("error 1 (1)"));
});

test("jumps to the next match in either direction, continuing from the other end", async () => {
  const screen = await render(
    <SelectionProbe
      items={["alpha", "error 1", "beta", "error 2"]}
      keys={{
        e: (selection) => selection.jump(1, isError),
        "shift+e": (selection) => selection.jump(-1, isError),
      }}
    />,
    SCREEN_SIZE,
  );
  await screen.waitFor(shows("alpha (0)"));

  screen.press("e");
  await screen.waitFor(shows("error 1 (1)"));
  screen.press("e");
  await screen.waitFor(shows("error 2 (3)"));
  screen.press("e");
  await screen.waitFor(shows("error 1 (1)"));
  screen.press("shift+e");

  await screen.waitFor(shows("error 2 (3)"));
});

test("stays put when jumping finds no other match", async () => {
  const screen = await render(
    <SelectionProbe
      items={["alpha", "beta", "gamma"]}
      keys={{
        e: (selection) => {
          selection.jump(1, () => false);
          selection.move(1);
        },
      }}
    />,
    SCREEN_SIZE,
  );
  await screen.waitFor(shows("alpha (0)"));

  screen.press("e");

  await screen.waitFor(shows("beta (1)"));
});
