import { memo, useCallback, useMemo, useState, type ReactElement } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Ellipsis } from "lucide-react-native";
import { AdaptiveRenameModal } from "@/components/rename-modal";
import { useProviderIcon } from "@/components/provider-icons";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { isWeb } from "@/constants/platform";
import { useArchiveChat } from "@/hooks/use-archive-chat";
import { useDeleteChat } from "@/hooks/use-delete-chat";
import { useRenameChat } from "@/hooks/use-rename-chat";
import { buildChatMenuEntries } from "@/screens/workspace/chat-menu";
import { ChatMenuItems, useChatMenuLabels } from "@/screens/workspace/chat-menu-items";
import { useSessionStore } from "@/stores/session-store";
import type { Theme } from "@/styles/theme";
import { resolveChatTitle } from "@/workspace-tabs/chat-title";

const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedEllipsis = withUnistyles(Ellipsis);

export interface ChatPaneHeaderProps {
  serverId: string;
  workspaceId: string;
  agentId: string;
  onCopyAgentId: (agentId: string) => Promise<void> | void;
  onCopyResumeCommand: (agentId: string) => Promise<void> | void;
  onReloadAgent: (agentId: string) => Promise<void> | void;
}

function triggerStyle({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.trigger, hovered && styles.triggerHovered];
}

function titleStyle({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.titleButton, hovered && styles.titleButtonHovered];
}

function renderMenuIcon() {
  return <ThemedEllipsis size={16} uniProps={foregroundMutedColorMapping} />;
}

/**
 * The header over the one chat the main view shows: its provider, its title (press to rename),
 * and a menu with Archive, Delete chat, and the copy actions. The copy handlers come from the
 * workspace screen, which already owns the clipboard and toast wiring for the tab menu.
 */
export const ChatPaneHeader = memo(function ChatPaneHeader({
  serverId,
  workspaceId,
  agentId,
  onCopyAgentId,
  onCopyResumeCommand,
  onReloadAgent,
}: ChatPaneHeaderProps): ReactElement {
  const { t } = useTranslation();
  const provider = useSessionStore(
    (state) => state.sessions[serverId]?.agents.get(agentId)?.provider ?? "codex",
  );
  const rawTitle = useSessionStore(
    (state) => state.sessions[serverId]?.agents.get(agentId)?.title ?? null,
  );
  const ProviderIcon = useProviderIcon(provider, serverId);
  const title = resolveChatTitle(rawTitle);
  const [isRenaming, setIsRenaming] = useState(false);
  const renameChat = useRenameChat(serverId);
  const archiveChat = useArchiveChat(serverId);
  const deleteChat = useDeleteChat({ serverId, workspaceId });
  const labels = useChatMenuLabels();

  const handleStartRename = useCallback(() => setIsRenaming(true), []);
  const handleCloseRename = useCallback(() => setIsRenaming(false), []);
  const handleSubmitRename = useCallback(
    (nextTitle: string) => renameChat(agentId, nextTitle),
    [agentId, renameChat],
  );
  const entries = useMemo(
    () =>
      buildChatMenuEntries({
        agentId,
        menuTestIDBase: "chat-pane-menu",
        labels,
        actions: {
          onCopyResumeCommand: () => void onCopyResumeCommand(agentId),
          onCopyAgentId: () => void onCopyAgentId(agentId),
          onReload: () => void onReloadAgent(agentId),
          onArchive: () => void archiveChat(agentId),
          onDelete: () => void deleteChat({ agentId }),
        },
      }),
    [agentId, archiveChat, deleteChat, labels, onCopyAgentId, onCopyResumeCommand, onReloadAgent],
  );

  return (
    <View style={styles.container} testID="chat-pane-header">
      <ProviderIcon size={16} color={styles.providerIcon.color} />
      <Pressable
        accessibilityRole={isWeb ? undefined : "button"}
        accessibilityLabel={t("workspace.tabs.menu.renameAgent")}
        onPress={handleStartRename}
        style={titleStyle}
        testID="chat-pane-title"
      >
        <Text style={styles.title} numberOfLines={1}>
          {title ?? t("sidebar.workspace.chats.untitled")}
        </Text>
      </Pressable>
      <DropdownMenu compactMode="sheet">
        <DropdownMenuTrigger
          hitSlop={8}
          style={triggerStyle}
          accessibilityRole={isWeb ? undefined : "button"}
          accessibilityLabel={t("sidebar.workspace.chats.menu")}
          testID="chat-pane-menu-trigger"
        >
          {renderMenuIcon}
        </DropdownMenuTrigger>
        <DropdownMenuContent
          align="end"
          width={220}
          sheetTitle={t("sidebar.workspace.chats.menu")}
          testID="chat-pane-menu"
        >
          <ChatMenuItems entries={entries} />
        </DropdownMenuContent>
      </DropdownMenu>
      {isRenaming ? (
        <AdaptiveRenameModal
          visible
          title={t("workspace.tabs.menu.renameAgent")}
          initialValue={title ?? ""}
          submitLabel={t("workspace.tabs.menu.rename")}
          maxLength={200}
          onClose={handleCloseRename}
          onSubmit={handleSubmitRename}
          testID={`chat-pane-rename-modal-${agentId}`}
        />
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minWidth: 0,
    paddingHorizontal: theme.spacing[3],
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  providerIcon: {
    color: theme.colors.foregroundMuted,
  },
  titleButton: {
    flexShrink: 1,
    minWidth: 0,
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  titleButtonHovered: {
    backgroundColor: theme.colors.surface2,
  },
  title: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
  },
  trigger: {
    padding: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  triggerHovered: {
    backgroundColor: theme.colors.surface2,
  },
}));
