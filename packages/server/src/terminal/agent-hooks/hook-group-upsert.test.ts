import { describe, expect, it } from "vitest";
import { upsertMarkedHookGroup } from "./hook-group-upsert.js";

const PASEO_HOOK = { type: "command", command: "paseo hooks codex Stop", timeout: 10 };
const DESIRED = { matcher: "", hooks: [PASEO_HOOK] as [Record<string, unknown>] };

function isMarked(hook: Record<string, unknown>): boolean {
  return typeof hook.command === "string" && hook.command.includes("hooks codex");
}

function group(command: string) {
  return { matcher: "", hooks: [{ type: "command", command }] };
}

describe("upsertMarkedHookGroup", () => {
  it("appends Paseo's group once when the event has none", () => {
    expect(upsertMarkedHookGroup({ entries: [group("a")], desired: DESIRED, isMarked })).toEqual([
      group("a"),
      DESIRED,
    ]);
    expect(upsertMarkedHookGroup({ entries: undefined, desired: DESIRED, isMarked })).toEqual([
      DESIRED,
    ]);
  });

  it("leaves the order alone when Paseo's group is already in the middle", () => {
    const entries = [group("a"), DESIRED, group("b")];

    expect(upsertMarkedHookGroup({ entries, desired: DESIRED, isMarked })).toEqual(entries);
  });

  it("replaces only Paseo's hook inside a group shared with another tool", () => {
    const shared = {
      matcher: "Bash",
      hooks: [
        { type: "command", command: "x" },
        { type: "command", command: "old hooks codex Stop" },
      ],
    };

    expect(upsertMarkedHookGroup({ entries: [shared], desired: DESIRED, isMarked })).toEqual([
      { matcher: "Bash", hooks: [{ type: "command", command: "x" }, PASEO_HOOK] },
    ]);
  });

  it("drops extra Paseo copies left by older versions, keeping the first position", () => {
    const entries = [
      group("a"),
      group("old hooks codex Stop"),
      group("b"),
      group("older hooks codex Stop"),
    ];

    expect(upsertMarkedHookGroup({ entries, desired: DESIRED, isMarked })).toEqual([
      group("a"),
      DESIRED,
      group("b"),
    ]);
  });

  it("keeps entries it does not understand where they are", () => {
    const entries = ["not-a-group", group("old hooks codex Stop")];

    expect(upsertMarkedHookGroup({ entries, desired: DESIRED, isMarked })).toEqual([
      "not-a-group",
      DESIRED,
    ]);
  });
});
