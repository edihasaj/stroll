import { beforeAll, describe, expect, it } from "vitest";
import { i18n } from "@/i18n/i18next";
import type {
  PaseoSubagentRow,
  ProviderSubagentRow,
  SubagentRow,
  SubagentTreeNode,
} from "./select";
import {
  buildSubagentPillPresentation,
  buildSubagentRowPresentationData,
  countFinishedSubagents,
  groupSubagentTopLevelNodes,
  isSubagentRowActive,
  resolveRowLabel,
} from "./track-presentation";

function row(
  overrides: Partial<PaseoSubagentRow> & Pick<PaseoSubagentRow, "id">,
): PaseoSubagentRow {
  return {
    kind: "paseo",
    id: overrides.id,
    provider: overrides.provider ?? "codex",
    title: overrides.title ?? `Agent ${overrides.id}`,
    description: null,
    subtitle: null,
    status: overrides.status ?? "idle",
    turn:
      overrides.turn ??
      (overrides.status === "running"
        ? { phase: "open", turnId: null, startedAt: null, cancellationRequestId: null }
        : { phase: "idle", cancellationRequestId: null }),
    requiresAttention: overrides.requiresAttention ?? false,
    createdAt: overrides.createdAt ?? new Date("2026-04-20T00:00:00.000Z"),
    updatedAt: overrides.updatedAt ?? new Date("2026-04-20T00:00:00.000Z"),
  };
}

describe("buildSubagentPillPresentation", () => {
  // The real instance, so a label that names a key nobody added renders as that key and fails.
  beforeAll(async () => {
    if (!i18n.isInitialized) {
      await i18n.init();
    }
    await i18n.changeLanguage("en");
  });

  const pill = (rows: SubagentRow[]) => buildSubagentPillPresentation(i18n.t, rows);

  it("counts the children that are working, not the fan-out", () => {
    expect(pill([row({ id: "a" }), row({ id: "b", status: "running" })])).toEqual({
      segments: [{ bucket: "running", text: "1 working" }],
      accessibilityLabel: "1 working",
    });
  });

  it("counts every child in the state it reports", () => {
    expect(
      pill([
        row({ id: "a", status: "running" }),
        row({ id: "b", status: "running" }),
        row({ id: "c" }),
      ]),
    ).toEqual({
      segments: [{ bucket: "running", text: "2 working" }],
      accessibilityLabel: "2 working",
    });
  });

  it("keeps a working child visible behind a failed one instead of collapsing to the worst", () => {
    expect(
      pill([
        row({ id: "a", status: "running" }),
        row({ id: "b", status: "error", requiresAttention: true }),
        row({ id: "c", status: "error" }),
      ]),
    ).toEqual({
      segments: [
        { bucket: "failed", text: "2 failed" },
        { bucket: "running", text: "1 working" },
      ],
      accessibilityLabel: "2 failed, 1 working",
    });
  });

  it("names what it opens once every child is done", () => {
    expect(pill([row({ id: "a" }), row({ id: "b" })])).toEqual({
      segments: [{ bucket: null, text: "2 subagents" }],
      accessibilityLabel: "2 subagents",
    });
  });

  it("keeps the singular for a lone child", () => {
    expect(pill([row({ id: "a" })])).toEqual({
      segments: [{ bucket: null, text: "1 subagent" }],
      accessibilityLabel: "1 subagent",
    });
  });

  it("has nothing to mark without rows", () => {
    expect(pill([])).toEqual({
      segments: [{ bucket: null, text: "0 subagents" }],
      accessibilityLabel: "0 subagents",
    });
  });
});

describe("countFinishedSubagents", () => {
  it("counts eligible managed and terminal provider-owned children", () => {
    const providerRows: SubagentRow[] = [
      {
        kind: "provider",
        id: "native-running",
        parentAgentId: "parent",
        provider: "claude",
        title: "running",
        description: null,
        subtitle: null,
        status: "running",
        requiresAttention: false,
        createdAt: new Date("2026-04-20T00:00:00.000Z"),
        updatedAt: new Date("2026-04-20T00:00:00.000Z"),
      },
      {
        kind: "provider",
        id: "native-failed",
        parentAgentId: "parent",
        provider: "claude",
        title: "failed",
        description: null,
        subtitle: null,
        status: "failed",
        requiresAttention: true,
        createdAt: new Date("2026-04-20T00:00:01.000Z"),
        updatedAt: new Date("2026-04-20T00:00:01.000Z"),
      },
    ];

    expect(
      countFinishedSubagents([
        row({ id: "managed-running", status: "running" }),
        row({ id: "managed-idle", status: "idle" }),
        ...providerRows,
      ]),
    ).toBe(2);
  });

  it("excludes running and initializing managed children", () => {
    expect(
      countFinishedSubagents([
        row({ id: "running", status: "running" }),
        row({ id: "initializing", status: "initializing" }),
        row({ id: "finished", status: "idle" }),
      ]),
    ).toBe(1);
  });
});

describe("resolveRowLabel", () => {
  it("returns null when title is not a string", () => {
    expect(resolveRowLabel(null as unknown as SubagentRow["title"])).toBe(null);
  });

  it("returns null for whitespace-only titles", () => {
    expect(resolveRowLabel("   ")).toBe(null);
  });

  it("returns null for the placeholder 'new agent' regardless of case", () => {
    expect(resolveRowLabel("new agent")).toBe(null);
    expect(resolveRowLabel("New Agent")).toBe(null);
    expect(resolveRowLabel("  NEW AGENT  ")).toBe(null);
  });

  it("returns the trimmed title for real names", () => {
    expect(resolveRowLabel("  Build the thing  ")).toBe("Build the thing");
  });
});

describe("buildSubagentRowPresentationData", () => {
  it("namespaces the key with a subagent prefix", () => {
    expect(buildSubagentRowPresentationData(row({ id: "child-a" })).key).toBe(
      "paseo_subagent_child-a",
    );
  });

  it("marks the row ready when the title resolves to a real label", () => {
    const presentation = buildSubagentRowPresentationData(row({ id: "a", title: "Build it" }));
    expect(presentation.titleState).toBe("ready");
    expect(presentation.label).toBe("Build it");
  });

  it("marks the row loading and blanks the label for the placeholder title", () => {
    const presentation = buildSubagentRowPresentationData(row({ id: "a", title: "new agent" }));
    expect(presentation.titleState).toBe("loading");
    expect(presentation.label).toBe("");
  });

  it("maps a running row to the running status bucket so callers render the synced loader", () => {
    expect(buildSubagentRowPresentationData(row({ id: "a", status: "running" })).statusBucket).toBe(
      "running",
    );
  });

  it("maps an idle row to the done status bucket so callers render the static provider icon", () => {
    expect(buildSubagentRowPresentationData(row({ id: "a", status: "idle" })).statusBucket).toBe(
      "done",
    );
  });

  it("ignores requiresAttention on the source row when computing the bucket", () => {
    expect(
      buildSubagentRowPresentationData(row({ id: "a", status: "idle", requiresAttention: true }))
        .statusBucket,
    ).toBe("done");
  });
});

describe("buildSubagentRowPresentationData for provider rows", () => {
  function providerRow(overrides: Partial<ProviderSubagentRow> = {}): ProviderSubagentRow {
    return {
      kind: "provider",
      id: overrides.id ?? "toolu_1",
      parentAgentId: "parent",
      provider: "claude",
      title: "title" in overrides ? (overrides.title ?? null) : "general-purpose",
      description: overrides.description ?? null,
      subtitle: overrides.subtitle ?? null,
      status: overrides.status ?? "running",
      requiresAttention: false,
      createdAt: overrides.createdAt ?? new Date("2026-07-26T00:00:00.000Z"),
      updatedAt: overrides.updatedAt ?? new Date("2026-07-26T00:00:00.000Z"),
    };
  }

  it("names the row after the task and demotes the subagent type", () => {
    const presentation = buildSubagentRowPresentationData(
      providerRow({ title: "general-purpose", description: "Reply with banana" }),
    );
    expect(presentation.label).toBe("Reply with banana");
    expect(presentation.subtitle).toBe("general-purpose");
  });

  it("tells two siblings of the same type apart", () => {
    const left = buildSubagentRowPresentationData(
      providerRow({ id: "a", description: "Summarize the docs" }),
    );
    const right = buildSubagentRowPresentationData(
      providerRow({ id: "b", description: "Reply with banana" }),
    );
    expect(left.label).not.toBe(right.label);
  });

  it("keeps type-as-label and an empty subtitle when a provider reports no task", () => {
    const presentation = buildSubagentRowPresentationData(
      providerRow({ title: "Provider child", description: null }),
    );
    expect(presentation.label).toBe("Provider child");
    expect(presentation.subtitle).toBe("");
  });

  it("stays in the loading state when neither field is known", () => {
    const presentation = buildSubagentRowPresentationData(
      providerRow({ title: null, description: null }),
    );
    expect(presentation.titleState).toBe("loading");
  });

  it("leaves managed subagent rows with no subtitle", () => {
    expect(buildSubagentRowPresentationData(row({ id: "a", title: "Managed" })).subtitle).toBe("");
  });
});

describe("provider-owned row subtitles", () => {
  function providerRow(overrides: Partial<ProviderSubagentRow> = {}): ProviderSubagentRow {
    return {
      kind: "provider",
      id: "toolu_1",
      parentAgentId: "parent",
      provider: "claude",
      title: "general-purpose",
      description: "Reply with banana",
      subtitle: null,
      status: "running",
      requiresAttention: false,
      createdAt: new Date("2026-07-26T00:00:00.000Z"),
      updatedAt: new Date("2026-07-26T00:00:00.000Z"),
      ...overrides,
    };
  }

  it("displays provider context without interpreting it", () => {
    expect(
      buildSubagentRowPresentationData(
        providerRow({ subtitle: "general-purpose · Opus 5 · High · 16.5k tokens" }),
      ).subtitle,
    ).toBe("general-purpose · Opus 5 · High · 16.5k tokens");
  });

  it("falls back to the type when an older provider sends no subtitle", () => {
    expect(buildSubagentRowPresentationData(providerRow()).subtitle).toBe("general-purpose");
  });

  it("does not duplicate the type when it is already the primary label", () => {
    expect(
      buildSubagentRowPresentationData(
        providerRow({ description: null, subtitle: null, title: "general-purpose" }),
      ).subtitle,
    ).toBe("");
  });
});

describe("buildSubagentRowPresentationData elapsed-time fields", () => {
  it("anchors a running managed row to its turn's startedAt", () => {
    const startedAt = new Date("2026-04-20T00:05:00.000Z");
    const presentation = buildSubagentRowPresentationData(
      row({
        id: "a",
        status: "running",
        turn: { phase: "open", turnId: "t1", startedAt, cancellationRequestId: null },
      }),
    );
    expect(presentation.startedAt).toBe(startedAt);
    expect(presentation.isRunning).toBe(true);
  });

  it("falls back to createdAt when a running managed row's turn has no startedAt", () => {
    const createdAt = new Date("2026-04-20T00:00:00.000Z");
    const presentation = buildSubagentRowPresentationData(
      row({
        id: "a",
        status: "running",
        createdAt,
        turn: { phase: "open", turnId: null, startedAt: null, cancellationRequestId: null },
      }),
    );
    expect(presentation.startedAt).toBe(createdAt);
  });

  it("anchors a finished managed row to createdAt and freezes at updatedAt", () => {
    const createdAt = new Date("2026-04-20T00:00:00.000Z");
    const updatedAt = new Date("2026-04-20T00:02:30.000Z");
    const presentation = buildSubagentRowPresentationData(
      row({ id: "a", status: "idle", createdAt, updatedAt }),
    );
    expect(presentation.isRunning).toBe(false);
    expect(presentation.startedAt).toBe(createdAt);
    expect(presentation.endedAt).toBe(updatedAt);
  });

  it("anchors a provider row to createdAt and reports updatedAt as the end", () => {
    const createdAt = new Date("2026-07-26T00:00:00.000Z");
    const updatedAt = new Date("2026-07-26T00:01:40.000Z");
    const presentation = buildSubagentRowPresentationData({
      kind: "provider",
      id: "toolu_1",
      parentAgentId: "parent",
      provider: "claude",
      title: "general-purpose",
      description: "Reply with banana",
      subtitle: null,
      status: "completed",
      requiresAttention: false,
      createdAt,
      updatedAt,
    });
    expect(presentation.startedAt).toBe(createdAt);
    expect(presentation.endedAt).toBe(updatedAt);
    expect(presentation.isRunning).toBe(false);
  });

  it("reports a running provider row as running", () => {
    const presentation = buildSubagentRowPresentationData({
      kind: "provider",
      id: "toolu_1",
      parentAgentId: "parent",
      provider: "claude",
      title: "general-purpose",
      description: null,
      subtitle: null,
      status: "running",
      requiresAttention: false,
      createdAt: new Date("2026-07-26T00:00:00.000Z"),
      updatedAt: new Date("2026-07-26T00:00:00.000Z"),
    });
    expect(presentation.isRunning).toBe(true);
  });
});

describe("isSubagentRowActive", () => {
  it("treats a running managed row as active", () => {
    expect(isSubagentRowActive(row({ id: "a", status: "running" }))).toBe(true);
  });

  it("treats a quietly finished managed row as done", () => {
    expect(isSubagentRowActive(row({ id: "a", status: "idle" }))).toBe(false);
  });

  it("treats a finished-but-unacknowledged managed row as active", () => {
    expect(isSubagentRowActive(row({ id: "a", status: "idle", requiresAttention: true }))).toBe(
      true,
    );
  });

  it("treats a quietly errored managed row as done, matching the track's own finished check", () => {
    expect(isSubagentRowActive(row({ id: "a", status: "error" }))).toBe(false);
  });

  it("treats an errored-and-unacknowledged managed row as active", () => {
    expect(isSubagentRowActive(row({ id: "a", status: "error", requiresAttention: true }))).toBe(
      true,
    );
  });

  it("treats a running provider row as active", () => {
    expect(
      isSubagentRowActive({
        kind: "provider",
        id: "toolu_1",
        parentAgentId: "parent",
        provider: "claude",
        title: "general-purpose",
        description: null,
        subtitle: null,
        status: "running",
        requiresAttention: false,
        createdAt: new Date("2026-07-26T00:00:00.000Z"),
        updatedAt: new Date("2026-07-26T00:00:00.000Z"),
      }),
    ).toBe(true);
  });

  it("treats a completed provider row as done", () => {
    expect(
      isSubagentRowActive({
        kind: "provider",
        id: "toolu_1",
        parentAgentId: "parent",
        provider: "claude",
        title: "general-purpose",
        description: null,
        subtitle: null,
        status: "completed",
        requiresAttention: false,
        createdAt: new Date("2026-07-26T00:00:00.000Z"),
        updatedAt: new Date("2026-07-26T00:00:00.000Z"),
      }),
    ).toBe(false);
  });

  it("treats a failed provider row as active", () => {
    expect(
      isSubagentRowActive({
        kind: "provider",
        id: "toolu_1",
        parentAgentId: "parent",
        provider: "claude",
        title: "general-purpose",
        description: null,
        subtitle: null,
        status: "failed",
        requiresAttention: true,
        createdAt: new Date("2026-07-26T00:00:00.000Z"),
        updatedAt: new Date("2026-07-26T00:00:00.000Z"),
      }),
    ).toBe(true);
  });
});

function node(
  overrides: Partial<PaseoSubagentRow> & Pick<PaseoSubagentRow, "id">,
): SubagentTreeNode {
  const built = row(overrides);
  return { key: `agent:${built.id}`, row: built, depth: 0, children: [] };
}

describe("groupSubagentTopLevelNodes", () => {
  it("splits running and done rows into separate groups", () => {
    const running = node({ id: "a", status: "running" });
    const finished = node({ id: "b", status: "idle" });
    const groups = groupSubagentTopLevelNodes([running, finished]);
    expect(groups.active).toEqual([running]);
    expect(groups.done).toEqual([finished]);
  });

  it("keeps a finished-but-unacknowledged row active", () => {
    const unacknowledged = node({ id: "a", status: "idle", requiresAttention: true });
    const groups = groupSubagentTopLevelNodes([unacknowledged]);
    expect(groups.active).toEqual([unacknowledged]);
    expect(groups.done).toEqual([]);
  });

  it("keeps a node's children attached to it regardless of which group it lands in", () => {
    const child = node({ id: "child", status: "idle" });
    const parent: SubagentTreeNode = {
      ...node({ id: "parent", status: "idle" }),
      children: [child],
    };
    const groups = groupSubagentTopLevelNodes([parent]);
    expect(groups.done).toEqual([parent]);
    expect(groups.done[0]?.children).toEqual([child]);
  });

  it("returns empty groups for an empty tree", () => {
    expect(groupSubagentTopLevelNodes([])).toEqual({ active: [], done: [] });
  });
});
