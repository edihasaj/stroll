import { describe, expect, it } from "vitest";
import {
  isWorktreesRootDirty,
  listWorktreeRows,
  normalizeWorktreesRootInput,
} from "./worktrees-model";

function workspace(
  overrides: Partial<Parameters<typeof listWorktreeRows>[0] extends Iterable<infer T> ? T : never>,
) {
  return {
    id: "w1",
    name: "feature-x",
    workspaceKind: "worktree" as const,
    workspaceDirectory: "/wt/feature-x",
    projectDisplayName: "app",
    projectCustomName: null,
    pinnedAt: null,
    archivingAt: null,
    diffStat: null,
    gitRuntime: { currentBranch: "feature-x", isDirty: false, aheadOfOrigin: 0 },
    ...overrides,
  };
}

describe("listWorktreeRows", () => {
  it("keeps only worktrees that are not being archived", () => {
    const rows = listWorktreeRows([
      workspace({ id: "a" }),
      workspace({ id: "dir", workspaceKind: "directory" }),
      workspace({ id: "checkout", workspaceKind: "local_checkout" }),
      workspace({ id: "gone", archivingAt: "2026-10-09T10:00:00Z" }),
    ]);

    expect(rows.map((row) => row.workspaceId)).toEqual(["a"]);
  });

  it("lists pinned worktrees first, then by project and name", () => {
    const rows = listWorktreeRows([
      workspace({ id: "b2", name: "b", projectDisplayName: "zeta" }),
      workspace({ id: "a1", name: "a", projectDisplayName: "alpha" }),
      workspace({
        id: "p",
        name: "z",
        projectDisplayName: "zeta",
        pinnedAt: "2026-10-09T10:00:00Z",
      }),
    ]);

    expect(rows.map((row) => row.workspaceId)).toEqual(["p", "a1", "b2"]);
    expect(rows[0]?.pinned).toBe(true);
  });

  it("prefers the project's custom name and carries branch and path", () => {
    const [row] = listWorktreeRows([workspace({ projectCustomName: " Mobile app " })]);

    expect(row).toMatchObject({
      projectName: "Mobile app",
      branch: "feature-x",
      path: "/wt/feature-x",
    });
  });

  it("flags local changes and unpushed commits as at risk, and waits for git state", () => {
    const rows = listWorktreeRows([
      workspace({ id: "clean" }),
      workspace({ id: "dirty", gitRuntime: { isDirty: true, aheadOfOrigin: 0 } }),
      workspace({ id: "ahead", gitRuntime: { isDirty: false, aheadOfOrigin: 2 } }),
      workspace({ id: "unknown", gitRuntime: null }),
    ]);
    const byId = Object.fromEntries(rows.map((row) => [row.workspaceId, row]));

    expect(byId.clean).toMatchObject({ atRisk: false, riskKnown: true });
    expect(byId.dirty).toMatchObject({ atRisk: true, riskKnown: true });
    expect(byId.ahead).toMatchObject({ atRisk: true, riskKnown: true });
    expect(byId.unknown).toMatchObject({ atRisk: false, riskKnown: false });
  });
});

describe("worktrees root input", () => {
  it("trims, and treats a blank draft as clearing the setting", () => {
    expect(normalizeWorktreesRootInput("  /srv/wt  ")).toBe("/srv/wt");
    expect(normalizeWorktreesRootInput("   ")).toBe("");
  });

  it("is dirty only when the normalized draft differs from the configured root", () => {
    expect(isWorktreesRootDirty(undefined, "")).toBe(false);
    expect(isWorktreesRootDirty(undefined, " ")).toBe(false);
    expect(isWorktreesRootDirty("/srv/wt", " /srv/wt ")).toBe(false);
    expect(isWorktreesRootDirty("/srv/wt", "")).toBe(true);
    expect(isWorktreesRootDirty(undefined, "/srv/wt")).toBe(true);
  });
});
