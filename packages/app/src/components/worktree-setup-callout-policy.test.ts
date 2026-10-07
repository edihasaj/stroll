import { describe, expect, it } from "vitest";
import {
  buildWorktreeSetupCalloutPolicy,
  selectActiveWorktreeProject,
  shouldShowWorktreeSetupCallout,
} from "./worktree-setup-callout-policy";

describe("selectActiveWorktreeProject", () => {
  it("selects the host-local project id for a worktree workspace", () => {
    expect(
      selectActiveWorktreeProject("server-1", {
        projectId: "prj_local",
        projectKind: "git",
        projectRootPath: "/repo/project",
        workspaceKind: "worktree",
      }),
    ).toEqual({
      serverId: "server-1",
      projectId: "prj_local",
      repoRoot: "/repo/project",
    });
  });

  it("stays quiet in a plain checkout of a git project", () => {
    for (const workspaceKind of ["local_checkout", "checkout"]) {
      expect(
        selectActiveWorktreeProject("server-1", {
          projectId: "prj_local",
          projectKind: "git",
          projectRootPath: "/repo/project",
          workspaceKind,
        }),
      ).toBeNull();
    }
  });

  it("ignores non-git workspaces and blank coordinates", () => {
    expect(
      selectActiveWorktreeProject("server-1", {
        projectId: "project",
        projectKind: "directory",
        projectRootPath: "/repo",
        workspaceKind: "directory",
      }),
    ).toBeNull();
    expect(
      selectActiveWorktreeProject("server-1", {
        projectId: "prj_local",
        projectKind: "git",
        projectRootPath: "  ",
        workspaceKind: "worktree",
      }),
    ).toBeNull();
  });
});

describe("shouldShowWorktreeSetupCallout", () => {
  it("shows only after a successful config read with no setup command", () => {
    expect(shouldShowWorktreeSetupCallout({ ok: true, config: {} })).toBe(true);
    expect(
      shouldShowWorktreeSetupCallout({ ok: true, config: { worktree: { setup: "npm i" } } }),
    ).toBe(false);
    expect(shouldShowWorktreeSetupCallout({ ok: false })).toBe(false);
  });
});

describe("buildWorktreeSetupCalloutPolicy", () => {
  it("routes by server id and project id", () => {
    expect(
      buildWorktreeSetupCalloutPolicy({
        serverId: "server-1",
        projectId: "prj_local",
        repoRoot: "/repo/project",
      }),
    ).toMatchObject({
      id: "worktree-setup-missing:server-1:prj_local",
      projectSettingsRoute: "/settings/hosts/server-1/projects/prj_local",
      testID: "worktree-setup-callout-prj_local",
    });
  });

  it("shares one dismissal across projects and hosts", () => {
    const first = buildWorktreeSetupCalloutPolicy({
      serverId: "server-1",
      projectId: "prj_a",
      repoRoot: "/repo/a",
    });
    const second = buildWorktreeSetupCalloutPolicy({
      serverId: "server-2",
      projectId: "prj_b",
      repoRoot: "/repo/b",
    });

    expect(first.id).not.toBe(second.id);
    expect(first.dismissalKey).toBe(second.dismissalKey);
  });
});
