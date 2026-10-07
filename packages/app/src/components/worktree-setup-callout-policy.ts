import type { PaseoConfigRaw } from "@getpaseo/protocol/messages";
import { i18n } from "@/i18n/i18next";
import { buildProjectSettingsRoute } from "@/utils/host-routes";

export interface WorktreeSetupWorkspaceInput {
  projectId: string;
  projectKind: string;
  projectRootPath: string;
  workspaceKind: string;
}

// One dismissal for every project and host: closing the card means "stop suggesting this", so it
// must not come back for the next repo the user opens.
const WORKTREE_SETUP_DISMISSAL_KEY = "worktree-setup-missing";

export interface ActiveGitWorkspaceProject {
  serverId: string;
  projectId: string;
  repoRoot: string;
}

interface ReadProjectConfigResult {
  ok: boolean;
  config?: PaseoConfigRaw | null;
}

export interface WorktreeSetupCalloutPolicy {
  id: string;
  dismissalKey: string;
  priority: number;
  title: string;
  description: string;
  actionLabel: string;
  projectSettingsRoute: ReturnType<typeof buildProjectSettingsRoute>;
  testID: string;
}

/**
 * The active workspace's project, only while that workspace is a worktree. Setup commands run when
 * a worktree is created, so in a plain checkout the card is advice about a feature the user is not
 * using, and it would follow them into every project they open.
 */
export function selectActiveWorktreeProject(
  serverId: string,
  workspace: WorktreeSetupWorkspaceInput,
): ActiveGitWorkspaceProject | null {
  if (workspace.workspaceKind !== "worktree" || workspace.projectKind !== "git") {
    return null;
  }

  const projectId = workspace.projectId;
  const repoRoot = workspace.projectRootPath.trim();
  if (!projectId.trim() || !repoRoot) {
    return null;
  }

  return { serverId, projectId, repoRoot };
}

export function shouldShowWorktreeSetupCallout(readResult: ReadProjectConfigResult | undefined) {
  return readResult?.ok === true && !hasSetupCommands(readResult.config ?? {});
}

export function buildWorktreeSetupCalloutPolicy(
  project: ActiveGitWorkspaceProject,
): WorktreeSetupCalloutPolicy {
  return {
    id: `worktree-setup-missing:${project.serverId}:${project.projectId}`,
    dismissalKey: WORKTREE_SETUP_DISMISSAL_KEY,
    priority: 100,
    title: i18n.t("sidebar.worktreeSetup.title"),
    description: i18n.t("sidebar.worktreeSetup.description"),
    actionLabel: i18n.t("sidebar.worktreeSetup.openProjectSettings"),
    projectSettingsRoute: buildProjectSettingsRoute(project.serverId, project.projectId),
    testID: `worktree-setup-callout-${project.projectId}`,
  };
}

function hasSetupCommands(config: PaseoConfigRaw): boolean {
  const setup = config.worktree?.setup;
  if (typeof setup === "string") {
    return setup.trim().length > 0;
  }
  if (Array.isArray(setup)) {
    return setup.some((command) => typeof command === "string" && command.trim().length > 0);
  }
  return false;
}
