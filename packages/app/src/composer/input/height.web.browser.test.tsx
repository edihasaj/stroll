import React, { act, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MOTION_DURATION } from "@/styles/theme";
import type { ComposerHeightResult } from "./height.types";

// The height easing (C1, docs/design.md §17) reads reduced motion through the app's one seam —
// stub it so the "reduced motion collapses the transition to 0ms" case doesn't depend on the
// real OS preference in whatever environment CI runs in.
const useAppReducedMotionMock = vi.fn(() => false);
vi.mock("@/hooks/use-app-reduced-motion", () => ({
  useAppReducedMotion: () => useAppReducedMotionMock(),
}));

import { useComposerHeight } from "./height.web";

const MIN_HEIGHT = 46;
const MAX_HEIGHT = 160;

// Predictable line wrapping: fixed width + monospace + known line-height, so a fixed number of
// `\n`-separated words maps to a fixed number of rendered lines.
const HARNESS_TEXTAREA_STYLE = {
  width: "240px",
  fontFamily: "monospace",
  fontSize: "14px",
  lineHeight: "20px",
  padding: "0px",
  border: "0",
  boxSizing: "border-box" as const,
};

interface Mounted {
  root: Root;
  container: HTMLDivElement;
}

const mounted: Mounted[] = [];
let latestResult: ComposerHeightResult | null = null;

function Harness({ value }: { value: string }) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  latestResult = useComposerHeight({
    getText: () => value,
    textareaRef,
    minHeight: MIN_HEIGHT,
    maxHeight: MAX_HEIGHT,
  });
  return <textarea ref={textareaRef} readOnly value={value} style={HARNESS_TEXTAREA_STYLE} />;
}

function mount(value: string): Mounted {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<Harness value={value} />));
  const entry = { root, container };
  mounted.push(entry);
  return entry;
}

function rerender(entry: Mounted, value: string): void {
  act(() => entry.root.render(<Harness value={value} />));
}

function measuredResult(): Extract<ComposerHeightResult, { mode: "measured" }> {
  if (!latestResult || latestResult.mode !== "measured") {
    throw new Error("useComposerHeight did not return a measured result");
  }
  return latestResult;
}

// `wrapperStyle` carries RN Web-only CSS transition properties that `TextStyle` doesn't type —
// same cast `height.web.ts` itself uses when building the object.
interface WrapperCssStyle {
  transitionProperty: string;
  transitionDuration: string;
}

function wrapperCssStyle(
  result: Extract<ComposerHeightResult, { mode: "measured" }>,
): WrapperCssStyle {
  return result.wrapperStyle as unknown as WrapperCssStyle;
}

afterEach(() => {
  useAppReducedMotionMock.mockReturnValue(false);
  latestResult = null;
  for (const entry of mounted.splice(0)) {
    act(() => entry.root.unmount());
    entry.container.remove();
  }
});

describe("useComposerHeight (web)", () => {
  it("snaps the textarea to the bounded height on mount", () => {
    mount("hello");
    const result = measuredResult();
    expect(result.style.height).toBe(MIN_HEIGHT);
  });

  it("grows the wrapper to the same target height as the textarea when content wraps to more lines", () => {
    const entry = mount("hello");
    const before = measuredResult();
    expect(before.style.height).toBe(MIN_HEIGHT);

    rerender(entry, "hello\nworld\nworld\nworld\nworld");
    const after = measuredResult();

    expect(after.style.height).toBeGreaterThan(MIN_HEIGHT);
    // The textarea and its wrapper always target the same height — only the wrapper eases into
    // it. See the module comment on `wrapperStyle` in height.web.ts.
    expect(after.wrapperStyle?.height).toBe(after.style.height);
    // The easing wrapper must not squeeze the textarea back to its old height.
    expect(after.style.flexShrink).toBe(0);
  });

  it("does not touch height when the new text measures to the same bounded height (the no-jank gate)", () => {
    const entry = mount("hello\nworld\nworld\nworld\nworld");
    const grown = measuredResult();
    expect(grown.style.height).toBeGreaterThan(MIN_HEIGHT);

    // Same length, same wrapped line count, different characters — scrollHeight rounds to the
    // same bounded value, so `setBoundedHeight`'s `Math.abs(...) < 1` guard must hold and no
    // update (hence no card-easing transition) fires on every keystroke that doesn't change the
    // number of visible lines.
    rerender(entry, "hello\nearth\nearth\nearth\nearth");
    const unchanged = measuredResult();

    expect(unchanged.style.height).toBe(grown.style.height);
    expect(unchanged.wrapperStyle?.height).toBe(grown.style.height);
  });

  it("eases the wrapper height over duration.base by default", () => {
    mount("hello");
    const result = measuredResult();
    expect(wrapperCssStyle(result).transitionProperty).toBe("height");
    expect(wrapperCssStyle(result).transitionDuration).toBe(`${MOTION_DURATION.base}ms`);
  });

  it("collapses the transition to 0ms when reduced motion is on", () => {
    useAppReducedMotionMock.mockReturnValue(true);
    mount("hello");
    const result = measuredResult();
    expect(wrapperCssStyle(result).transitionDuration).toBe("0ms");
  });
});
