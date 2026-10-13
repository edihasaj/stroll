import { describe, expect, it } from "vitest";
import {
  orderSidebarChats,
  partitionSidebarProjects,
  type DesktopSidebarChat,
} from "./desktop-collections";
import { sidebarProjectMembershipKey } from "@/stores/sidebar-desktop-store";
import type { SidebarProjectEntry } from "@/hooks/use-sidebar-workspaces-list";

function project(serverId: string): SidebarProjectEntry {
  return {
    viewKey: serverId,
    projectName: "notes",
    projectKind: "directory",
    iconWorkingDir: "/notes",
    hosts: [
      { serverId, projectId: "notes", iconWorkingDir: "/notes", worktreeSupport: "unsupported" },
    ],
    workspaces: [
      {
        workspaceKey: `${serverId}:w`,
        serverId,
        workspaceId: "w",
        projectViewKey: serverId,
        projectName: "notes",
        projectKind: "directory",
        workspaceKind: "directory",
        name: "notes",
      },
    ],
  };
}
function chat(key: string, lastActivityAt: number): DesktopSidebarChat {
  return {
    key,
    id: key,
    serverId: "host",
    workspaceId: "workspace",
    title: key,
    provider: "codex",
    bucket: "done",
    lastActivityAt,
  };
}

describe("desktop sidebar collections", () => {
  it("keeps discovered projects out of the explicit collection until added", () => {
    const projects = [project("a"), project("b")];
    const discovered = partitionSidebarProjects(projects, []);
    expect(discovered.managed).toEqual([]);
    expect(discovered.recents.map((workspace) => workspace.serverId)).toEqual(["a", "b"]);
    const selected = partitionSidebarProjects(projects, [
      sidebarProjectMembershipKey("b", "notes"),
    ]);
    expect(selected.managed).toEqual([projects[1]]);
    expect(selected.recents.map((workspace) => workspace.serverId)).toEqual(["a"]);
  });
  it("does not clear membership when a host is temporarily missing", () => {
    const keys = [sidebarProjectMembershipKey("b", "notes")];
    expect(partitionSidebarProjects([project("a")], keys).managed).toEqual([]);
    expect(partitionSidebarProjects([project("a"), project("b")], keys).managed).toHaveLength(1);
  });
  it("honors manual order and places unseen chats in activity order", () => {
    const chats = [chat("old", 1), chat("new", 3), chat("middle", 2)];
    expect(orderSidebarChats(chats, "updated", ["old"]).map((item) => item.key)).toEqual([
      "new",
      "middle",
      "old",
    ]);
    expect(orderSidebarChats(chats, "manual", ["old"]).map((item) => item.key)).toEqual([
      "old",
      "new",
      "middle",
    ]);
    expect(chats.map((item) => item.key)).toEqual(["old", "new", "middle"]);
  });
});
