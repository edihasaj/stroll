import type { TFunction } from "i18next";
import type { ComposerTrackPillSegment } from "@/composer/tracks";
import type { SidebarStateBucket } from "@/utils/sidebar-agent-state";
import { deriveSidebarStateBucket, STATUS_BUCKET_ORDER } from "@/utils/sidebar-agent-state";
import type { PaseoSubagentRow, SubagentRow, SubagentTreeNode } from "./select";
import { isFinishedSubagent } from "./archive-finished";
import { providerSubagentLifecycleStatus } from "./provider-store";

function presentationStatus(row: SubagentRow) {
  if (row.kind === "paseo") {
    if (row.turn.phase === "open") return "running";
    return row.status === "running" ? "idle" : row.status;
  }
  return providerSubagentLifecycleStatus(row.status);
}

export interface SubagentRowPresentationData {
  key: string;
  kind: "agent";
  label: string;
  subtitle: string;
  titleState: "ready" | "loading";
  statusBucket: SidebarStateBucket | null;
  /** Elapsed-time anchor. `null` when no timing is known yet — never shown as elapsed time. */
  startedAt: Date | null;
  /** True while the row is still running; elapsed time ticks live until this flips. */
  isRunning: boolean;
  /** When the row finished. Meaningful only once `isRunning` is false. */
  endedAt: Date | null;
}

export interface ManagedSubagentElapsedWindow {
  startedAt: Date | null;
  endedAt: Date | null;
}

/**
 * The elapsed-time window for a managed (kind `"paseo"`) subagent row. Live while its turn is
 * open — anchored to the turn's own start, falling back to the row's creation time. Frozen to
 * the agent's last completed turn once it isn't running. Absent when neither is known, which
 * never falls back to the record's `updatedAt`: that is a generic revision stamp, also bumped by
 * a label or title edit with no run attached (e.g. opening the row's tab).
 */
export function resolveManagedElapsedWindow(
  row: Pick<PaseoSubagentRow, "turn" | "createdAt"> & { lastTurn?: PaseoSubagentRow["lastTurn"] },
): ManagedSubagentElapsedWindow {
  if (row.turn.phase === "open") {
    return { startedAt: row.turn.startedAt ?? row.createdAt, endedAt: null };
  }
  if (row.lastTurn) {
    return { startedAt: row.lastTurn.startedAt, endedAt: row.lastTurn.endedAt };
  }
  return { startedAt: null, endedAt: null };
}

function resolveElapsedWindow(row: SubagentRow): ManagedSubagentElapsedWindow {
  if (row.kind === "paseo") return resolveManagedElapsedWindow(row);
  return { startedAt: row.createdAt, endedAt: row.updatedAt };
}

export function buildSubagentRowPresentationData(row: SubagentRow): SubagentRowPresentationData {
  // The task distinguishes siblings in a fan-out, so it names the row when present. Providers
  // own the compact secondary context because model, effort, and usage semantics differ.
  const description = resolveRowLabel(row.description);
  const title = resolveRowLabel(row.title);
  const label = description ?? title;
  const providerSubtitle = row.kind === "provider" ? resolveRowLabel(row.subtitle) : null;
  const subtitle = providerSubtitle ?? (description ? title : null);
  const status = presentationStatus(row);
  const elapsed = resolveElapsedWindow(row);
  return {
    key: `${row.kind}_subagent_${row.id}`,
    kind: "agent",
    label: label ?? "",
    subtitle: subtitle ?? "",
    titleState: label ? "ready" : "loading",
    statusBucket: deriveSidebarStateBucket({
      status,
      requiresAttention: false,
    }),
    startedAt: elapsed.startedAt,
    isRunning: status === "running",
    endedAt: elapsed.endedAt,
  };
}

/**
 * Whether a top-level track row belongs in the Active group: still running, or finished but not
 * yet acknowledged. Everything else (quietly finished) is Done. Mirrors the finished check the
 * track already uses to decide whether a row auto-collapses, so the two groupings cannot drift.
 */
export function isSubagentRowActive(row: SubagentRow): boolean {
  return !isFinishedSubagent(row) || row.requiresAttention === true;
}

export interface SubagentTopLevelGroups {
  active: SubagentTreeNode[];
  done: SubagentTreeNode[];
}

/**
 * Splits top-level track rows into Active (running or needing attention) and Done — everything
 * else. Children stay nested under their parent wherever that parent lands; only the top level is
 * grouped.
 */
export function groupSubagentTopLevelNodes(
  nodes: readonly SubagentTreeNode[],
): SubagentTopLevelGroups {
  const active: SubagentTreeNode[] = [];
  const done: SubagentTreeNode[] = [];
  for (const node of nodes) {
    (isSubagentRowActive(node.row) ? active : done).push(node);
  }
  return { active, done };
}

type ActiveStatusBucket = Exclude<SidebarStateBucket, "done">;

/** The sidebar's list order, minus the state that earns no mark. */
const ACTIVE_STATUS_BUCKET_ORDER = STATUS_BUCKET_ORDER.filter(
  (bucket): bucket is ActiveStatusBucket => bucket !== "done",
);

/** One state the pill reports, and how many children are in it. */
interface SubagentStatusCount {
  bucket: ActiveStatusBucket;
  count: number;
}

/** Everything the pill draws. Built together so no mark can end up next to another one's count. */
export interface SubagentPillPresentation {
  segments: ComposerTrackPillSegment[];
  accessibilityLabel: string;
}

/**
 * What the pill says about a fan-out, and which marks it says it with.
 *
 * A mark and a number sitting together answer the same question, so the pill cannot collapse a
 * mixed fan-out into the most urgent state the way a sidebar project row does: a red dot beside
 * "1 failed" over a child that is still working says the fan-out has stopped. Every state present
 * gets its own mark and its own count, in the order the sidebar's status groups list them.
 *
 * It stays one line because subagent rows only ever reach three states — see
 * `buildSubagentRowPresentationData`, which reports no attention of its own — so the pill is two
 * segments at worst, and falls back to naming what it opens once nothing is happening.
 */
export function buildSubagentPillPresentation(
  t: TFunction,
  rows: readonly SubagentRow[],
): SubagentPillPresentation {
  const counts = summarizeSubagentStatus(rows);
  if (counts.length === 0) {
    const label = totalLabel(t, rows.length);
    return { segments: [{ bucket: null, text: label }], accessibilityLabel: label };
  }
  const labels = counts.map(({ bucket, count }) => statusLabel(t, bucket, count));
  return {
    segments: counts.map(({ bucket }, index) => ({ bucket, text: labels[index] ?? "" })),
    // Marks separate the segments on screen; a screen reader needs the pause spelled out.
    accessibilityLabel: labels.join(", "),
  };
}

/** Wording comes from the sidebar's status groups — one name per state across the whole app. */
function statusLabel(t: TFunction, bucket: ActiveStatusBucket, count: number): string {
  switch (bucket) {
    case "running":
      return t("subagents.pillLabelWorking", { count });
    case "failed":
      return t("subagents.pillLabelFailed", { count });
    case "needs_input":
      return count === 1
        ? t("subagents.pillLabelNeedsInputOne")
        : t("subagents.pillLabelNeedsInputMany", { count });
    case "attention":
      return t("subagents.pillLabelReadyToReview", { count });
  }
}

/** Nothing is happening, so the pill is back to naming what it opens. */
function totalLabel(t: TFunction, total: number): string {
  return total === 1 ? t("subagents.pillLabelOne") : t("subagents.pillLabelMany", { count: total });
}

/**
 * Empty when every child is done: a finished fan-out is not worth a colour above the composer.
 */
function summarizeSubagentStatus(rows: readonly SubagentRow[]): SubagentStatusCount[] {
  const buckets = rows.map((row) => buildSubagentRowPresentationData(row).statusBucket);
  return ACTIVE_STATUS_BUCKET_ORDER.flatMap((bucket) => {
    const count = buckets.filter((candidate) => candidate === bucket).length;
    return count > 0 ? [{ bucket, count }] : [];
  });
}

export function countFinishedSubagents(rows: readonly SubagentRow[]): number {
  return rows.filter(isFinishedSubagent).length;
}

export function resolveRowLabel(title: string | null | undefined): string | null {
  if (typeof title !== "string") {
    return null;
  }
  const normalized = title.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.toLowerCase() === "new agent") {
    return null;
  }
  return normalized;
}

/**
 * The host suffix to show beside a row whose agent lives on a different connected host than the
 * parent pane's own (docs/peers.md "In the app") — `null` for a local row, so callers can skip
 * the "· Host" segment entirely instead of rendering an empty one. Falls back to the raw
 * serverId when the host list hasn't resolved a friendly name yet, rather than showing nothing.
 */
export function resolveSubagentHostLabel(
  rowHostServerId: string,
  parentServerId: string,
  hostNames: ReadonlyMap<string, string>,
): string | null {
  if (rowHostServerId === parentServerId) return null;
  return hostNames.get(rowHostServerId) ?? rowHostServerId;
}

/** Joins meta-line segments with the app's " · " separator, dropping empty or absent ones. */
export function joinMeta(parts: ReadonlyArray<string | null>): string {
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}
