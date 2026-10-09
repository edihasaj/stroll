import { memo, useCallback, useMemo, useState, type ReactElement } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChevronRight } from "lucide-react-native";
import { AdaptiveRenameModal } from "@/components/rename-modal";
import { SidebarChatRow } from "@/components/sidebar/sidebar-chat-row";
import { SidebarStatusDot } from "@/components/sidebar/sidebar-status-dot";
import { SidebarGroupToggleRow } from "@/components/sidebar/sidebar-group-toggle-row";
import {
  useFocusedChatId,
  useSidebarWorkspaceChats,
} from "@/components/sidebar/use-sidebar-workspace-chats";
import {
  aggregateChatBucket,
  limitSidebarChats,
  type SidebarChat,
} from "@/components/sidebar/workspace-chats";
import { isWeb } from "@/constants/platform";
import { useArchiveChat } from "@/hooks/use-archive-chat";
import { useDeleteChat } from "@/hooks/use-delete-chat";
import { useRenameChat } from "@/hooks/use-rename-chat";
import { useSessionStore } from "@/stores/session-store";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";
import type { Theme } from "@/styles/theme";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { resolveChatTitle } from "@/workspace-tabs/chat-title";
import type { SidebarStateBucket } from "@/utils/sidebar-agent-state";

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedChevronRight = withUnistyles(ChevronRight);

export interface SidebarWorkspaceChatsProps {
  serverId: string;
  workspaceId: string;
  /** `${serverId}:${workspaceId}`, the key the collapse state is stored under. */
  workspaceKey: string;
  /** Runs before a chat opens, e.g. to close the compact sidebar. */
  onNavigate?: () => void;
}

interface RenamingChat {
  agentId: string;
  currentTitle: string;
}

function CollapsedChatsRow({
  count,
  bucket,
  onExpand,
  testID,
}: {
  count: number;
  bucket: SidebarStateBucket;
  onExpand: () => void;
  testID: string;
}): ReactElement {
  const { t } = useTranslation();
  const label = t("sidebar.workspace.chats.collapsed", { count });
  const rowStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.collapsedRow,
      hovered && !pressed && styles.collapsedRowHovered,
      pressed && styles.collapsedRowPressed,
    ],
    [],
  );
  const accessibilityState = useMemo(() => ({ expanded: false }), []);

  return (
    <Pressable
      accessibilityRole={isWeb ? undefined : "button"}
      accessibilityLabel={t("sidebar.workspace.chats.show")}
      accessibilityState={accessibilityState}
      onPress={onExpand}
      style={rowStyle}
      testID={testID}
    >
      {({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => (
        <>
          <View style={styles.collapsedIconSlot}>
            <ThemedChevronRight
              size={14}
              uniProps={hovered || pressed ? foregroundColorMapping : foregroundMutedColorMapping}
            />
          </View>
          <Text style={hovered || pressed ? styles.collapsedTextHovered : styles.collapsedText}>
            {label}
          </Text>
          <SidebarStatusDot bucket={bucket} testID={`${testID}-status`} />
        </>
      )}
    </Pressable>
  );
}

function SidebarWorkspaceChatList({
  serverId,
  workspaceId,
  workspaceKey,
  chats,
  collapsed,
  onNavigate,
}: SidebarWorkspaceChatsProps & {
  chats: readonly SidebarChat[];
  collapsed: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const focusedChatId = useFocusedChatId(serverId);
  const toggleCollapsed = useSidebarCollapsedSectionsStore(
    (state) => state.toggleWorkspaceChatsCollapsed,
  );
  const [showAll, setShowAll] = useState(false);
  const [renaming, setRenaming] = useState<RenamingChat | null>(null);
  const renameChat = useRenameChat(serverId);
  const archiveChat = useArchiveChat(serverId);
  const deleteChat = useDeleteChat({ serverId, workspaceId });

  const handleOpen = useCallback(
    (agentId: string) => {
      onNavigate?.();
      navigateToAgent({ serverId, agentId, workspaceId });
    },
    [onNavigate, serverId, workspaceId],
  );
  const handleRename = useCallback(
    (agentId: string) => {
      const agent = useSessionStore.getState().sessions[serverId]?.agents.get(agentId);
      setRenaming({ agentId, currentTitle: resolveChatTitle(agent?.title) ?? "" });
    },
    [serverId],
  );
  const handleArchive = useCallback((agentId: string) => void archiveChat(agentId), [archiveChat]);
  const handleDelete = useCallback((agentId: string) => void deleteChat({ agentId }), [deleteChat]);
  const handleExpand = useCallback(
    () => toggleCollapsed(workspaceKey),
    [toggleCollapsed, workspaceKey],
  );
  const handleToggleShowAll = useCallback(() => setShowAll((current) => !current), []);
  const handleRenameClose = useCallback(() => setRenaming(null), []);
  const handleRenameSubmit = useCallback(
    async (title: string) => {
      if (renaming) {
        await renameChat(renaming.agentId, title);
      }
    },
    [renameChat, renaming],
  );

  const limited = useMemo(
    () => limitSidebarChats({ chats, expanded: showAll, activeChatId: focusedChatId }),
    [chats, focusedChatId, showAll],
  );
  const untitledLabel = t("sidebar.workspace.chats.untitled");

  if (collapsed) {
    return (
      <CollapsedChatsRow
        count={chats.length}
        bucket={aggregateChatBucket(chats)}
        onExpand={handleExpand}
        testID={`sidebar-workspace-chats-toggle-${workspaceKey}`}
      />
    );
  }

  return (
    <View testID={`sidebar-workspace-chats-${workspaceKey}`}>
      {limited.visible.map((chat) => (
        <SidebarChatRow
          key={chat.id}
          serverId={serverId}
          chat={chat}
          selected={chat.id === focusedChatId}
          untitledLabel={untitledLabel}
          onOpen={handleOpen}
          onRename={handleRename}
          onArchive={handleArchive}
          onDelete={handleDelete}
        />
      ))}
      {limited.canToggle ? (
        <SidebarGroupToggleRow
          expanded={showAll}
          onPress={handleToggleShowAll}
          compact
          testID={`sidebar-workspace-chats-show-more-${workspaceKey}`}
        />
      ) : null}
      {renaming ? (
        <AdaptiveRenameModal
          visible
          title={t("workspace.tabs.menu.renameAgent")}
          initialValue={renaming.currentTitle}
          submitLabel={t("workspace.tabs.menu.rename")}
          maxLength={200}
          onClose={handleRenameClose}
          onSubmit={handleRenameSubmit}
          testID={`sidebar-chat-rename-modal-${serverId}:${renaming.agentId}`}
        />
      ) : null}
    </View>
  );
}

/**
 * The chats listed under a workspace row. Renders nothing for a workspace without chats, and
 * only the cheap lookup runs until there is something to list.
 */
export const SidebarWorkspaceChats = memo(function SidebarWorkspaceChats(
  props: SidebarWorkspaceChatsProps,
): ReactElement | null {
  const { serverId, workspaceId, workspaceKey } = props;
  const chats = useSidebarWorkspaceChats({ serverId, workspaceId });
  const collapsed = useSidebarCollapsedSectionsStore((state) =>
    state.collapsedWorkspaceChatKeys.has(workspaceKey),
  );
  if (chats.length === 0) {
    return null;
  }
  return <SidebarWorkspaceChatList {...props} chats={chats} collapsed={collapsed} />;
});

const styles = StyleSheet.create((theme) => ({
  collapsedRow: {
    minHeight: 28,
    marginLeft: theme.spacing[4],
    marginBottom: theme.spacing[0.5],
    paddingVertical: theme.spacing[1],
    paddingLeft: theme.spacing[2],
    paddingRight: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    userSelect: "none",
  },
  collapsedRowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  collapsedRowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  collapsedIconSlot: {
    width: theme.iconSize.md,
    height: theme.iconSize.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  collapsedText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    minWidth: 0,
    flexShrink: 1,
  },
  collapsedTextHovered: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    minWidth: 0,
    flexShrink: 1,
  },
}));
