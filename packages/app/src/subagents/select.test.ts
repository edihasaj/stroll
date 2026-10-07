import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { afterEach, describe, expect, it } from "vitest";
import {
  PARENT_COMPUTER_AGENT_LABEL,
  PARENT_COMPUTER_LABEL,
} from "@getpaseo/protocol/agent-labels";
import {
  buildSubagentTree,
  findAgentHostServerId,
  selectProviderSubagentsForParent,
  selectSubagentsForParent,
  type PaseoSubagentRow,
} from "./select";
import { useProviderSubagentStore } from "./provider-store";
import { useSessionStore, type Agent } from "@/stores/session-store";

const SERVER_ID = "server-1";
const REMOTE_SERVER_ID = "server-2";
const AGENT_TIMESTAMP = new Date("2026-03-08T10:00:00.000Z");
const EMPTY_PENDING_ARCHIVE_IDS = new Set<string>();

const AGENT_DEFAULTS: Agent = {
  serverId: SERVER_ID,
  id: "agent",
  provider: "codex",
  status: "idle",
  turn: { phase: "idle", cancellationRequestId: null },
  lastTurn: null,
  createdAt: AGENT_TIMESTAMP,
  updatedAt: AGENT_TIMESTAMP,
  lastUserMessageAt: null,
  lastActivityAt: AGENT_TIMESTAMP,
  capabilities: {
    supportsStreaming: true,
    supportsSessionPersistence: true,
    supportsDynamicModes: true,
    supportsMcpServers: true,
    supportsReasoningStream: true,
    supportsToolInvocations: true,
  },
  currentModeId: null,
  availableModes: [],
  pendingPermissions: [],
  persistence: null,
  runtimeInfo: undefined,
  lastUsage: undefined,
  lastError: null,
  title: "Agent",
  cwd: "/tmp/project",
  model: null,
  features: undefined,
  thinkingOptionId: undefined,
  requiresAttention: false,
  attentionReason: null,
  attentionTimestamp: null,
  archivedAt: null,
  parentAgentId: null,
  labels: {},
  projectPlacement: null,
};

function makeAgent(input: Partial<Agent> & Pick<Agent, "id">): Agent {
  return { ...AGENT_DEFAULTS, ...input };
}

function setAgentsForServer(serverId: string, agents: Agent[]): void {
  useSessionStore.getState().initializeSession(serverId, null as unknown as DaemonClient);
  useSessionStore.getState().setAgents(serverId, new Map(agents.map((agent) => [agent.id, agent])));
}

function setAgents(agents: Agent[]): void {
  setAgentsForServer(SERVER_ID, agents);
}

/** An agent spawned on `REMOTE_SERVER_ID` via `create_agent` `computer` (docs/peers.md) — carries
 * the cross-host parent labels instead of `parentAgentId`, which the peer has no record of. */
function remoteChild(
  input: Partial<Agent> & Pick<Agent, "id">,
  parentServerId: string,
  parentAgentId: string,
): Agent {
  return makeAgent({
    serverId: REMOTE_SERVER_ID,
    ...input,
    labels: {
      [PARENT_COMPUTER_LABEL]: parentServerId,
      [PARENT_COMPUTER_AGENT_LABEL]: parentAgentId,
    },
  });
}

afterEach(() => {
  useSessionStore.getState().clearSession(SERVER_ID);
  useSessionStore.getState().clearSession(REMOTE_SERVER_ID);
  useProviderSubagentStore.setState({
    descriptors: new Map(),
    timelines: new Map(),
    hiddenFromTrack: new Set(),
  });
});

describe("selectSubagentsForParent", () => {
  it("hides cached provider children when the host does not support them", () => {
    useProviderSubagentStore.getState().applyUpdate(SERVER_ID, {
      kind: "upsert",
      subagent: {
        id: "provider-child",
        parentAgentId: "parent-a",
        provider: "codex",
        title: "Provider child",
        description: null,
        subtitle: "Codex worker · 4.2k tokens",
        status: "completed",
        createdAt: "2026-03-08T10:01:00.000Z",
        updatedAt: "2026-03-08T10:02:00.000Z",
        toolCallId: "call-1",
      },
    });
    const params = { serverId: SERVER_ID, parentAgentId: "parent-a" };

    expect(
      selectProviderSubagentsForParent(useProviderSubagentStore.getState(), params, false),
    ).toEqual([]);
    expect(
      selectProviderSubagentsForParent(useProviderSubagentStore.getState(), params, true).map(
        (row) => row.id,
      ),
    ).toEqual(["provider-child"]);
    expect(
      selectProviderSubagentsForParent(useProviderSubagentStore.getState(), params, true)[0]
        ?.subtitle,
    ).toBe("Codex worker · 4.2k tokens");
  });

  it("hides locally dismissed provider children while retaining their descriptor", () => {
    const store = useProviderSubagentStore.getState();
    store.applyUpdate(SERVER_ID, {
      kind: "upsert",
      subagent: {
        id: "provider-child",
        parentAgentId: "parent-a",
        provider: "codex",
        title: "Provider child",
        description: null,
        status: "completed",
        createdAt: "2026-03-08T10:01:00.000Z",
        updatedAt: "2026-03-08T10:02:00.000Z",
        toolCallId: "call-1",
      },
    });
    store.hideFromTrack(SERVER_ID, "parent-a", ["provider-child"]);

    expect(
      selectProviderSubagentsForParent(
        useProviderSubagentStore.getState(),
        { serverId: SERVER_ID, parentAgentId: "parent-a" },
        true,
      ),
    ).toEqual([]);
    expect(useProviderSubagentStore.getState().descriptors.size).toBe(1);
  });

  it("places nested provider children only beneath their direct provider parent", () => {
    const store = useProviderSubagentStore.getState();
    const base = {
      parentAgentId: "parent-a",
      provider: "claude" as const,
      title: "general-purpose",
      subtitle: null,
      status: "running" as const,
      createdAt: "2026-09-04T10:00:00.000Z",
      updatedAt: "2026-09-04T10:00:00.000Z",
      toolCallId: null,
    };
    store.applyUpdate(SERVER_ID, {
      kind: "upsert",
      subagent: { ...base, id: "direct", description: "Direct", parentSubagentId: null },
    });
    store.applyUpdate(SERVER_ID, {
      kind: "upsert",
      subagent: {
        ...base,
        id: "nested",
        description: "Nested",
        parentSubagentId: "direct",
      },
    });

    expect(
      selectProviderSubagentsForParent(
        useProviderSubagentStore.getState(),
        { serverId: SERVER_ID, parentAgentId: "parent-a" },
        true,
        true,
      ).map((row) => row.id),
    ).toEqual(["direct"]);
    expect(
      selectProviderSubagentsForParent(
        useProviderSubagentStore.getState(),
        {
          serverId: SERVER_ID,
          parentAgentId: "parent-a",
          providerParentSubagentId: "direct",
        },
        true,
        true,
      ).map((row) => row.id),
    ).toEqual(["nested"]);
  });

  it("returns only non-archived children for the requested parent", () => {
    setAgents([
      makeAgent({ id: "parent-a" }),
      makeAgent({ id: "child-a", parentAgentId: "parent-a" }),
      makeAgent({
        id: "archived-child",
        parentAgentId: "parent-a",
        archivedAt: new Date("2026-03-08T12:00:00.000Z"),
      }),
    ]);

    const rows = selectSubagentsForParent(
      useSessionStore.getState(),
      {
        serverId: SERVER_ID,
        parentAgentId: "parent-a",
      },
      EMPTY_PENDING_ARCHIVE_IDS,
    );

    expect(rows.map((row) => row.id)).toEqual(["child-a"]);
  });

  it("excludes siblings, unrelated agents, and grandchildren", () => {
    setAgents([
      makeAgent({ id: "parent-a" }),
      makeAgent({ id: "parent-b" }),
      makeAgent({ id: "child-a", parentAgentId: "parent-a" }),
      makeAgent({ id: "sibling-b", parentAgentId: "parent-b" }),
      makeAgent({ id: "grandchild-a", parentAgentId: "child-a" }),
      makeAgent({ id: "unrelated" }),
    ]);

    const rows = selectSubagentsForParent(
      useSessionStore.getState(),
      {
        serverId: SERVER_ID,
        parentAgentId: "parent-a",
      },
      EMPTY_PENDING_ARCHIVE_IDS,
    );

    expect(rows.map((row) => row.id)).toEqual(["child-a"]);
  });

  it("shows only direct children for each parent", () => {
    setAgents([
      makeAgent({ id: "parent" }),
      makeAgent({ id: "child", parentAgentId: "parent" }),
      makeAgent({ id: "grandchild", parentAgentId: "child" }),
    ]);

    const parentRows = selectSubagentsForParent(
      useSessionStore.getState(),
      {
        serverId: SERVER_ID,
        parentAgentId: "parent",
      },
      EMPTY_PENDING_ARCHIVE_IDS,
    );
    const childRows = selectSubagentsForParent(
      useSessionStore.getState(),
      {
        serverId: SERVER_ID,
        parentAgentId: "child",
      },
      EMPTY_PENDING_ARCHIVE_IDS,
    );

    expect(parentRows.map((row) => row.id)).toEqual(["child"]);
    expect(childRows.map((row) => row.id)).toEqual(["grandchild"]);
  });

  it("projects managed descendants recursively with stable depth and keys", () => {
    setAgents([
      makeAgent({ id: "parent" }),
      makeAgent({ id: "child", parentAgentId: "parent" }),
      makeAgent({ id: "grandchild", parentAgentId: "child" }),
    ]);

    const tree = buildSubagentTree(
      useSessionStore.getState(),
      useProviderSubagentStore.getState(),
      { serverId: SERVER_ID, parentAgentId: "parent" },
      EMPTY_PENDING_ARCHIVE_IDS,
      true,
    );

    expect(tree.map((node) => ({ key: node.key, depth: node.depth, id: node.row.id }))).toEqual([
      { key: "agent:child", depth: 0, id: "child" },
    ]);
    expect(
      tree[0]?.children.map((node) => ({ key: node.key, depth: node.depth, id: node.row.id })),
    ).toEqual([{ key: "agent:grandchild", depth: 1, id: "grandchild" }]);
  });

  it("nests provider descendants only when their adapter supplies ancestry", () => {
    setAgents([makeAgent({ id: "parent" })]);
    useProviderSubagentStore.getState().applyUpdate(SERVER_ID, {
      kind: "upsert",
      subagent: {
        id: "provider-root",
        parentAgentId: "parent",
        provider: "codex",
        title: "Root child",
        description: null,
        status: "running",
        createdAt: "2026-03-08T10:01:00.000Z",
        updatedAt: "2026-03-08T10:01:00.000Z",
        toolCallId: "call-root",
      },
    });
    useProviderSubagentStore.getState().applyUpdate(SERVER_ID, {
      kind: "upsert",
      subagent: {
        id: "provider-nested",
        parentAgentId: "parent",
        parentSubagentId: "provider-root",
        provider: "codex",
        title: "Nested child",
        description: null,
        status: "running",
        createdAt: "2026-03-08T10:02:00.000Z",
        updatedAt: "2026-03-08T10:02:00.000Z",
        toolCallId: "call-nested",
      },
    });

    const tree = buildSubagentTree(
      useSessionStore.getState(),
      useProviderSubagentStore.getState(),
      { serverId: SERVER_ID, parentAgentId: "parent" },
      EMPTY_PENDING_ARCHIVE_IDS,
      true,
    );

    expect(tree.map((node) => node.row.id)).toEqual(["provider-root"]);
    expect(tree[0]?.children.map((node) => node.row.id)).toEqual(["provider-nested"]);
  });

  it("sorts by createdAt ascending", () => {
    setAgents([
      makeAgent({ id: "parent" }),
      makeAgent({
        id: "third",
        parentAgentId: "parent",
        createdAt: new Date("2026-03-08T10:03:00.000Z"),
      }),
      makeAgent({
        id: "first",
        parentAgentId: "parent",
        createdAt: new Date("2026-03-08T10:01:00.000Z"),
      }),
      makeAgent({
        id: "second",
        parentAgentId: "parent",
        createdAt: new Date("2026-03-08T10:02:00.000Z"),
      }),
    ]);

    const rows = selectSubagentsForParent(
      useSessionStore.getState(),
      {
        serverId: SERVER_ID,
        parentAgentId: "parent",
      },
      EMPTY_PENDING_ARCHIVE_IDS,
    );

    expect(rows.map((row) => row.id)).toEqual(["first", "second", "third"]);
  });

  it("maps only row-rendered fields and does not expose onOpen", () => {
    const createdAt = new Date("2026-03-08T10:01:00.000Z");
    setAgents([
      makeAgent({ id: "parent" }),
      makeAgent({
        id: "child",
        parentAgentId: "parent",
        provider: "claude",
        title: "Review child",
        status: "running",
        requiresAttention: true,
        createdAt,
        model: "should-not-leak",
        cwd: "/private/project",
      }),
    ]);

    const rows = selectSubagentsForParent(
      useSessionStore.getState(),
      {
        serverId: SERVER_ID,
        parentAgentId: "parent",
      },
      EMPTY_PENDING_ARCHIVE_IDS,
    );

    expect(rows).toEqual([
      {
        kind: "paseo",
        id: "child",
        hostServerId: SERVER_ID,
        provider: "claude",
        title: "Review child",
        description: null,
        subtitle: null,
        status: "running",
        turn: { phase: "idle", cancellationRequestId: null },
        requiresAttention: true,
        createdAt,
        lastTurn: null,
      },
    ]);
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual([
      "createdAt",
      "description",
      "hostServerId",
      "id",
      "kind",
      "lastTurn",
      "provider",
      "requiresAttention",
      "status",
      "subtitle",
      "title",
      "turn",
    ]);
    expect(rows[0]).not.toHaveProperty("onOpen");
    expect(rows[0]).not.toHaveProperty("model");
    expect(rows[0]).not.toHaveProperty("cwd");
  });

  it("does not flag a finished child that is merely unread as needing attention", () => {
    setAgents([
      makeAgent({ id: "parent" }),
      makeAgent({
        id: "finished",
        parentAgentId: "parent",
        status: "idle",
        requiresAttention: true,
        attentionReason: "finished",
      }),
      makeAgent({
        id: "blocked",
        parentAgentId: "parent",
        status: "running",
        requiresAttention: true,
        attentionReason: "permission",
      }),
    ]);

    const rows = selectSubagentsForParent(
      useSessionStore.getState(),
      { serverId: SERVER_ID, parentAgentId: "parent" },
      EMPTY_PENDING_ARCHIVE_IDS,
    );

    expect(rows.map((row) => [row.id, row.requiresAttention])).toEqual([
      ["finished", false],
      ["blocked", true],
    ]);
  });

  it("carries the agent's last completed turn onto the row instead of updatedAt", () => {
    const lastTurn = {
      startedAt: new Date("2026-03-08T10:00:00.000Z"),
      endedAt: new Date("2026-03-08T10:00:10.000Z"),
    };
    setAgents([
      makeAgent({ id: "parent" }),
      makeAgent({ id: "child", parentAgentId: "parent", lastTurn }),
    ]);

    const rows = selectSubagentsForParent(
      useSessionStore.getState(),
      { serverId: SERVER_ID, parentAgentId: "parent" },
      EMPTY_PENDING_ARCHIVE_IDS,
    );

    expect(rows[0]).toMatchObject({ lastTurn });
  });

  it("reports no last turn when the agent never recorded one", () => {
    setAgents([makeAgent({ id: "parent" }), makeAgent({ id: "child", parentAgentId: "parent" })]);

    const rows = selectSubagentsForParent(
      useSessionStore.getState(),
      { serverId: SERVER_ID, parentAgentId: "parent" },
      EMPTY_PENDING_ARCHIVE_IDS,
    );

    expect(rows[0]).toMatchObject({ lastTurn: null });
  });

  it("moves a child when parentAgentId changes", () => {
    const child = makeAgent({ id: "child", parentAgentId: "parent-a" });
    setAgents([makeAgent({ id: "parent-a" }), makeAgent({ id: "parent-b" }), child]);

    expect(
      selectSubagentsForParent(
        useSessionStore.getState(),
        {
          serverId: SERVER_ID,
          parentAgentId: "parent-a",
        },
        EMPTY_PENDING_ARCHIVE_IDS,
      ).map((row) => row.id),
    ).toEqual(["child"]);
    expect(
      selectSubagentsForParent(
        useSessionStore.getState(),
        {
          serverId: SERVER_ID,
          parentAgentId: "parent-b",
        },
        EMPTY_PENDING_ARCHIVE_IDS,
      ).map((row) => row.id),
    ).toEqual([]);

    setAgents([
      makeAgent({ id: "parent-a" }),
      makeAgent({ id: "parent-b" }),
      { ...child, parentAgentId: "parent-b" },
    ]);

    expect(
      selectSubagentsForParent(
        useSessionStore.getState(),
        {
          serverId: SERVER_ID,
          parentAgentId: "parent-a",
        },
        EMPTY_PENDING_ARCHIVE_IDS,
      ).map((row) => row.id),
    ).toEqual([]);
    expect(
      selectSubagentsForParent(
        useSessionStore.getState(),
        {
          serverId: SERVER_ID,
          parentAgentId: "parent-b",
        },
        EMPTY_PENDING_ARCHIVE_IDS,
      ).map((row) => row.id),
    ).toEqual(["child"]);
  });

  it("excludes children whose archive is pending", () => {
    setAgents([
      makeAgent({ id: "parent" }),
      makeAgent({ id: "child-a", parentAgentId: "parent" }),
      makeAgent({ id: "child-b", parentAgentId: "parent" }),
    ]);

    const rows = selectSubagentsForParent(
      useSessionStore.getState(),
      {
        serverId: SERVER_ID,
        parentAgentId: "parent",
      },
      new Set(["child-b"]),
    );

    expect(rows.map((row) => row.id)).toEqual(["child-a"]);
  });

  it("returns the shared empty array when pending archive hides the last child", () => {
    setAgents([makeAgent({ id: "parent" }), makeAgent({ id: "child", parentAgentId: "parent" })]);

    const rows = selectSubagentsForParent(
      useSessionStore.getState(),
      {
        serverId: SERVER_ID,
        parentAgentId: "parent",
      },
      new Set(["child"]),
    );

    expect(rows).toEqual([]);
    expect(rows).toBe(
      selectSubagentsForParent(
        useSessionStore.getState(),
        {
          serverId: SERVER_ID,
          parentAgentId: "missing-parent",
        },
        EMPTY_PENDING_ARCHIVE_IDS,
      ),
    );
  });
});

describe("cross-host subagent selection", () => {
  it("includes a managed agent on another connected host whose labels match the parent", () => {
    setAgents([makeAgent({ id: "parent-a" })]);
    setAgentsForServer(REMOTE_SERVER_ID, [
      remoteChild({ id: "remote-child" }, SERVER_ID, "parent-a"),
    ]);

    const rows = selectSubagentsForParent(
      useSessionStore.getState(),
      { serverId: SERVER_ID, parentAgentId: "parent-a" },
      EMPTY_PENDING_ARCHIVE_IDS,
    );

    expect(rows.map((row) => ({ id: row.id, hostServerId: row.hostServerId }))).toEqual([
      { id: "remote-child", hostServerId: REMOTE_SERVER_ID },
    ]);
  });

  it("excludes an agent on another host whose parent-computer label names a different parent serverId", () => {
    setAgents([makeAgent({ id: "parent-a" })]);
    setAgentsForServer(REMOTE_SERVER_ID, [
      remoteChild({ id: "remote-child" }, "some-other-server", "parent-a"),
    ]);

    const rows = selectSubagentsForParent(
      useSessionStore.getState(),
      { serverId: SERVER_ID, parentAgentId: "parent-a" },
      EMPTY_PENDING_ARCHIVE_IDS,
    );

    expect(rows).toEqual([]);
  });

  it("excludes an agent on another host whose parent-computer label names a different parent agent id", () => {
    setAgents([makeAgent({ id: "parent-a" })]);
    setAgentsForServer(REMOTE_SERVER_ID, [
      remoteChild({ id: "remote-child" }, SERVER_ID, "some-other-agent"),
    ]);

    const rows = selectSubagentsForParent(
      useSessionStore.getState(),
      { serverId: SERVER_ID, parentAgentId: "parent-a" },
      EMPTY_PENDING_ARCHIVE_IDS,
    );

    expect(rows).toEqual([]);
  });

  it("does not use a same-host parentAgentId match against a different host's agents", () => {
    // A daemon-local parentAgentId value is meaningless across daemons — only the cross-host
    // labels establish a remote relationship (docs/peers.md).
    setAgents([makeAgent({ id: "parent-a" })]);
    setAgentsForServer(REMOTE_SERVER_ID, [
      makeAgent({ id: "remote-unrelated", parentAgentId: "parent-a", serverId: REMOTE_SERVER_ID }),
    ]);

    const rows = selectSubagentsForParent(
      useSessionStore.getState(),
      { serverId: SERVER_ID, parentAgentId: "parent-a" },
      EMPTY_PENDING_ARCHIVE_IDS,
    );

    expect(rows).toEqual([]);
  });

  it("excludes an archived remote child", () => {
    setAgents([makeAgent({ id: "parent-a" })]);
    setAgentsForServer(REMOTE_SERVER_ID, [
      remoteChild(
        { id: "remote-child", archivedAt: new Date("2026-03-08T12:00:00.000Z") },
        SERVER_ID,
        "parent-a",
      ),
    ]);

    const rows = selectSubagentsForParent(
      useSessionStore.getState(),
      { serverId: SERVER_ID, parentAgentId: "parent-a" },
      EMPTY_PENDING_ARCHIVE_IDS,
    );

    expect(rows).toEqual([]);
  });

  it("mixes local and remote children in one sorted list, each tagged with its own host", () => {
    setAgents([
      makeAgent({ id: "parent-a" }),
      makeAgent({
        id: "local-child",
        parentAgentId: "parent-a",
        createdAt: new Date("2026-03-08T10:02:00.000Z"),
      }),
    ]);
    setAgentsForServer(REMOTE_SERVER_ID, [
      remoteChild(
        { id: "remote-child", createdAt: new Date("2026-03-08T10:01:00.000Z") },
        SERVER_ID,
        "parent-a",
      ),
    ]);

    const rows = selectSubagentsForParent(
      useSessionStore.getState(),
      { serverId: SERVER_ID, parentAgentId: "parent-a" },
      EMPTY_PENDING_ARCHIVE_IDS,
    );

    expect(rows.map((row) => ({ id: row.id, hostServerId: row.hostServerId }))).toEqual([
      { id: "remote-child", hostServerId: REMOTE_SERVER_ID },
      { id: "local-child", hostServerId: SERVER_ID },
    ]);
  });

  it("produces deep-equal output across repeated calls against the same unchanged state", () => {
    setAgents([makeAgent({ id: "parent-a" })]);
    setAgentsForServer(REMOTE_SERVER_ID, [
      remoteChild({ id: "remote-child" }, SERVER_ID, "parent-a"),
    ]);
    const params = { serverId: SERVER_ID, parentAgentId: "parent-a" };

    const first = selectSubagentsForParent(
      useSessionStore.getState(),
      params,
      EMPTY_PENDING_ARCHIVE_IDS,
    );
    const second = selectSubagentsForParent(
      useSessionStore.getState(),
      params,
      EMPTY_PENDING_ARCHIVE_IDS,
    );

    expect(first).toEqual(second);
  });

  it("nests a remote child's own children under it, resolved on the remote host", () => {
    setAgents([makeAgent({ id: "parent-a" })]);
    setAgentsForServer(REMOTE_SERVER_ID, [
      remoteChild({ id: "remote-child" }, SERVER_ID, "parent-a"),
      makeAgent({
        id: "remote-grandchild",
        parentAgentId: "remote-child",
        serverId: REMOTE_SERVER_ID,
      }),
    ]);

    const tree = buildSubagentTree(
      useSessionStore.getState(),
      useProviderSubagentStore.getState(),
      { serverId: SERVER_ID, parentAgentId: "parent-a" },
      EMPTY_PENDING_ARCHIVE_IDS,
      true,
    );

    expect(
      tree.map((node) => ({
        id: node.row.id,
        hostServerId: (node.row as PaseoSubagentRow).hostServerId,
      })),
    ).toEqual([{ id: "remote-child", hostServerId: REMOTE_SERVER_ID }]);
    expect(tree[0]?.children.map((node) => node.row.id)).toEqual(["remote-grandchild"]);
  });
});

describe("findAgentHostServerId", () => {
  it("returns the preferred host when the agent lives there", () => {
    setAgents([makeAgent({ id: "agent-a" })]);

    expect(findAgentHostServerId(useSessionStore.getState().sessions, SERVER_ID, "agent-a")).toBe(
      SERVER_ID,
    );
  });

  it("finds the agent on another connected host when it is not on the preferred one", () => {
    setAgents([makeAgent({ id: "parent-a" })]);
    setAgentsForServer(REMOTE_SERVER_ID, [
      makeAgent({ id: "remote-agent", serverId: REMOTE_SERVER_ID }),
    ]);

    expect(
      findAgentHostServerId(useSessionStore.getState().sessions, SERVER_ID, "remote-agent"),
    ).toBe(REMOTE_SERVER_ID);
  });

  it("returns null when no connected host knows the agent", () => {
    setAgents([makeAgent({ id: "parent-a" })]);

    expect(
      findAgentHostServerId(useSessionStore.getState().sessions, SERVER_ID, "missing"),
    ).toBeNull();
  });
});
