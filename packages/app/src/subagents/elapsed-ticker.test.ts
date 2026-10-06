import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isElapsedTickerRunning, subscribeToElapsedTick } from "./elapsed-ticker";

describe("subscribeToElapsedTick", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-16T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("runs no timer until something subscribes", () => {
    expect(isElapsedTickerRunning()).toBe(false);
  });

  it("ticks a subscriber once a second", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeToElapsedTick(listener);

    vi.advanceTimersByTime(1000);
    expect(listener).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(listener).toHaveBeenCalledTimes(2);

    unsubscribe();
  });

  it("shares one timer across every subscriber", () => {
    const first = vi.fn();
    const second = vi.fn();
    const unsubFirst = subscribeToElapsedTick(first);
    const unsubSecond = subscribeToElapsedTick(second);

    // A dozen running rows must not mean a dozen timers.
    expect(isElapsedTickerRunning()).toBe(true);

    vi.advanceTimersByTime(1000);
    expect(first).toHaveBeenCalledTimes(1);
    expect(second).toHaveBeenCalledTimes(1);

    unsubFirst();
    unsubSecond();
  });

  it("stops the timer when the last subscriber leaves", () => {
    const unsubFirst = subscribeToElapsedTick(vi.fn());
    const unsubSecond = subscribeToElapsedTick(vi.fn());

    unsubFirst();
    expect(isElapsedTickerRunning()).toBe(true);

    unsubSecond();
    expect(isElapsedTickerRunning()).toBe(false);
  });

  it("survives a listener unsubscribing during its own tick", () => {
    const survivor = vi.fn();
    let unsubSelf = () => {};
    const quitter = vi.fn(() => unsubSelf());

    unsubSelf = subscribeToElapsedTick(quitter);
    const unsubSurvivor = subscribeToElapsedTick(survivor);

    expect(() => vi.advanceTimersByTime(1000)).not.toThrow();
    expect(survivor).toHaveBeenCalledTimes(1);

    vi.advanceTimersByTime(1000);
    expect(quitter).toHaveBeenCalledTimes(1);
    expect(survivor).toHaveBeenCalledTimes(2);

    unsubSurvivor();
  });

  it("restarts cleanly after every subscriber has left once", () => {
    const unsub1 = subscribeToElapsedTick(vi.fn());
    unsub1();
    expect(isElapsedTickerRunning()).toBe(false);

    const listener = vi.fn();
    const unsub2 = subscribeToElapsedTick(listener);
    vi.advanceTimersByTime(1000);
    expect(listener).toHaveBeenCalledTimes(1);

    unsub2();
  });
});
