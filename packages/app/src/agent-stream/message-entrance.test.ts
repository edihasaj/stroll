import { describe, expect, it } from "vitest";
import {
  type AgentEntranceTrackerRef,
  createMessageEntranceTracker,
  getMessageEntranceTracker,
  seedMessageEntranceTracker,
  shouldPlayMessageEntrance,
} from "./message-entrance";

describe("shouldPlayMessageEntrance", () => {
  it("plays entrance the first time an id is checked", () => {
    const tracker = createMessageEntranceTracker();
    expect(shouldPlayMessageEntrance(tracker, "msg-1")).toBe(true);
  });

  it("never plays entrance again for the same id", () => {
    const tracker = createMessageEntranceTracker();
    expect(shouldPlayMessageEntrance(tracker, "msg-1")).toBe(true);
    expect(shouldPlayMessageEntrance(tracker, "msg-1")).toBe(false);
    expect(shouldPlayMessageEntrance(tracker, "msg-1")).toBe(false);
  });

  it("tracks ids independently", () => {
    const tracker = createMessageEntranceTracker();
    expect(shouldPlayMessageEntrance(tracker, "msg-1")).toBe(true);
    expect(shouldPlayMessageEntrance(tracker, "msg-2")).toBe(true);
    expect(shouldPlayMessageEntrance(tracker, "msg-1")).toBe(false);
    expect(shouldPlayMessageEntrance(tracker, "msg-2")).toBe(false);
  });
});

describe("seedMessageEntranceTracker", () => {
  it("marks ids as already seen so they never earn an entrance", () => {
    const tracker = createMessageEntranceTracker();
    seedMessageEntranceTracker(tracker, ["msg-1", "msg-2"]);

    expect(shouldPlayMessageEntrance(tracker, "msg-1")).toBe(false);
    expect(shouldPlayMessageEntrance(tracker, "msg-2")).toBe(false);
  });

  it(
    "this is the gate that keeps an already-open chat from flickering: seeding with every " +
      "item visible at mount means none of them play an entrance on first render",
    () => {
      const tracker = createMessageEntranceTracker();
      const idsVisibleWhenChatOpened = ["history-1", "history-2", "live-head-1"];
      seedMessageEntranceTracker(tracker, idsVisibleWhenChatOpened);

      for (const id of idsVisibleWhenChatOpened) {
        expect(shouldPlayMessageEntrance(tracker, id)).toBe(false);
      }

      // A genuinely new item, arriving after the seed, still earns its entrance.
      expect(shouldPlayMessageEntrance(tracker, "live-head-2")).toBe(true);
    },
  );

  it("does not affect ids outside the seeded set", () => {
    const tracker = createMessageEntranceTracker();
    seedMessageEntranceTracker(tracker, ["msg-1"]);

    expect(shouldPlayMessageEntrance(tracker, "msg-2")).toBe(true);
  });

  it("accepts a Set as well as an array", () => {
    const tracker = createMessageEntranceTracker();
    seedMessageEntranceTracker(tracker, new Set(["msg-1", "msg-2"]));

    expect(shouldPlayMessageEntrance(tracker, "msg-1")).toBe(false);
    expect(shouldPlayMessageEntrance(tracker, "msg-2")).toBe(false);
  });
});

describe("getMessageEntranceTracker", () => {
  it("creates and seeds a fresh tracker the first time an agent is seen", () => {
    const ref: AgentEntranceTrackerRef = { current: null };
    const tracker = getMessageEntranceTracker(ref, "agent-1", ["history-1", "live-1"]);

    expect(shouldPlayMessageEntrance(tracker, "history-1")).toBe(false);
    expect(shouldPlayMessageEntrance(tracker, "live-1")).toBe(false);
    expect(shouldPlayMessageEntrance(tracker, "live-2")).toBe(true);
  });

  it("returns the same tracker across calls for the same agent, without reseeding", () => {
    const ref: AgentEntranceTrackerRef = { current: null };
    const first = getMessageEntranceTracker(ref, "agent-1", ["history-1"]);
    shouldPlayMessageEntrance(first, "live-1"); // marks live-1 as seen on the live tracker

    const second = getMessageEntranceTracker(ref, "agent-1", ["some-other-id-ignored"]);

    expect(second).toBe(first);
    // Re-seeding did not happen: live-1 (marked seen above) stays seen, and the ids passed on
    // this call (which would only matter for a fresh tracker) were never applied.
    expect(shouldPlayMessageEntrance(second, "live-1")).toBe(false);
    expect(shouldPlayMessageEntrance(second, "some-other-id-ignored")).toBe(true);
  });

  it(
    "this is the switch-agent gate: a different agentId gets a fresh tracker seeded with " +
      "that agent's own visible ids, so switching tabs never carries over stale state or " +
      "animates content already on screen for the new agent",
    () => {
      const ref: AgentEntranceTrackerRef = { current: null };
      const trackerForAgent1 = getMessageEntranceTracker(ref, "agent-1", ["a1-history"]);

      const trackerForAgent2 = getMessageEntranceTracker(ref, "agent-2", ["a2-history", "a2-live"]);

      expect(trackerForAgent2).not.toBe(trackerForAgent1);
      expect(shouldPlayMessageEntrance(trackerForAgent2, "a2-history")).toBe(false);
      expect(shouldPlayMessageEntrance(trackerForAgent2, "a2-live")).toBe(false);
      // Switching back to agent-1 creates yet another fresh tracker (the old one for agent-1 was
      // discarded when agent-2's tracker replaced it in the ref) — never a flicker either way,
      // since it reseeds from whatever is visible for agent-1 at that moment.
      const trackerForAgent1Again = getMessageEntranceTracker(ref, "agent-1", ["a1-history"]);
      expect(trackerForAgent1Again).not.toBe(trackerForAgent1);
      expect(shouldPlayMessageEntrance(trackerForAgent1Again, "a1-history")).toBe(false);
    },
  );
});
