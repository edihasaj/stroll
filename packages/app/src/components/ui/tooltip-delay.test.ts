import { describe, expect, it } from "vitest";
import {
  resolveTooltipOpenDelayMs,
  TOOLTIP_OPEN_DELAY_MS,
  TOOLTIP_REOPEN_GRACE_MS,
} from "./tooltip-delay";

describe("resolveTooltipOpenDelayMs", () => {
  it("returns the requested delay when there is no prior close", () => {
    const delay = resolveTooltipOpenDelayMs({
      requestedDelayMs: TOOLTIP_OPEN_DELAY_MS,
      now: 10_000,
      lastCloseAt: null,
    });
    expect(delay).toBe(TOOLTIP_OPEN_DELAY_MS);
  });

  it("returns the requested delay once the grace window has elapsed", () => {
    const delay = resolveTooltipOpenDelayMs({
      requestedDelayMs: TOOLTIP_OPEN_DELAY_MS,
      now: 10_000,
      lastCloseAt: 10_000 - TOOLTIP_REOPEN_GRACE_MS - 1,
    });
    expect(delay).toBe(TOOLTIP_OPEN_DELAY_MS);
  });

  it("opens instantly inside the grace window, moving between adjacent triggers", () => {
    const delay = resolveTooltipOpenDelayMs({
      requestedDelayMs: TOOLTIP_OPEN_DELAY_MS,
      now: 10_000,
      lastCloseAt: 10_000 - TOOLTIP_REOPEN_GRACE_MS,
    });
    expect(delay).toBe(0);
  });

  it("opens instantly at the exact moment of close", () => {
    const delay = resolveTooltipOpenDelayMs({
      requestedDelayMs: TOOLTIP_OPEN_DELAY_MS,
      now: 10_000,
      lastCloseAt: 10_000,
    });
    expect(delay).toBe(0);
  });

  it("respects a caller-supplied delay outside the grace window", () => {
    const delay = resolveTooltipOpenDelayMs({
      requestedDelayMs: 0,
      now: 10_000,
      lastCloseAt: null,
    });
    expect(delay).toBe(0);
  });

  it("never returns a negative delay", () => {
    const delay = resolveTooltipOpenDelayMs({
      requestedDelayMs: -50,
      now: 10_000,
      lastCloseAt: null,
    });
    expect(delay).toBe(0);
  });

  it("honors a custom grace window", () => {
    const delay = resolveTooltipOpenDelayMs({
      requestedDelayMs: TOOLTIP_OPEN_DELAY_MS,
      now: 10_000,
      lastCloseAt: 9_950,
      graceMs: 25,
    });
    expect(delay).toBe(TOOLTIP_OPEN_DELAY_MS);
  });
});
