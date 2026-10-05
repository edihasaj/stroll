import type { ReactElement } from "react";
import { View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import { DiffStat } from "@/components/diff-stat";
import { Button } from "@/components/ui/button";
import { GIT_ACTION_ICONS } from "@/git/action-icons";
import type { GitAction, GitActionId, GitActions } from "@/git/policy";
import { useGitActions } from "@/git/use-actions";

// The policy-resolved `primary`/`secondary`/`menu` split changes which bucket a given action
// sits in as repo state changes (e.g. "Commit" moves to `primary` once there are uncommitted
// changes). The header's Commit pill always wants the commit action specifically, wherever the
// policy put it — not whichever action currently happens to be primary.
function findGitAction(gitActions: GitActions, id: GitActionId): GitAction | null {
  if (gitActions.primary?.id === id) {
    return gitActions.primary;
  }
  return (
    gitActions.secondary.find((action) => action.id === id) ??
    gitActions.menu.find((action) => action.id === id) ??
    null
  );
}

interface WorkspaceHeaderDiffStatPillProps {
  additions: number;
  deletions: number;
}

/** The diff-stat hairline pill beside the header's Commit pill (docs/design.md §5, Codex
 * parity). Read-only — the real diff lives in the Changes pane; this is a summary. */
export function WorkspaceHeaderDiffStatPill({
  additions,
  deletions,
}: WorkspaceHeaderDiffStatPillProps): ReactElement {
  return (
    <View style={styles.diffStatPill} testID="workspace-header-diff-stat">
      <DiffStat additions={additions} deletions={deletions} />
    </View>
  );
}

interface WorkspaceHeaderCommitPillProps {
  serverId: string;
  cwd: string;
}

/** The header's primary "Commit" pill — `accent` fill, `accentForeground` text (docs/design.md
 * §16, Codex parity). Calls the same real commit action as the header's git actions split
 * button (`useGitActions`/`GitActionsSplitButton`), not a decorative duplicate. */
export function WorkspaceHeaderCommitPill({
  serverId,
  cwd,
}: WorkspaceHeaderCommitPillProps): ReactElement | null {
  const { t } = useTranslation();
  const { gitActions } = useGitActions({ serverId, cwd, icons: GIT_ACTION_ICONS });
  const commitAction = findGitAction(gitActions, "commit");
  if (!commitAction) {
    return null;
  }
  return (
    <Button
      variant="default"
      size="sm"
      onPress={commitAction.handler}
      disabled={commitAction.disabled}
      style={styles.commitPill}
      testID="workspace-header-commit-pill"
    >
      {commitAction.status === "pending"
        ? commitAction.pendingLabel
        : t("workspace.git.actions.commit.label")}
    </Button>
  );
}

const styles = StyleSheet.create((theme) => ({
  diffStatPill: {
    flexDirection: "row",
    alignItems: "center",
    height: 24,
    paddingHorizontal: theme.spacing[2.5],
    borderRadius: theme.borderRadius.full,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  // Pill radius overrides the shared Button's `borderRadius.md` (docs/design.md "Finish")
  // for this one Codex-parity trigger — every other Button chrome (fill, press, focus) stays.
  commitPill: {
    borderRadius: theme.borderRadius.full,
  },
}));
