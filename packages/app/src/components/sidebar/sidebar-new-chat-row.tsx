import { router } from "expo-router";
import { MessageSquarePlus, Plus } from "lucide-react-native";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useEarliestOnlineHostServerId } from "@/app/_layout";
import { Shortcut } from "@/components/ui/shortcut";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useHostFeature } from "@/runtime/host-features";
import { canCreateWorktreeForProjectKind } from "@/projects/host-projects";
import { builtinSidebarNavLabelKey, builtinSidebarNavShortcutAction } from "@/sidebar-nav/model";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { generateDraftId } from "@/stores/draft-keys";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { useWorkspace } from "@/stores/session-store-hooks";
import type { Theme } from "@/styles/theme";
import { buildNewWorkspaceRoute } from "@/utils/host-routes";

const ThemedMessageSquarePlus = withUnistyles(MessageSquarePlus);
const ThemedPlus = withUnistyles(Plus);
const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/**
 * The panel's "New chat" row (Codex parity): a compose icon plus label that starts a blank chat
 * draft, with a trailing `+` icon button that is the panel's New workspace affordance — the same
 * two actions the old `SidebarNewChatRow`/`SidebarNewWorkspaceRow` nav rows performed,
 * consolidated into one row because the mockup gives New workspace a trailing icon instead of a
 * second full row. `showNewChat`/`showNewWorkspace` read the same `sidebarNavItems` preference
 * those two builtins always have, so hiding one leaves the other working on its own.
 */
export function SidebarNewChatRow({
  showNewChat,
  showNewWorkspace,
}: {
  showNewChat: boolean;
  showNewWorkspace: boolean;
}) {
  const { t } = useTranslation();
  const activeWorkspaceSelection = useActiveWorkspaceSelection();
  const onlineHostServerId = useEarliestOnlineHostServerId();
  const activeWorkspaceServerId = activeWorkspaceSelection?.serverId ?? null;
  const activeWorkspaceId = activeWorkspaceSelection?.workspaceId ?? null;
  const activeWorkspace = useWorkspace(activeWorkspaceServerId, activeWorkspaceId);
  const chatServerId = activeWorkspaceServerId ?? onlineHostServerId;
  const supportsChats = useHostFeature(chatServerId, "chatWorkspaces");
  const supportsWorkspaceMultiplicity = useHostFeature(
    activeWorkspaceServerId,
    "workspaceMultiplicity",
  );
  const canUseActiveWorkspaceContext = Boolean(
    activeWorkspace &&
    (supportsWorkspaceMultiplicity || canCreateWorktreeForProjectKind(activeWorkspace.projectKind)),
  );
  // "new-chat" has no registered shortcut action (see `sidebar-nav/model.ts`'s
  // `BUILTIN_SHORTCUT_ACTIONS`), so only New workspace's trailing icon gets a tooltip shortcut.
  const newWorkspaceShortcut = useShortcutKeys(builtinSidebarNavShortcutAction("new-workspace"));

  const handleNewChat = useCallback(() => {
    if (!chatServerId) return;
    router.push(
      buildNewWorkspaceRoute({ serverId: chatServerId, draftId: generateDraftId(), mode: "chat" }),
    );
  }, [chatServerId]);

  const handleNewWorkspace = useCallback(() => {
    router.push(
      activeWorkspaceServerId
        ? buildNewWorkspaceRoute(
            activeWorkspace && canUseActiveWorkspaceContext
              ? {
                  serverId: activeWorkspaceServerId,
                  sourceDirectory: activeWorkspace.projectRootPath,
                  projectId: activeWorkspace.projectId,
                }
              : { serverId: activeWorkspaceServerId },
          )
        : buildNewWorkspaceRoute(),
    );
  }, [activeWorkspace, activeWorkspaceServerId, canUseActiveWorkspaceContext]);

  const canNewChat = showNewChat && Boolean(chatServerId) && supportsChats;

  if (!canNewChat && !showNewWorkspace) {
    return null;
  }

  return (
    <View style={styles.row} testID="sidebar-panel-new-chat-row">
      {canNewChat ? (
        <Pressable
          style={rowButtonStyle}
          onPress={handleNewChat}
          testID="sidebar-panel-new-chat"
          accessible
          accessibilityRole="button"
          accessibilityLabel={t(builtinSidebarNavLabelKey("new-chat"))}
        >
          {({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => (
            <>
              <ThemedMessageSquarePlus
                size={16}
                uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
              />
              <Text style={[styles.label, hovered && styles.labelHighlighted]} numberOfLines={1}>
                {t(builtinSidebarNavLabelKey("new-chat"))}
              </Text>
            </>
          )}
        </Pressable>
      ) : (
        <View style={styles.rowButtonSpacer} />
      )}
      {showNewWorkspace ? (
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Pressable
              style={plusButtonStyle}
              onPress={handleNewWorkspace}
              testID="sidebar-panel-new-workspace"
              accessible
              accessibilityRole="button"
              accessibilityLabel={t(builtinSidebarNavLabelKey("new-workspace"))}
            >
              {({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => (
                <ThemedPlus
                  size={16}
                  uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
                />
              )}
            </Pressable>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" offset={8}>
            <View style={styles.tooltipRow}>
              <Text style={styles.tooltipText}>
                {t(builtinSidebarNavLabelKey("new-workspace"))}
              </Text>
              {newWorkspaceShortcut ? <Shortcut chord={newWorkspaceShortcut} /> : null}
            </View>
          </TooltipContent>
        </Tooltip>
      ) : null}
    </View>
  );
}

function rowButtonStyle({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.rowButton, hovered && styles.rowButtonHovered];
}

function plusButtonStyle({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.plusButton, hovered && styles.plusButtonHovered];
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  rowButton: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    height: 30,
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  rowButtonSpacer: {
    flex: 1,
  },
  rowButtonHovered: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  label: {
    minWidth: 0,
    flexShrink: 1,
    fontSize: 13.5,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foregroundMuted,
  },
  labelHighlighted: {
    color: theme.colors.foreground,
  },
  plusButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
    flexShrink: 0,
  },
  plusButtonHovered: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  tooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  tooltipText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.popoverForeground,
  },
}));
