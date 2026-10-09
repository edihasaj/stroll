import { memo, useCallback, useMemo, useState, type ReactElement } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { CircleAlert, MoreVertical } from "lucide-react-native";
import { StatusRing } from "@/components/status-ring";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isNative, isWeb } from "@/constants/platform";
import { useCompactTimeAgo } from "@/hooks/use-time-ago";
import { buildChatMenuEntries } from "@/screens/workspace/chat-menu";
import { ChatMenuItems, useChatMenuLabels } from "@/screens/workspace/chat-menu-items";
import { SidebarStatusDot } from "@/components/sidebar/sidebar-status-dot";
import { isSameSidebarChat, type SidebarChat } from "@/components/sidebar/workspace-chats";
import { useOpenKebabMenuVisibility } from "@/components/sidebar/use-open-kebab-menu-visibility";
import type { Theme } from "@/styles/theme";
import type { SidebarStateBucket } from "@/utils/sidebar-agent-state";
import { getStatusDotColor } from "@/utils/status-dot-color";
import { STATUS_INDICATOR_ALERT_SIZE } from "@/utils/status-indicator-geometry";

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const needsInputColorMapping = (theme: Theme) => ({
  color: theme.colors.surface0,
  fill: getStatusDotColor({ theme, bucket: "needs_input" }) ?? undefined,
});

const ThemedCircleAlert = withUnistyles(CircleAlert);
const ThemedMoreVertical = withUnistyles(MoreVertical);

export interface SidebarChatRowProps {
  serverId: string;
  chat: SidebarChat;
  selected: boolean;
  /** The label shown while the chat has no title yet. */
  untitledLabel: string;
  onOpen: (agentId: string) => void;
  onRename: (agentId: string) => void;
  onArchive: (agentId: string) => void;
  onDelete: (agentId: string) => void;
}

function ChatStatus({ bucket }: { bucket: SidebarStateBucket }): ReactElement | null {
  switch (bucket) {
    case "running":
      return (
        <View style={styles.statusSlot} testID="sidebar-chat-status-running">
          <StatusRing />
        </View>
      );
    case "needs_input":
      return (
        <View style={styles.statusSlot} testID="sidebar-chat-status-needs_input">
          <ThemedCircleAlert size={STATUS_INDICATOR_ALERT_SIZE} uniProps={needsInputColorMapping} />
        </View>
      );
    case "failed":
    case "attention":
      return (
        <View style={styles.statusSlot} testID={`sidebar-chat-status-${bucket}`}>
          <SidebarStatusDot bucket={bucket} />
        </View>
      );
    case "done":
      return <View style={styles.statusSlot} />;
  }
}

/** Its own component so the minute tick re-renders one `<Text>`, not the row. */
function ChatTimestamp({ lastActivityAt }: { lastActivityAt: number }) {
  const date = useMemo(() => new Date(lastActivityAt), [lastActivityAt]);
  const label = useCompactTimeAgo(date);
  return (
    <Text style={styles.timestamp} numberOfLines={1}>
      {label}
    </Text>
  );
}

function renderKebabIcon({ hovered }: { hovered?: boolean }) {
  return (
    <ThemedMoreVertical
      size={14}
      uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
    />
  );
}

function kebabStyle({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.kebab, hovered && styles.kebabHovered];
}

function ChatRowMenu({
  serverId,
  chat,
  menuProps,
  onRename,
  onArchive,
  onDelete,
}: Pick<SidebarChatRowProps, "serverId" | "chat" | "onRename" | "onArchive" | "onDelete"> & {
  menuProps: { open: boolean; onOpenChange: (open: boolean) => void };
}): ReactElement {
  const { t } = useTranslation();
  const labels = useChatMenuLabels();
  const key = `${serverId}:${chat.id}`;
  const entries = useMemo(
    () =>
      buildChatMenuEntries({
        agentId: chat.id,
        menuTestIDBase: `sidebar-chat-menu-${key}`,
        labels,
        actions: {
          onRename: () => onRename(chat.id),
          onArchive: () => onArchive(chat.id),
          onDelete: () => onDelete(chat.id),
        },
      }),
    [chat.id, key, labels, onArchive, onDelete, onRename],
  );

  return (
    <DropdownMenu compactMode="sheet" {...menuProps}>
      <DropdownMenuTrigger
        hitSlop={8}
        style={kebabStyle}
        accessibilityRole={isWeb ? undefined : "button"}
        accessibilityLabel={t("sidebar.workspace.chats.menu")}
        testID={`sidebar-chat-kebab-${key}`}
      >
        {renderKebabIcon}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        width={220}
        sheetTitle={t("sidebar.workspace.chats.menu")}
        testID={`sidebar-chat-menu-${key}`}
      >
        <ChatMenuItems entries={entries} />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/**
 * One chat under a workspace row. The hover state lives on the plain outer `View` and the press
 * on the inner `Pressable`, with the kebab as a sibling of the `Pressable` rather than a child
 * (docs/hover.md); the trailing slot has a fixed width so the timestamp and the kebab swap
 * without moving the title.
 */
function SidebarChatRowView({
  serverId,
  chat,
  selected,
  untitledLabel,
  onOpen,
  onRename,
  onArchive,
  onDelete,
}: SidebarChatRowProps) {
  const isCompact = useIsCompactFormFactor();
  const [isHovered, setIsHovered] = useState(false);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const kebab = useOpenKebabMenuVisibility(isHovered || isNative || isCompact);
  const title = chat.title ?? untitledLabel;
  const key = `${serverId}:${chat.id}`;

  const handlePress = useCallback(() => onOpen(chat.id), [chat.id, onOpen]);
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  const rowStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.row,
      isHovered && styles.rowHovered,
      selected && styles.rowSelected,
      pressed && styles.rowPressed,
    ],
    [isHovered, selected],
  );

  return (
    <View
      style={styles.container}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <Pressable
        accessibilityRole={isWeb ? undefined : "button"}
        accessibilityLabel={title}
        accessibilityState={accessibilityState}
        aria-selected={selected}
        onPress={handlePress}
        style={rowStyle}
        testID={`sidebar-chat-row-${key}`}
      >
        <ChatStatus bucket={chat.bucket} />
        <Text style={isHovered || selected ? styles.titleActive : styles.title} numberOfLines={1}>
          {title}
        </Text>
        <View style={styles.trailingSlot}>
          {kebab.showKebab ? null : <ChatTimestamp lastActivityAt={chat.lastActivityAt} />}
        </View>
      </Pressable>
      {kebab.showKebab ? (
        <View style={styles.kebabOverlay}>
          <ChatRowMenu
            serverId={serverId}
            chat={chat}
            menuProps={kebab.menuProps}
            onRename={onRename}
            onArchive={onArchive}
            onDelete={onDelete}
          />
        </View>
      ) : null}
    </View>
  );
}

// A chat's rows are rebuilt as new objects whenever any chat on the host changes, so rows compare
// the chat by value rather than by identity.
function areRowPropsEqual(previous: SidebarChatRowProps, next: SidebarChatRowProps): boolean {
  return (
    previous.serverId === next.serverId &&
    isSameSidebarChat(previous.chat, next.chat) &&
    previous.selected === next.selected &&
    previous.untitledLabel === next.untitledLabel &&
    previous.onOpen === next.onOpen &&
    previous.onRename === next.onRename &&
    previous.onArchive === next.onArchive &&
    previous.onDelete === next.onDelete
  );
}

export const SidebarChatRow = memo(SidebarChatRowView, areRowPropsEqual);

const styles = StyleSheet.create((theme) => ({
  container: {
    position: "relative",
  },
  row: {
    minHeight: 28,
    // Chats sit one step in from their workspace row, so the tree reads workspace → chats.
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
  rowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  rowSelected: {
    backgroundColor: theme.colors.surfaceSidebarSelected,
  },
  rowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  statusSlot: {
    width: theme.iconSize.md,
    height: 20,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
    lineHeight: 20,
  },
  titleActive: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
    lineHeight: 20,
  },
  // Wide enough for the widest compact label ("Sep 30") and for the kebab that replaces it.
  trailingSlot: {
    width: 36,
    height: 20,
    flexShrink: 0,
    alignItems: "flex-end",
    justifyContent: "center",
  },
  timestamp: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 20,
    ...theme.tabularNums,
  },
  kebabOverlay: {
    position: "absolute",
    top: 0,
    bottom: theme.spacing[0.5],
    right: theme.spacing[3],
    justifyContent: "center",
  },
  kebab: {
    padding: 2,
    borderRadius: 4,
  },
  kebabHovered: {
    backgroundColor: theme.colors.surface2,
  },
}));
