import { useCallback, useMemo, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { withUnistyles } from "react-native-unistyles";
import { ChevronsDownUp, ChevronsUpDown } from "lucide-react-native";
import { ContextMenuItem } from "@/components/ui/context-menu";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { useSidebarWorkspaceChats } from "@/components/sidebar/use-sidebar-workspace-chats";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";
import type { Theme } from "@/styles/theme";

const ThemedChevronsDownUp = withUnistyles(ChevronsDownUp);
const ThemedChevronsUpDown = withUnistyles(ChevronsUpDown);
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/**
 * Hide or show a workspace's chat list. Offered only while the workspace has chats, and it lives
 * in the workspace menu so rows without chats carry nothing extra.
 */
export function SidebarWorkspaceChatsMenuItem({
  surface,
  workspaceKey,
  serverId,
  workspaceId,
}: {
  surface: "context" | "dropdown";
  workspaceKey: string;
  serverId: string;
  workspaceId: string;
}): ReactElement | null {
  const { t } = useTranslation();
  const chats = useSidebarWorkspaceChats({ serverId, workspaceId });
  const collapsed = useSidebarCollapsedSectionsStore((state) =>
    state.collapsedWorkspaceChatKeys.has(workspaceKey),
  );
  const toggle = useSidebarCollapsedSectionsStore((state) => state.toggleWorkspaceChatsCollapsed);
  const leading = useMemo(
    () =>
      collapsed ? (
        <ThemedChevronsUpDown size={14} uniProps={foregroundMutedColorMapping} />
      ) : (
        <ThemedChevronsDownUp size={14} uniProps={foregroundMutedColorMapping} />
      ),
    [collapsed],
  );
  const onSelect = useCallback(() => toggle(workspaceKey), [toggle, workspaceKey]);
  if (chats.length === 0) {
    return null;
  }
  const label = collapsed ? t("sidebar.workspace.chats.show") : t("sidebar.workspace.chats.hide");
  const testID = `sidebar-workspace-menu-toggle-chats-${workspaceKey}`;
  if (surface === "context") {
    return (
      <ContextMenuItem testID={testID} leading={leading} onSelect={onSelect}>
        {label}
      </ContextMenuItem>
    );
  }
  return (
    <DropdownMenuItem testID={testID} leading={leading} onSelect={onSelect}>
      {label}
    </DropdownMenuItem>
  );
}
