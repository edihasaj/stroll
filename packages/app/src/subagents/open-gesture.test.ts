import { describe, expect, it } from "vitest";
import { isSubagentOpenAsTabClick, readSubagentClickModifiers } from "./open-gesture";
import type { GestureResponderEvent } from "react-native";

describe("isSubagentOpenAsTabClick", () => {
  it("opens a tab on Cmd-click on macOS", () => {
    expect(isSubagentOpenAsTabClick({ metaKey: true, ctrlKey: false }, { isMac: true })).toBe(true);
  });

  it("does not open a tab on plain click on macOS", () => {
    expect(isSubagentOpenAsTabClick({ metaKey: false, ctrlKey: false }, { isMac: true })).toBe(
      false,
    );
  });

  it("ignores Ctrl-click on macOS — Cmd is the platform's modifier", () => {
    expect(isSubagentOpenAsTabClick({ metaKey: false, ctrlKey: true }, { isMac: true })).toBe(
      false,
    );
  });

  it("opens a tab on Ctrl-click outside macOS", () => {
    expect(isSubagentOpenAsTabClick({ metaKey: false, ctrlKey: true }, { isMac: false })).toBe(
      true,
    );
  });

  it("does not open a tab on plain click outside macOS", () => {
    expect(isSubagentOpenAsTabClick({ metaKey: false, ctrlKey: false }, { isMac: false })).toBe(
      false,
    );
  });

  it("ignores Cmd/Meta-click outside macOS — Ctrl is the platform's modifier", () => {
    expect(isSubagentOpenAsTabClick({ metaKey: true, ctrlKey: false }, { isMac: false })).toBe(
      false,
    );
  });
});

function fakePressEvent(nativeEvent: Record<string, unknown>): GestureResponderEvent {
  return { nativeEvent } as unknown as GestureResponderEvent;
}

describe("readSubagentClickModifiers", () => {
  it("reads metaKey and ctrlKey off the forwarded DOM event", () => {
    expect(readSubagentClickModifiers(fakePressEvent({ metaKey: true, ctrlKey: false }))).toEqual({
      metaKey: true,
      ctrlKey: false,
    });
    expect(readSubagentClickModifiers(fakePressEvent({ metaKey: false, ctrlKey: true }))).toEqual({
      metaKey: false,
      ctrlKey: true,
    });
  });

  it("defaults to no modifiers on a native touch event with neither field", () => {
    expect(readSubagentClickModifiers(fakePressEvent({}))).toEqual({
      metaKey: false,
      ctrlKey: false,
    });
  });
});
