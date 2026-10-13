import type {
  SidebarProjectEntry,
  SidebarWorkspacePlacement,
} from "@/hooks/use-sidebar-workspaces-list";
import type { SidebarSortOrder } from "@/stores/sidebar-desktop-store";
import { sidebarProjectMembershipKey } from "@/stores/sidebar-desktop-store";
import type { SidebarChat } from "./workspace-chats";

export interface DesktopSidebarChat extends SidebarChat {
  serverId: string;
  workspaceId: string;
  key: string;
}

export function partitionSidebarProjects(
  projects: readonly SidebarProjectEntry[],
  keys: readonly string[],
): {
  managed: SidebarProjectEntry[];
  recents: SidebarWorkspacePlacement[];
} {
  const selected = new Set(keys);
  const managed: SidebarProjectEntry[] = [];
  const recents: SidebarWorkspacePlacement[] = [];
  for (const project of projects) {
    if (
      project.hosts.some((host) =>
        selected.has(sidebarProjectMembershipKey(host.serverId, host.projectId)),
      )
    )
      managed.push(project);
    else recents.push(...project.workspaces);
  }
  return { managed, recents };
}

export function orderSidebarChats(
  chats: DesktopSidebarChat[],
  sortOrder: SidebarSortOrder,
  order: readonly string[],
): DesktopSidebarChat[] {
  const position = new Map(order.map((key, index) => [key, index]));
  return [...chats].sort((left, right) => {
    if (sortOrder === "manual") {
      const delta = (position.get(left.key) ?? Infinity) - (position.get(right.key) ?? Infinity);
      if (delta) return delta;
    }
    return right.lastActivityAt - left.lastActivityAt || left.key.localeCompare(right.key);
  });
}
