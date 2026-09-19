// @vitest-environment jsdom

import { renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const useReducedMotionMock = vi.fn();

vi.mock("react-native-reanimated", () => ({
  useReducedMotion: () => useReducedMotionMock(),
}));

import { useAppReducedMotion, withMotion } from "./use-app-reduced-motion";

describe("useAppReducedMotion", () => {
  it("mirrors Reanimated's useReducedMotion() when the OS preference is on", () => {
    useReducedMotionMock.mockReturnValue(true);
    const { result } = renderHook(() => useAppReducedMotion());
    expect(result.current).toBe(true);
  });

  it("mirrors Reanimated's useReducedMotion() when the OS preference is off", () => {
    useReducedMotionMock.mockReturnValue(false);
    const { result } = renderHook(() => useAppReducedMotion());
    expect(result.current).toBe(false);
  });
});

describe("withMotion", () => {
  it("drops the animation when reduced motion is on", () => {
    expect(withMotion(true, "entering-animation")).toBeUndefined();
  });

  it("passes the animation through unchanged when reduced motion is off", () => {
    expect(withMotion(false, "entering-animation")).toBe("entering-animation");
  });
});
