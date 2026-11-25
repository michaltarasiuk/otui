import { test } from "bun:test";

import { useState } from "react";

import { render } from "#testing/render.tsx";
import { textLines } from "#testing/screen.ts";

import { Key } from "./key-hints.tsx";
import { type Selection, useSelection } from "./use-selection.ts";

const SCREEN_SIZE = { width: 30, height: 3 };

type Action = (selection: Selection<string>, setItems: (items: string[]) => void) => void;

interface SelectionProbeProps {
  items: string[];
  initialKey?: string | undefined;
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
  return (frame: string) => textLines(frame).includes(`selected: ${selected}`);
}

function isError(item: string) {
  return item.startsWith("error");
}

test("starts on the initial key", async () => {
  await using screen = await render(
    <SelectionProbe items={["alpha", "beta", "gamma"]} initialKey="gamma" keys={{}} />,
    SCREEN_SIZE,
  );

  await screen.waitForFrame(shows("gamma (2)"));
});

test("follows the selected item when the list is reordered", async () => {
  await using screen = await render(
    <SelectionProbe
      items={["alpha", "beta", "gamma"]}
      keys={{
        j: (selection) => selection.move(1),
        r: (_, setItems) => setItems(["gamma", "alpha", "beta"]),
      }}
    />,
    SCREEN_SIZE,
  );
  await screen.waitForFrame(shows("alpha (0)"));
  screen.mockInput.pressKey("j");
  await screen.waitForFrame(shows("beta (1)"));

  screen.mockInput.pressKey("r");

  await screen.waitForFrame(shows("beta (2)"));
});

test("selects a key that joins the list in the same update", async () => {
  await using screen = await render(
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
  await screen.waitForFrame(shows("alpha (0)"));

  screen.mockInput.pressKey("d");

  await screen.waitForFrame(shows("delta (2)"));
});

test("falls back to the first item while the selected one is gone and returns to it", async () => {
  await using screen = await render(
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
  await screen.waitForFrame(shows("alpha (0)"));
  screen.mockInput.pressKey("j");
  await screen.waitForFrame(shows("beta (1)"));

  screen.mockInput.pressKey("x");
  await screen.waitForFrame(shows("alpha (0)"));
  screen.mockInput.pressKey("y");

  await screen.waitForFrame(shows("beta (1)"));
});

test("selects nothing in an empty list and the first item once items arrive", async () => {
  await using screen = await render(
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
  await screen.waitForFrame(shows("none (-1)"));
  screen.mockInput.pressKey("j");
  screen.mockInput.pressKey("e");

  screen.mockInput.pressKey("a");

  await screen.waitForFrame(shows("alpha (0)"));
});

test("counts every move and jump made in one update", async () => {
  await using screen = await render(
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
  await screen.waitForFrame(shows("alpha (0)"));

  screen.mockInput.pressKey("j");
  await screen.waitForFrame(shows("beta (2)"));
  screen.mockInput.pressKey("e");

  await screen.waitForFrame(shows("error 1 (1)"));
});

test("jumps to the next match in either direction, continuing from the other end", async () => {
  await using screen = await render(
    <SelectionProbe
      items={["alpha", "error 1", "beta", "error 2"]}
      keys={{
        e: (selection) => selection.jump(1, isError),
        "shift+e": (selection) => selection.jump(-1, isError),
      }}
    />,
    SCREEN_SIZE,
  );
  await screen.waitForFrame(shows("alpha (0)"));

  screen.mockInput.pressKey("e");
  await screen.waitForFrame(shows("error 1 (1)"));
  screen.mockInput.pressKey("e");
  await screen.waitForFrame(shows("error 2 (3)"));
  screen.mockInput.pressKey("e");
  await screen.waitForFrame(shows("error 1 (1)"));
  screen.mockInput.pressKey("e", { shift: true });

  await screen.waitForFrame(shows("error 2 (3)"));
});

test("stays put when jumping finds no other match", async () => {
  await using screen = await render(
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
  await screen.waitForFrame(shows("alpha (0)"));

  screen.mockInput.pressKey("e");

  await screen.waitForFrame(shows("beta (1)"));
});
