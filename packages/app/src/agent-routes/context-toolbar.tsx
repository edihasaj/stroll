import { useCallback, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { FileText } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import {
  PaneContentToolbar,
  ToolbarButton,
  ToolbarControls,
  paneContentToolbarIconSize,
} from "@/components/ui/pane-content-toolbar";
import { mutedIconColorMapping } from "@/components/ui/icon-color";
import { useIsCompactFormFactor } from "@/constants/layout";
import type { ToastApi } from "@/components/toast-host";
import { readAgentRouteLabels } from "@getpaseo/protocol/agent-route";
import { useSessionStore } from "@/stores/session-store";
import { AgentBriefSheet } from "./brief-sheet";

const ThemedFileText = withUnistyles(FileText);

/**
 * The agent panel's own toolbar, holding the Context button that opens the thread brief
 * (docs/agent-routes.md). Callers gate rendering on `features.agentRoutes`. It shows only on
 * routed agents: there is nothing else in this bar yet, and a one-icon row on every chat pane
 * would be chrome without a job.
 */
export function AgentContextToolbar({
  serverId,
  agentId,
  toast,
}: {
  serverId: string;
  agentId: string;
  toast: ToastApi;
}): ReactElement | null {
  const { t } = useTranslation();
  const isRouted = useSessionStore(
    (state) =>
      readAgentRouteLabels(state.sessions[serverId]?.agents.get(agentId)?.labels ?? null) !== null,
  );
  const isCompact = useIsCompactFormFactor();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const openSheet = useCallback(() => setIsSheetOpen(true), []);
  const closeSheet = useCallback(() => setIsSheetOpen(false), []);
  const iconSize = paneContentToolbarIconSize(isCompact);
  if (!isRouted) return null;

  return (
    <PaneContentToolbar testID="agent-context-toolbar">
      <ToolbarControls>
        <ToolbarButton
          label={t("agentRoutes.context.open")}
          compact={isCompact}
          onPress={openSheet}
          testID="agent-context-button"
        >
          <ThemedFileText size={iconSize} uniProps={mutedIconColorMapping} />
        </ToolbarButton>
      </ToolbarControls>
      <AgentBriefSheet
        serverId={serverId}
        agentId={agentId}
        visible={isSheetOpen}
        onClose={closeSheet}
        toast={toast}
      />
    </PaneContentToolbar>
  );
}
