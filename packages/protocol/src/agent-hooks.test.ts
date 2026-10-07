import { describe, expect, it } from "vitest";
import { hooksNeedingReview, type AgentHookSummary } from "./agent-hooks.js";

function hook(overrides: Partial<AgentHookSummary>): AgentHookSummary {
  return {
    key: "/home/u/.codex/hooks.json:stop:0:0",
    event: "stop",
    source: "user",
    sourcePath: "/home/u/.codex/hooks.json",
    trustStatus: "trusted",
    enabled: true,
    ...overrides,
  };
}

describe("hooksNeedingReview", () => {
  it("keeps enabled hooks that are new or changed since they were trusted", () => {
    const untrusted = hook({ key: "a", trustStatus: "untrusted" });
    const modified = hook({ key: "b", trustStatus: "modified" });
    expect(hooksNeedingReview([untrusted, modified])).toEqual([untrusted, modified]);
  });

  it("skips trusted, managed, and disabled hooks", () => {
    expect(
      hooksNeedingReview([
        hook({ key: "a", trustStatus: "trusted" }),
        hook({ key: "b", trustStatus: "managed" }),
        hook({ key: "c", trustStatus: "untrusted", enabled: false }),
      ]),
    ).toEqual([]);
  });
});
