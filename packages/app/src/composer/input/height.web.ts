import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { TextStyle } from "react-native";
import { useAppReducedMotion } from "@/hooks/use-app-reduced-motion";
import { MOTION_DURATION } from "@/styles/theme";
import type { ComposerHeightResult } from "./height.types";

interface ComposerHeightArgs {
  getText: () => string;
  textareaRef: RefObject<HTMLElement | null>;
  minHeight: number;
  maxHeight: number;
}

const COPIED_STYLES = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontVariant",
  "lineHeight",
  "letterSpacing",
  "wordSpacing",
  "textTransform",
  "textIndent",
  "whiteSpace",
  "wordWrap",
  "overflowWrap",
  "wordBreak",
  "tabSize",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
] as const;

export function useComposerHeight({
  getText,
  textareaRef,
  minHeight,
  maxHeight,
}: ComposerHeightArgs): ComposerHeightResult {
  const [height, setHeight] = useState(minHeight);
  const heightRef = useRef(minHeight);
  const reducedMotion = useAppReducedMotion();
  const paramsRef = useRef({ getText, minHeight, maxHeight });
  paramsRef.current = { getText, minHeight, maxHeight };
  const mirrorRef = useRef<HTMLTextAreaElement | null>(null);

  const setBoundedHeight = useCallback((nextHeight: number) => {
    const { minHeight: currentMin, maxHeight: currentMax } = paramsRef.current;
    const bounded = Math.max(currentMin, Math.min(currentMax, nextHeight));
    if (Math.abs(heightRef.current - bounded) < 1) return;
    heightRef.current = bounded;
    setHeight(bounded);
  }, []);

  const measure = useCallback(
    (text: string) => {
      const mirror = mirrorRef.current;
      const source = textareaRef.current;
      if (!mirror || !source || typeof window === "undefined") return;
      const sourceWidth = source.clientWidth;
      if (sourceWidth <= 0) return;

      const computedStyle = window.getComputedStyle(source);
      for (const property of COPIED_STYLES) {
        mirror.style[property] = computedStyle[property];
      }
      mirror.style.width = `${sourceWidth}px`;
      mirror.value = text.endsWith("\n") ? `${text} ` : text;
      setBoundedHeight(mirror.scrollHeight);
    },
    [setBoundedHeight, textareaRef],
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const mirror = document.createElement("textarea");
    mirror.setAttribute("aria-hidden", "true");
    mirror.setAttribute("tabindex", "-1");
    mirror.readOnly = true;
    mirror.rows = 1;
    Object.assign(mirror.style, {
      position: "absolute",
      top: "0",
      left: "0",
      visibility: "hidden",
      pointerEvents: "none",
      overflow: "hidden",
      border: "0",
      margin: "0",
      resize: "none",
      zIndex: "-1",
      boxSizing: "border-box",
    });
    document.body.appendChild(mirror);
    mirrorRef.current = mirror;
    measure(paramsRef.current.getText());
    return () => {
      mirror.remove();
      mirrorRef.current = null;
    };
  }, [measure]);

  useLayoutEffect(() => {
    measure(getText());
  }, [maxHeight, minHeight, getText, measure]);

  useEffect(() => {
    const source = textareaRef.current;
    if (!source || typeof ResizeObserver === "undefined") return;
    let previousWidth = source.clientWidth;
    const observer = new ResizeObserver(() => {
      const nextWidth = source.clientWidth;
      if (Math.abs(nextWidth - previousWidth) < 1) return;
      previousWidth = nextWidth;
      measure(paramsRef.current.getText());
    });
    observer.observe(source);
    return () => observer.disconnect();
  }, [measure, textareaRef]);

  const onTextChange = useCallback(
    (_previousText: string, nextText: string) => measure(nextText),
    [measure],
  );
  const reset = useCallback(() => setBoundedHeight(minHeight), [minHeight, setBoundedHeight]);
  // The textarea itself (`style`) always snaps to `height` instantly — the caret and text
  // reflow it drives can never lag a frame behind what the user typed. `wrapperStyle` carries
  // the same target height onto the surrounding card so the *visible* card eases into it
  // (docs/design.md §17, docs/ui-gap-gpt.md C1): a plain CSS transition rather than a
  // Reanimated shared value, since the card's height here is a DOM box size RN Web already
  // renders as a CSS `height`, not an entering/exiting surface. `useAppReducedMotion()` still
  // gates it — zero duration collapses it back to the instant behavior this hook always had.
  // `flexShrink: 0` keeps that promise: the textarea's own style shrinks by default, so without
  // it the easing wrapper squeezes the textarea back to the old height for the whole ease and
  // the new line scrolls out of view until the card catches up.
  const style = useMemo(
    () => ({ height, minHeight, maxHeight, flexShrink: 0 }),
    [height, maxHeight, minHeight],
  );
  const wrapperStyle = useMemo<TextStyle>(
    () =>
      ({
        // `height` is already clamped to [minHeight, maxHeight] by `setBoundedHeight`.
        height,
        overflow: "hidden",
        transitionProperty: "height",
        transitionDuration: reducedMotion ? "0ms" : `${MOTION_DURATION.base}ms`,
        transitionTimingFunction: "ease-in-out",
      }) as TextStyle,
    [height, reducedMotion],
  );

  return {
    mode: "measured",
    style,
    wrapperStyle,
    scrollEnabled: height >= maxHeight,
    onTextChange,
    reset,
  };
}
