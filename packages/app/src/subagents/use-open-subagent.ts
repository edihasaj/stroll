import { useCallback } from "react";
import { supportsDesktopPaneSplits, useIsCompactFormFactor } from "@/constants/layout";
import { usePaneContext } from "@/panels/pane-context";
import { useSettings } from "@/hooks/use-settings";
import { useSessionStore } from "@/stores/session-store";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { findAgentHostServerId } from "./select";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";
import {
  openPreferredWorkspaceTarget,
  openWorkspaceTargetAtLocation,
} from "@/workspace-tabs/open-beside";

export interface UseOpenSubagentInput {
  serverId: string;
  /** `undefined` when the hosting pane has no workspace yet — opens degrade to a plain tab. */
  workspaceId: string | undefined;
}

export interface OpenSubagentOptions {
  /** Open as a normal tab in the parent's pane, ignoring the open-beside setting. */
  forceTab?: boolean;
}

export interface UseOpenSubagentResult {
  openSubagent: (subagentId: string, options?: OpenSubagentOptions) => void;
  openProviderSubagent: (
    parentAgentId: string,
    subagentId: string,
    options?: OpenSubagentOptions,
  ) => void;
}

/**
 * Opens a subagent beside the parent (per `settings.openInSidePane.subagents`) or as a normal tab
 * in the parent's pane when `forceTab` is set — the Cmd/Ctrl-click and middle-click gesture. One
 * seam shared by the subagents track and the in-transcript subagent rows, so both open the same
 * way.
 *
 * A same-workspace managed subagent splits the parent's pane; a cross-workspace one already
 * auto-opens as a tab in its own workspace (docs/agent-lifecycle.md "Tabs vs archive"), so
 * clicking it always navigates there instead — there is no beside-vs-tab choice to make.
 */
export function useOpenSubagent(input: UseOpenSubagentInput): UseOpenSubagentResult {
  const { serverId, workspaceId } = input;
  const { tabId, openTab } = usePaneContext();
  const isCompact = useIsCompactFormFactor();
  const canSplit = supportsDesktopPaneSplits() && !isCompact;
  const openInSidePane = useSettings((settings) => settings.openInSidePane);
  const workspaceKey = buildWorkspaceTabPersistenceKey({
    serverId,
    workspaceId: workspaceId ?? "",
  });

  const openSubagent = useCallback(
    (subagentId: string, options?: OpenSubagentOptions) => {
      const sessions = useSessionStore.getState().sessions;
      const session = sessions[serverId];
      const agent = session?.agents.get(subagentId) ?? session?.agentDetails.get(subagentId);
      if (!agent) {
        // Not on the parent's own host — a subagent spawned on another computer (docs/peers.md).
        // Resolve where it actually lives and open it there directly; the pane-splitting below
        // only makes sense within one host's own tab layout.
        const remoteHostServerId = findAgentHostServerId(sessions, serverId, subagentId);
        if (remoteHostServerId && remoteHostServerId !== serverId) {
          navigateToAgent({ serverId: remoteHostServerId, agentId: subagentId });
          return;
        }
      }
      if (agent?.workspaceId && agent.workspaceId !== workspaceId) {
        navigateToAgent({ serverId, agentId: subagentId });
        return;
      }
      if (!canSplit || !workspaceKey) {
        navigateToAgent({ serverId, agentId: subagentId });
        return;
      }
      const target: WorkspaceTabTarget = { kind: "agent", agentId: subagentId };
      if (options?.forceTab) {
        openWorkspaceTargetAtLocation({
          isCompact,
          workspaceKey,
          target,
          location: "main",
          parentTabId: tabId,
        });
        return;
      }
      openPreferredWorkspaceTarget({
        isCompact,
        workspaceKey,
        target,
        source: "subagents",
        preferences: openInSidePane,
        parentTabId: tabId,
      });
    },
    [canSplit, isCompact, openInSidePane, serverId, tabId, workspaceId, workspaceKey],
  );

  const openProviderSubagent = useCallback(
    (parentAgentId: string, subagentId: string, options?: OpenSubagentOptions) => {
      const target: WorkspaceTabTarget = { kind: "provider_subagent", parentAgentId, subagentId };
      if (!canSplit || !workspaceKey) {
        openTab(target);
        return;
      }
      if (options?.forceTab) {
        openWorkspaceTargetAtLocation({
          isCompact,
          workspaceKey,
          target,
          location: "main",
          parentTabId: tabId,
        });
        return;
      }
      openPreferredWorkspaceTarget({
        isCompact,
        workspaceKey,
        target,
        source: "subagents",
        preferences: openInSidePane,
        parentTabId: tabId,
      });
    },
    [canSplit, isCompact, openInSidePane, openTab, tabId, workspaceKey],
  );

  return { openSubagent, openProviderSubagent };
}
