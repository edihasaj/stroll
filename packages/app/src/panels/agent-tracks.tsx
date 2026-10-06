import { memo, useCallback, useMemo, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { WorkspaceDiffStatPill } from "@/composer/diff-stat-pill";
import { useWorkspaceHasDiffStat } from "@/composer/workspace-diff-stat";
import { AgentTaskList } from "@/composer/task-list";
import { ComposerTrackBar } from "@/composer/tracks";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useSettings } from "@/hooks/use-settings";
import { PluginComposerPills } from "@/plugins";
import { useSessionStore } from "@/stores/session-store";
import {
  type ArchiveFinishedStatus,
  type SubagentTreeNode,
  useArchiveSubagent,
  useDetachSubagent,
  type SubagentRow,
} from "@/subagents";
import { SubagentsTrack } from "@/subagents/track";
import { useOpenSubagent } from "@/subagents/use-open-subagent";
import type { TodoEntry } from "@/types/stream";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import { openComposerChanges } from "@/workspace-tabs/open-supporting-view";
import { confirmDialog } from "@/utils/confirm-dialog";

/**
 * The pane's ambient context — workspace changes, subagents, and tasks — as a row of pills above
 * the composer.
 *
 * The row shares the composer's keyboard transform and owns the space between itself and the
 * transcript. Each pill owns its action while tab placement stays behind the workspace boundary.
 */
export const AgentTracks = memo(function AgentTracks({
  serverId,
  workspaceId,
  agentId,
  cwd,
  subagentRows,
  subagentTree,
  tasks,
  archiveFinishedStatus,
  onArchiveFinished,
  hasPluginComposerPills,
}: {
  serverId: string;
  workspaceId: string;
  agentId: string;
  cwd: string;
  subagentRows: SubagentRow[];
  subagentTree?: SubagentTreeNode[];
  tasks: TodoEntry[] | undefined;
  archiveFinishedStatus: ArchiveFinishedStatus;
  onArchiveFinished: () => void;
  hasPluginComposerPills: boolean;
}): ReactElement | null {
  const { t } = useTranslation();
  const hasWorkspaceDiffStat = useWorkspaceHasDiffStat(serverId, workspaceId);
  const isCompact = useIsCompactFormFactor();
  const openInSidePane = useSettings((settings) => settings.openInSidePane);
  const workspaceKey = buildWorkspaceTabPersistenceKey({ serverId, workspaceId });
  const canDetachSubagents = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.agentDetach === true,
  );
  const archiveSubagent = useArchiveSubagent({ serverId });
  const detachSubagent = useDetachSubagent({ serverId });
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const activeManagedSubagentIds = useMemo(
    () =>
      subagentRows
        .filter((row) => row.kind === "paseo" && row.status === "running")
        .map((row) => row.id),
    [subagentRows],
  );
  const handleStopSubagent = useCallback(
    (subagentId: string) => {
      if (!client) return;
      void client.cancelAgent(subagentId).catch(() => undefined);
    },
    [client],
  );
  const handleStopAllActive = useCallback(async () => {
    if (!client || activeManagedSubagentIds.length === 0) return;
    const names = subagentRows
      .filter((row) => activeManagedSubagentIds.includes(row.id))
      .map((row) => row.title)
      .join(", ");
    const confirmed = await confirmDialog({
      title: t("subagents.stopAllConfirmTitle"),
      message: t("subagents.stopAllConfirmMessage", {
        count: activeManagedSubagentIds.length,
        names,
      }),
      confirmLabel: t("subagents.stopAllAction"),
      cancelLabel: t("common.actions.cancel"),
      destructive: true,
    });
    if (!confirmed) return;
    await Promise.all(activeManagedSubagentIds.map((subagentId) => client.cancelAgent(subagentId)));
  }, [activeManagedSubagentIds, client, subagentRows, t]);
  const { openSubagent, openProviderSubagent } = useOpenSubagent({ serverId, workspaceId });
  const handleOpenChanges = useCallback(() => {
    if (!workspaceKey) {
      return;
    }
    openComposerChanges({
      isCompact,
      workspaceKey,
      checkout: { serverId, cwd, isGit: true },
      preferences: openInSidePane,
    });
  }, [cwd, isCompact, openInSidePane, serverId, workspaceKey]);

  if (
    !hasWorkspaceDiffStat &&
    !hasAgentTracks({
      subagentRows,
      tasks,
      archiveFinishedStatus,
      hasPluginComposerPills,
    })
  ) {
    return null;
  }

  return (
    <ComposerTrackBar>
      <AgentTaskList tasks={tasks} />
      <SubagentsTrack
        serverId={serverId}
        rows={subagentRows}
        tree={subagentTree}
        onOpenSubagent={openSubagent}
        onOpenProviderSubagent={openProviderSubagent}
        onArchiveSubagent={archiveSubagent}
        onArchiveFinished={onArchiveFinished}
        archiveFinishedStatus={archiveFinishedStatus}
        onDetachSubagent={canDetachSubagents ? detachSubagent : undefined}
        onStopSubagent={handleStopSubagent}
        onStopAllActive={activeManagedSubagentIds.length > 0 ? handleStopAllActive : undefined}
      />
      <PluginComposerPills
        serverId={serverId}
        workspaceId={workspaceId}
        agentId={agentId}
        compact={isCompact}
      />
      <WorkspaceDiffStatPill
        serverId={serverId}
        workspaceId={workspaceId}
        onPress={handleOpenChanges}
      />
    </ComposerTrackBar>
  );
});

export function hasAgentTracks({
  subagentRows,
  tasks,
  archiveFinishedStatus,
  hasPluginComposerPills = false,
}: {
  subagentRows: readonly SubagentRow[];
  tasks: readonly TodoEntry[] | undefined;
  archiveFinishedStatus: ArchiveFinishedStatus;
  hasPluginComposerPills?: boolean;
}): boolean {
  return (
    subagentRows.length > 0 ||
    Boolean(tasks?.length) ||
    archiveFinishedStatus.kind !== "idle" ||
    hasPluginComposerPills
  );
}
