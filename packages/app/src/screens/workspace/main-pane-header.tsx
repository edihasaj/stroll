import { memo, useCallback, useMemo, type ReactElement } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { SquarePen } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ToolbarButton, ToolbarControls } from "@/components/ui/pane-content-toolbar";
import { WORKSPACE_SECONDARY_HEADER_HEIGHT } from "@/constants/layout";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { ChatPaneHeader } from "@/screens/workspace/chat-pane-header";
import {
  WorkspaceExitFocusModeButton,
  WorkspaceNewTabButton,
} from "@/screens/workspace/workspace-desktop-tabs-row";
import type { Theme } from "@/styles/theme";
import { generateDraftId } from "@/stores/draft-keys";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { buildWorkspaceTabPersistenceKey, type WorkspaceTabTarget } from "@/workspace-tabs/model";

const ThemedSquarePen = withUnistyles(SquarePen);
const extraMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundExtraMuted });
const NO_PANEL_KINDS: readonly WorkspaceTabTarget["kind"][] = [];

export interface MainPaneHeaderProps {
  serverId: string;
  workspaceId: string;
  /** What the main pane shows: a chat, a draft, or nothing yet. */
  target: WorkspaceTabTarget | null;
  /** False while another route (Settings) covers the workspace. */
  isRouteFocused: boolean;
  focusModeEnabled: boolean;
  onExitFocusMode: () => void;
  onCopyAgentId: (agentId: string) => Promise<void> | void;
  onCopyResumeCommand: (agentId: string) => Promise<void> | void;
  onReloadAgent: (agentId: string) => Promise<void> | void;
}

/**
 * The strip over the main view, which shows one chat and has no tab row. A chat gets the chat
 * header (title, rename, menu); a draft or an empty view gets a plain title. Focus mode hides the
 * workspace header, so the exit button lives here too.
 */
export const MainPaneHeader = memo(function MainPaneHeader({
  serverId,
  workspaceId,
  target,
  isRouteFocused,
  focusModeEnabled,
  onExitFocusMode,
  onCopyAgentId,
  onCopyResumeCommand,
  onReloadAgent,
}: MainPaneHeaderProps): ReactElement {
  const { t } = useTranslation();
  const newChatKeys = useShortcutKeys("workspace-tab-target-agent");
  const handleCreateChat = useCallback(() => {
    const workspaceKey = buildWorkspaceTabPersistenceKey({ serverId, workspaceId });
    if (!workspaceKey) {
      return;
    }
    useWorkspaceLayoutStore.getState().openTab({
      workspaceKey,
      target: { kind: "draft", draftId: generateDraftId() },
      intent: "reveal",
    });
  }, [serverId, workspaceId]);
  const draftDataSet = useMemo(
    () => ({ draftId: target?.kind === "draft" ? target.draftId : undefined }),
    [target],
  );
  return (
    <View style={styles.container} testID="main-pane-header">
      <WorkspaceExitFocusModeButton visible={focusModeEnabled} onPress={onExitFocusMode} />
      {target?.kind === "agent" ? (
        <ChatPaneHeader
          serverId={serverId}
          workspaceId={workspaceId}
          agentId={target.agentId}
          isRouteFocused={isRouteFocused}
          onCopyAgentId={onCopyAgentId}
          onCopyResumeCommand={onCopyResumeCommand}
          onReloadAgent={onReloadAgent}
        />
      ) : (
        <View style={styles.draftTitle} testID="main-pane-draft-header" dataSet={draftDataSet}>
          <Text style={styles.title} numberOfLines={1}>
            {t("sidebar.workspace.chats.untitled")}
          </Text>
        </View>
      )}
      <ToolbarControls style={styles.toolbar}>
        <ToolbarButton
          label={t("workspace.header.actions.newAgent")}
          shortcut={newChatKeys}
          testID="main-pane-new-chat"
          onPress={handleCreateChat}
        >
          <ThemedSquarePen size={14} uniProps={extraMutedColorMapping} />
        </ToolbarButton>
        <WorkspaceNewTabButton
          panePanelKinds={NO_PANEL_KINDS}
          host="main"
          launchPurpose="primary"
          placement="toolbar"
          serverId={serverId}
          shortcutKeys={null}
        />
      </ToolbarControls>
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    minWidth: 0,
    height: WORKSPACE_SECONDARY_HEADER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.borderDivider,
    backgroundColor: theme.colors.surface0,
  },
  draftTitle: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: theme.spacing[4],
  },
  toolbar: {
    paddingHorizontal: theme.spacing[1],
    marginRight: theme.spacing[1],
  },
  title: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
  },
}));
