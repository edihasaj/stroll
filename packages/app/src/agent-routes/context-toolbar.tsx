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
import { AgentBriefSheet } from "./brief-sheet";

const ThemedFileText = withUnistyles(FileText);

/**
 * The agent panel's own toolbar, holding the Context button that opens the thread brief
 * (docs/agent-routes.md). Callers gate rendering on `features.agentRoutes`; there is nothing
 * else in this bar yet, so an unsupported host shows no toolbar at all.
 */
export function AgentContextToolbar({
  serverId,
  agentId,
  toast,
}: {
  serverId: string;
  agentId: string;
  toast: ToastApi;
}): ReactElement {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const [isSheetOpen, setIsSheetOpen] = useState(false);
  const openSheet = useCallback(() => setIsSheetOpen(true), []);
  const closeSheet = useCallback(() => setIsSheetOpen(false), []);
  const iconSize = paneContentToolbarIconSize(isCompact);

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
