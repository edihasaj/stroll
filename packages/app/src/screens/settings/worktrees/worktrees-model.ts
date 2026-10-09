import type { WorkspaceDescriptor } from "@/stores/session-store";

export interface WorktreeRow {
  workspaceId: string;
  name: string;
  projectName: string;
  branch: string | null;
  path: string;
  pinned: boolean;
  /** Anything a remove could lose: local changes or commits that are not on the remote. */
  atRisk: boolean;
  isDirty: boolean | null | undefined;
  aheadOfOrigin: number | null | undefined;
  diffStat: { additions: number; deletions: number } | null;
  /** The risk is unknown until the host reports git state; remove waits for it. */
  riskKnown: boolean;
}

type WorktreeSource = Pick<
  WorkspaceDescriptor,
  | "id"
  | "name"
  | "workspaceKind"
  | "workspaceDirectory"
  | "projectDisplayName"
  | "projectCustomName"
  | "pinnedAt"
  | "archivingAt"
  | "gitRuntime"
  | "diffStat"
>;

/** Worktree workspaces on a host: pinned first, then by project and name. */
export function listWorktreeRows(workspaces: Iterable<WorktreeSource>): WorktreeRow[] {
  const rows: WorktreeRow[] = [];
  for (const workspace of workspaces) {
    if (workspace.workspaceKind !== "worktree" || workspace.archivingAt) continue;
    const git = workspace.gitRuntime;
    const isDirty = git?.isDirty;
    const ahead = git?.aheadOfOrigin;
    rows.push({
      workspaceId: workspace.id,
      name: workspace.name,
      projectName: workspace.projectCustomName?.trim() || workspace.projectDisplayName,
      branch: git?.currentBranch ?? null,
      path: workspace.workspaceDirectory,
      pinned: workspace.pinnedAt != null,
      atRisk: isDirty === true || (ahead ?? 0) > 0,
      isDirty,
      aheadOfOrigin: ahead,
      diffStat: workspace.diffStat,
      riskKnown: isDirty !== undefined && ahead !== undefined,
    });
  }
  return rows.sort(
    (a, b) =>
      Number(b.pinned) - Number(a.pinned) ||
      a.projectName.localeCompare(b.projectName) ||
      a.name.localeCompare(b.name),
  );
}

/** What the daemon stores: blank clears the setting. */
export function normalizeWorktreesRootInput(text: string): string {
  return text.trim();
}

export function isWorktreesRootDirty(configuredRoot: string | undefined, draft: string): boolean {
  return normalizeWorktreesRootInput(draft) !== (configuredRoot ?? "");
}
