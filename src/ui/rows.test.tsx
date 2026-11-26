import { expect, test } from "bun:test";

import { useState } from "react";

import { Frame } from "#testing/frame.ts";
import { render } from "#testing/render.tsx";

import { FocusScope } from "./focus.tsx";
import { Key } from "./key-hints.tsx";
import { Rows, useIsSelected } from "./rows.tsx";
import { useSelection } from "./use-selection.ts";

const SCREEN_SIZE = { width: 20, height: 5 };

const SCROLL_INDICATOR = "█";

interface NumberedRowProps {
  name: string;
}

function NumberedRow({ name }: NumberedRowProps) {
  const selected = useIsSelected();

  return <text>{`${selected ? ">" : " "} ${name}`}</text>;
}

interface NumberedRowsProps {
  count: number;
  halfPageKeys?: boolean;
}

function NumberedRows({ count, halfPageKeys = false }: NumberedRowsProps) {
  const rows = Array.from({ length: count }, (_, index) => `row ${index + 1}`);
  const selection = useSelection(rows, (row) => row);

  return (
    <Rows selection={selection} halfPageKeys={halfPageKeys}>
      {(row) => <NumberedRow name={row} />}
    </Rows>
  );
}

interface GrowingRowsProps {
  from: number;
  to: number;
}

function GrowingRows({ from, to }: GrowingRowsProps) {
  const [count, setCount] = useState(from);

  return (
    <>
      <NumberedRows count={count} />
      <Key name="g" onPress={() => setCount(to)} />
    </>
  );
}

function visibleRows(frame: Frame) {
  return new Frame(frame.text.replaceAll(SCROLL_INDICATOR, "")).lines;
}

function indicatorLine(frame: Frame) {
  return frame.text.split("\n").findIndex((line) => line.includes(SCROLL_INDICATOR));
}

function selected(row: number) {
  return (frame: Frame) => visibleRows(frame).includes(`> row ${row}`);
}

test("renders only the rows that fit", async () => {
  const screen = await render(<NumberedRows count={20} />, SCREEN_SIZE);

  const frame = await screen.waitFor(selected(1));

  expect(visibleRows(frame)).toEqual(["> row 1", "row 2", "row 3", "row 4", "row 5"]);
});

test("keeps the selection in the middle as it moves down", async () => {
  const screen = await render(<NumberedRows count={20} />, SCREEN_SIZE);
  await screen.waitFor(selected(1));

  for (const row of [2, 3, 4]) {
    screen.press("down");
    await screen.waitFor(selected(row));
  }

  const frame = await screen.waitFor(selected(4));
  expect(visibleRows(frame)).toEqual(["row 2", "row 3", "> row 4", "row 5", "row 6"]);
});

test("moves with j and k", async () => {
  const screen = await render(<NumberedRows count={20} />, SCREEN_SIZE);
  await screen.waitFor(selected(1));

  screen.press("j");
  await screen.waitFor(selected(2));
  screen.press("k");

  await screen.waitFor(selected(1));
});

test("stops at the first and last rows", async () => {
  const screen = await render(<NumberedRows count={20} />, SCREEN_SIZE);
  await screen.waitFor(selected(1));

  screen.press("up");
  await screen.captureFrame();
  screen.press("down");
  await screen.waitFor(selected(2));

  screen.press("end");
  let frame = await screen.waitFor(selected(20));
  expect(visibleRows(frame)).toEqual(["row 16", "row 17", "row 18", "row 19", "> row 20"]);

  screen.press("down");
  await screen.captureFrame();
  screen.press("up");
  frame = await screen.waitFor(selected(19));
  expect(visibleRows(frame)).toContain("row 20");
});

test("pages by the number of visible rows", async () => {
  const screen = await render(<NumberedRows count={20} />, SCREEN_SIZE);
  await screen.waitFor(selected(1));

  screen.press("pagedown");
  await screen.waitFor(selected(6));
  screen.press("pagedown");
  await screen.waitFor(selected(11));
  screen.press("pageup");
  await screen.waitFor(selected(6));
  screen.press("home");

  await screen.waitFor(selected(1));
});

test("moves half a page with ctrl+d and ctrl+u when asked", async () => {
  const screen = await render(<NumberedRows count={20} halfPageKeys />, SCREEN_SIZE);
  await screen.waitFor(selected(1));

  screen.press("ctrl+d");
  await screen.waitFor(selected(3));
  screen.press("ctrl+d");
  await screen.waitFor(selected(5));
  screen.press("ctrl+u");

  await screen.waitFor(selected(3));
});

test("selects the row a click lands on", async () => {
  const screen = await render(<NumberedRows count={20} />, SCREEN_SIZE);
  await screen.waitFor(selected(1));

  await screen.mockMouse.click(2, 3);

  await screen.waitFor(selected(4));
});

test("moves the selection once for every scroll event, however fast they come", async () => {
  const screen = await render(<NumberedRows count={20} />, SCREEN_SIZE);
  await screen.waitFor(selected(1));

  await Promise.all([
    screen.mockMouse.scroll(2, 1, "down"),
    screen.mockMouse.scroll(2, 1, "down"),
    screen.mockMouse.scroll(2, 1, "down"),
  ]);
  await screen.waitFor(selected(4));

  await Promise.all([screen.mockMouse.scroll(2, 1, "up"), screen.mockMouse.scroll(2, 1, "up")]);
  await screen.waitFor(selected(2));
});

test("places the scroll indicator by how far the list has scrolled", async () => {
  const screen = await render(<NumberedRows count={20} />, SCREEN_SIZE);
  const frame = await screen.waitForText(SCROLL_INDICATOR);
  expect(indicatorLine(frame)).toBe(0);

  screen.press("end");

  expect(indicatorLine(await screen.waitFor(selected(20)))).toBe(SCREEN_SIZE.height - 1);
});

test("draws the scroll indicator only beside rows", async () => {
  const screen = await render(<NumberedRows count={20} />, SCREEN_SIZE);
  const framesWithoutRows: string[] = [];

  await screen.waitFor((frame) => {
    if (frame.text.includes(SCROLL_INDICATOR) && visibleRows(frame).length === 0) {
      framesWithoutRows.push(frame.text);
    }
    return selected(1)(frame);
  });

  expect(framesWithoutRows).toEqual([]);
});

test("leaves out the scroll indicator when every row fits", async () => {
  const screen = await render(<NumberedRows count={3} />, SCREEN_SIZE);

  const frame = await screen.waitFor(selected(1));

  expect(visibleRows(frame)).toEqual(["> row 1", "row 2", "row 3"]);
  expect(frame.text).not.toContain(SCROLL_INDICATOR);
});

test("ignores keys while its scope is not focused", async () => {
  const screen = await render(
    <box flexDirection="row" flexGrow={1}>
      <box flexGrow={1}>
        <NumberedRows count={3} />
      </box>
      <box flexGrow={1}>
        <FocusScope focused={false}>
          <NumberedRows count={3} />
        </FocusScope>
      </box>
    </box>,
    { width: 40, height: 5 },
  );
  await screen.waitFor((frame) => visibleRows(frame)[0] === "> row 1 > row 1");

  screen.press("down");

  const frame = await screen.waitFor((frame) => visibleRows(frame)[1] === "> row 2 row 2");
  expect(visibleRows(frame)).toEqual(["row 1 > row 1", "> row 2 row 2", "row 3 row 3"]);
});

test("shows more rows after the terminal grows", async () => {
  const screen = await render(<NumberedRows count={20} />, SCREEN_SIZE);
  await screen.waitFor(selected(1));

  screen.resize(SCREEN_SIZE.width, 8);

  const frame = await screen.waitFor((frame) => visibleRows(frame).includes("row 8"));
  expect(visibleRows(frame)).toHaveLength(8);
});

test("keeps the rows in place on the frame more rows arrive", async () => {
  const screen = await render(<GrowingRows from={3} to={20} />, SCREEN_SIZE);
  await screen.waitFor(selected(1));
  screen.press("down");
  await screen.waitFor(selected(2));
  screen.press("down");
  await screen.waitFor(selected(3));

  screen.press("g");

  const frame = await screen.waitFor((frame) => visibleRows(frame).includes("row 4"));
  expect(visibleRows(frame)).toEqual(["row 1", "row 2", "> row 3", "row 4", "row 5"]);
});
