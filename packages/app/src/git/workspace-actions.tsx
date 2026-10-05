import { GitActionsSplitButton } from "@/git/actions-split-button";
import { GIT_ACTION_ICONS } from "@/git/action-icons";
import { useGitActions } from "@/git/use-actions";

interface WorkspaceActionsProps {
  serverId: string;
  cwd: string;
  /** Collapse to an icon-only "more git actions" menu — every action still reachable,
   * just not duplicated as a second visible label. Used when a caller already renders its
   * own prominent primary-action control (e.g. the workspace header's Commit pill). */
  menuOnly?: boolean;
}

export function WorkspaceActions({ serverId, cwd, menuOnly }: WorkspaceActionsProps) {
  const { gitActions } = useGitActions({
    serverId,
    cwd,
    icons: GIT_ACTION_ICONS,
  });

  return <GitActionsSplitButton gitActions={gitActions} menuOnly={menuOnly} />;
}
