import { describe, expect, it } from "vitest";
import type { Agent } from "@/stores/session-store";
import type { WorkspaceTab } from "@/workspace-tabs/model";
import { getAgentTabsNeedingOpenLabel, getSubagentsLeavingTabs } from "./open-tab-labels";

const label = "paseo.open-agent-tab.client-1";

function tab(agentId: string, createdAt: number): WorkspaceTab {
  return { tabId: `agent_${agentId}`, target: { kind: "agent", agentId }, createdAt };
}

function agent(input: {
  id: string;
  parentAgentId?: string | null;
  open?: boolean;
  archivedAt?: Date;
}): Agent {
  return {
    id: input.id,
    parentAgentId: input.parentAgentId ?? null,
    archivedAt: input.archivedAt ?? null,
    labels: input.open ? { [label]: "true" } : {},
  } as Agent;
}

describe("getAgentTabsNeedingOpenLabel", () => {
  it("marks every present parented tab, regardless of tab order or focus", () => {
    const agents = new Map([
      ["background-child", agent({ id: "background-child", parentAgentId: "parent" })],
      ["focused-child", agent({ id: "focused-child", parentAgentId: "parent" })],
      ["root", agent({ id: "root" })],
    ]);

    expect(
      getAgentTabsNeedingOpenLabel({
        tabs: [tab("background-child", 1), tab("root", 2), tab("focused-child", 3)],
        getAgent: (agentId) => agents.get(agentId),
        label,
        pendingAgentIds: new Set(),
      }),
    ).toEqual(["background-child", "focused-child"]);
  });

  it("skips tabs already marked or currently being marked", () => {
    const agents = new Map([
      ["marked", agent({ id: "marked", parentAgentId: "parent", open: true })],
      ["pending", agent({ id: "pending", parentAgentId: "parent" })],
    ]);

    expect(
      getAgentTabsNeedingOpenLabel({
        tabs: [tab("marked", 1), tab("pending", 2)],
        getAgent: (agentId) => agents.get(agentId),
        label,
        pendingAgentIds: new Set(["pending"]),
      }),
    ).toEqual([]);
  });
});

describe("getSubagentsLeavingTabs", () => {
  const agents = new Map([
    ["child", agent({ id: "child", parentAgentId: "parent", open: true })],
    ["other-child", agent({ id: "other-child", parentAgentId: "parent", open: true })],
    ["unmarked-child", agent({ id: "unmarked-child", parentAgentId: "parent" })],
    [
      "archived-child",
      agent({ id: "archived-child", parentAgentId: "parent", open: true, archivedAt: new Date(1) }),
    ],
    ["root", agent({ id: "root", open: true })],
  ]);
  const getAgent = (agentId: string) => agents.get(agentId);

  it("returns marked subagents whose tab is gone", () => {
    expect(
      getSubagentsLeavingTabs({
        previousAgentIds: new Set(["child", "other-child", "root"]),
        openAgentIds: new Set(["other-child"]),
        getAgent,
        label,
      }),
    ).toEqual(["child"]);
  });

  it("ignores roots, unmarked subagents, archived subagents, and agents the client no longer has", () => {
    expect(
      getSubagentsLeavingTabs({
        previousAgentIds: new Set(["root", "unmarked-child", "archived-child", "gone"]),
        openAgentIds: new Set(),
        getAgent,
        label,
      }),
    ).toEqual([]);
  });

  it("keeps a subagent that is still open", () => {
    expect(
      getSubagentsLeavingTabs({
        previousAgentIds: new Set(["child"]),
        openAgentIds: new Set(["child"]),
        getAgent,
        label,
      }),
    ).toEqual([]);
  });
});
