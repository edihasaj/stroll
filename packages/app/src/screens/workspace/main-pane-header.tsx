import { memo, type ReactElement } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { WORKSPACE_SECONDARY_HEADER_HEIGHT } from "@/constants/layout";
import { ChatPaneHeader } from "@/screens/workspace/chat-pane-header";
import { WorkspaceExitFocusModeButton } from "@/screens/workspace/workspace-desktop-tabs-row";
import type { WorkspaceTabTarget } from "@/workspace-tabs/model";

export interface MainPaneHeaderProps {
  serverId: string;
  workspaceId: string;
  /** What the main pane shows: a chat, a draft, or nothing yet. */
  target: WorkspaceTabTarget | null;
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
  focusModeEnabled,
  onExitFocusMode,
  onCopyAgentId,
  onCopyResumeCommand,
  onReloadAgent,
}: MainPaneHeaderProps): ReactElement {
  const { t } = useTranslation();
  return (
    <View style={styles.container} testID="main-pane-header">
      <WorkspaceExitFocusModeButton visible={focusModeEnabled} onPress={onExitFocusMode} />
      {target?.kind === "agent" ? (
        <ChatPaneHeader
          serverId={serverId}
          workspaceId={workspaceId}
          agentId={target.agentId}
          onCopyAgentId={onCopyAgentId}
          onCopyResumeCommand={onCopyResumeCommand}
          onReloadAgent={onReloadAgent}
        />
      ) : (
        <View style={styles.draftTitle} testID="main-pane-draft-header">
          <Text style={styles.title} numberOfLines={1}>
            {t("sidebar.workspace.chats.untitled")}
          </Text>
        </View>
      )}
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
  title: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
  },
}));
