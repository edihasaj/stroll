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
 * Opens a subagent from its parent's view. On desktop a managed subagent is a chat, so it replaces
 * the parent in the main view (back returns to the parent) and a provider subagent opens in the side
 * pane; the per-source Open location setting no longer applies. `forceTab` is the Cmd/Ctrl-click and
 * middle-click gesture, which opens a normal tab in the parent's pane on layouts that still have
 * tabs. One seam shared by the subagents track and the in-transcript subagent rows, so both open the
 * same way.
 *
 * A cross-workspace managed subagent already auto-opens in its own workspace
 * (docs/agent-lifecycle.md "The main view vs archive"), so clicking it always navigates there.
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
