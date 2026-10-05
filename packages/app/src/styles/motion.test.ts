// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

async function loadMotionForPlatform(platform: "web" | "ios") {
  vi.resetModules();
  vi.doMock("@/constants/platform", () => ({
    isWeb: platform === "web",
    isNative: platform !== "web",
  }));
  return import("./motion");
}

function countStyleTagsWithId(id: string): number {
  return document.querySelectorAll(`style#${id}`).length;
}

describe("webAppearStyle", () => {
  afterEach(() => {
    vi.doUnmock("@/constants/platform");
    document.getElementById("paseo-motion-appear-keyframes")?.remove();
    document.getElementById("paseo-motion-appear-rise-8-keyframes")?.remove();
  });

  it("returns undefined on native, regardless of reduced motion, and injects no keyframe", async () => {
    const { webAppearStyle } = await loadMotionForPlatform("ios");
    expect(webAppearStyle(false)).toBeUndefined();
    expect(webAppearStyle(true)).toBeUndefined();
    expect(document.getElementById("paseo-motion-appear-keyframes")).toBeNull();
  });

  it("returns undefined on web when reduced motion is on, and injects no keyframe", async () => {
    const { webAppearStyle } = await loadMotionForPlatform("web");
    expect(webAppearStyle(true)).toBeUndefined();
    expect(document.getElementById("paseo-motion-appear-keyframes")).toBeNull();
  });

  it("returns a plain-fade CSS animation style on web and injects its keyframe once", async () => {
    const { webAppearStyle } = await loadMotionForPlatform("web");

    const style = webAppearStyle(false) as Record<string, unknown>;
    expect(style).toMatchObject({
      animationName: "paseo-motion-appear",
      animationDuration: "200ms",
      animationTimingFunction: "linear",
      animationFillMode: "both",
    });

    const injected = document.getElementById("paseo-motion-appear-keyframes");
    expect(injected?.textContent).toContain("@keyframes paseo-motion-appear");
    expect(injected?.textContent).not.toContain("translateY");

    // Calling it again must not append a second <style> tag for the same keyframe.
    webAppearStyle(false);
    expect(countStyleTagsWithId("paseo-motion-appear-keyframes")).toBe(1);
  });

  it("returns a distinct fade+rise animation keyed by riseBy, independent of the plain fade", async () => {
    const { webAppearStyle } = await loadMotionForPlatform("web");

    const plain = webAppearStyle(false) as Record<string, unknown>;
    const risen = webAppearStyle(false, { riseBy: 8 }) as Record<string, unknown>;

    expect(plain.animationName).toBe("paseo-motion-appear");
    expect(risen.animationName).toBe("paseo-motion-appear-rise-8");

    const injected = document.getElementById("paseo-motion-appear-rise-8-keyframes");
    expect(injected?.textContent).toContain("translateY(8px)");
    expect(injected?.textContent).toContain("translateY(0)");

    expect(countStyleTagsWithId("paseo-motion-appear-keyframes")).toBe(1);
    expect(countStyleTagsWithId("paseo-motion-appear-rise-8-keyframes")).toBe(1);
  });
});

describe("webSpinStyle", () => {
  afterEach(() => {
    vi.doUnmock("@/constants/platform");
    document.getElementById("paseo-motion-spin-keyframes")?.remove();
  });

  it("returns undefined on native so Reanimated keeps driving the spin there", async () => {
    const { webSpinStyle } = await loadMotionForPlatform("ios");
    expect(webSpinStyle(false, 900)).toBeUndefined();
    expect(document.getElementById("paseo-motion-spin-keyframes")).toBeNull();
  });

  it("returns undefined on web when reduced motion is on", async () => {
    const { webSpinStyle } = await loadMotionForPlatform("web");
    expect(webSpinStyle(true, 900)).toBeUndefined();
    expect(document.getElementById("paseo-motion-spin-keyframes")).toBeNull();
  });

  it("returns an infinite compositor rotation on web and injects its keyframe once", async () => {
    const { webSpinStyle } = await loadMotionForPlatform("web");

    const style = webSpinStyle(false, 900) as Record<string, unknown>;
    expect(style).toMatchObject({
      animationName: "paseo-motion-spin",
      animationDuration: "900ms",
      animationTimingFunction: "linear",
      animationIterationCount: "infinite",
      willChange: "transform",
    });

    const injected = document.getElementById("paseo-motion-spin-keyframes");
    expect(injected?.textContent).toContain("@keyframes paseo-motion-spin");
    expect(injected?.textContent).toContain("rotate(360deg)");

    webSpinStyle(false, 900);
    expect(countStyleTagsWithId("paseo-motion-spin-keyframes")).toBe(1);
  });
});
