import { onTestFinished } from "bun:test";

import type { CliRenderer } from "@opentui/core";
import { createTestRenderer } from "@opentui/core/testing";
import {
  registerDeadBindingWarnings,
  registerUnresolvedCommandWarnings,
} from "@opentui/keymap/addons";
import { createDefaultOpenTuiKeymap } from "@opentui/keymap/opentui";
import { KeymapProvider } from "@opentui/keymap/react";
import { createRoot, flushSync } from "@opentui/react";
import { StrictMode } from "react";

import { RENDERER_CONFIG } from "#app/tui.tsx";
import { isDefined } from "#utils/is-defined.ts";

import { Frame } from "./frame.ts";
import { type Key, pressKey } from "./key.ts";
import { StyledFrame } from "./styled-frame.ts";

const WAIT_TIMEOUT_MS = 3000;
const WAIT_POLL_INTERVAL_MS = 10;

interface Size {
  width: number;
  height: number;
}

interface SelectionOptions {
  line?: number;
}

export type TestScreen = Awaited<ReturnType<typeof mount>>["screen"];

export async function render(node: React.ReactNode, size: Size) {
  const { screen, unmount } = await mount(node, size);
  onTestFinished(unmount);
  return screen;
}

export async function mount(node: React.ReactNode, size: Size) {
  const setup = await createTestRenderer({ ...RENDERER_CONFIG, ...size, kittyKeyboard: true });
  const { keymap, diagnostics } = createDiagnosedKeymap(setup.renderer);
  const root = createRoot(setup.renderer);
  root.render(
    <StrictMode>
      <KeymapProvider keymap={keymap}>{node}</KeymapProvider>
    </StrictMode>,
  );

  async function waitUntil<T>(
    capture: () => T | undefined | Promise<T | undefined>,
    matches: (captured: T) => boolean,
    expected: string,
  ) {
    const deadline = performance.now() + WAIT_TIMEOUT_MS;
    while (performance.now() < deadline) {
      await setup.renderOnce();
      const captured = await capture();
      if (isDefined(captured) && matches(captured)) {
        await runPendingEffects();
        return captured;
      }
      await Bun.sleep(WAIT_POLL_INTERVAL_MS);
    }
    throw new Error(
      `Waited ${WAIT_TIMEOUT_MS}ms for ${expected}. ` +
        `The last frame was:\n${setup.captureCharFrame()}`,
    );
  }

  function press(key: Key) {
    pressKey(setup.mockInput, key);
  }

  function type(text: string) {
    return setup.mockInput.typeText(text);
  }

  async function captureFrame() {
    await setup.renderOnce();
    await runPendingEffects();
    return new Frame(setup.captureCharFrame());
  }

  async function captureStyles() {
    await setup.renderer.idle();
    return new StyledFrame(setup.captureSpans());
  }

  function waitFor(
    predicate: (frame: Frame) => boolean,
    expected = `a frame matching ${describePredicate(predicate)}`,
  ) {
    return waitUntil(() => new Frame(setup.captureCharFrame()), predicate, expected);
  }

  function waitForText(text: string) {
    return waitFor((frame) => frame.text.includes(text), `text ${JSON.stringify(text)}`);
  }

  async function selection() {
    return (await captureStyles()).selection;
  }

  async function waitForSelection(text: string, { line }: SelectionOptions = {}) {
    const selected = await waitUntil(
      selection,
      (selected) => selected.text.includes(text) && (!isDefined(line) || selected.line === line),
      isDefined(line)
        ? `a selected row containing "${text}" on line ${line}`
        : `a selected row containing "${text}"`,
    );
    return selected.text;
  }

  async function selectRow(text: string) {
    let selected = await waitUntil(selection, () => true, "a selected row");
    while (!selected.text.includes(text)) {
      const target = (await captureStyles()).nearestLineOf(text, selected.line);
      const direction = target < selected.line ? "up" : "down";
      const previous = selected.text;
      press(direction);
      selected = await waitUntil(
        selection,
        (next) => next.text !== previous,
        `the selection to move ${direction} from "${previous}" toward "${text}"`,
      );
    }
    return selected.text;
  }

  async function unmount() {
    try {
      flushSync(() => root.unmount());
    } finally {
      await setup.dispose();
    }
    if (diagnostics.length > 0) {
      throw new Error(`Keymap reported:\n${diagnostics.join("\n")}`);
    }
  }

  const screen = {
    press,
    type,
    mockMouse: setup.mockMouse,
    resize: setup.resize,
    captureFrame,
    captureStyles,
    waitFor,
    waitForText,
    waitForSelection,
    selectRow,
  };
  return { screen, unmount };
}

function describePredicate(predicate: (frame: Frame) => boolean) {
  return predicate.name === "" ? predicate.toString() : predicate.name;
}

function runPendingEffects() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createDiagnosedKeymap(renderer: CliRenderer) {
  const keymap = createDefaultOpenTuiKeymap(renderer);
  registerUnresolvedCommandWarnings(keymap);
  registerDeadBindingWarnings(keymap);

  const diagnostics: string[] = [];
  keymap.on("warning", ({ message }) => diagnostics.push(message));
  keymap.on("error", ({ message }) => diagnostics.push(message));

  return { keymap, diagnostics };
}
