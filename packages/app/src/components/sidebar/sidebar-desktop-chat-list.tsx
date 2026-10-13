import { useCallback, useMemo, useState, type Ref } from "react";
import { View } from "react-native";
import { useTranslation } from "react-i18next";
import { useStoreWithEqualityFn } from "zustand/traditional";
import { DraggableList } from "@/components/draggable-list";
import type { DraggableRenderItemInfo } from "@/components/draggable-list.types";
import { AdaptiveRenameModal } from "@/components/rename-modal";
import { useArchiveChat } from "@/hooks/use-archive-chat";
import { useDeleteChat } from "@/hooks/use-delete-chat";
import { useRenameChat } from "@/hooks/use-rename-chat";
import type { SidebarWorkspacePlacement } from "@/hooks/use-sidebar-workspaces-list";
import { useSessionStore } from "@/stores/session-store";
import { useSidebarDesktopStore } from "@/stores/sidebar-desktop-store";
import { navigateToAgent } from "@/utils/navigate-to-agent";
import { SidebarChatRow } from "./sidebar-chat-row";
import { selectSidebarWorkspaceChats, useFocusedChatId } from "./use-sidebar-workspace-chats";
import { isSameSidebarChat } from "./workspace-chats";
import { orderSidebarChats, type DesktopSidebarChat } from "./desktop-collections";

function Chat({ item, dragHandleProps }: DraggableRenderItemInfo<DesktopSidebarChat>) {
  const {
    role: _role,
    tabIndex: _tabIndex,
    "aria-roledescription": _description,
    ...dragAttributes
  } = dragHandleProps?.attributes ?? {};
  const { t } = useTranslation();
  const focused = useFocusedChatId(item.serverId);
  const archive = useArchiveChat(item.serverId);
  const remove = useDeleteChat({ serverId: item.serverId, workspaceId: item.workspaceId });
  const rename = useRenameChat(item.serverId);
  const [renaming, setRenaming] = useState(false);
  const open = useCallback(
    () =>
      navigateToAgent({ serverId: item.serverId, workspaceId: item.workspaceId, agentId: item.id }),
    [item],
  );
  const onRename = useCallback(() => setRenaming(true), []);
  const close = useCallback(() => setRenaming(false), []);
  const onArchive = useCallback(() => void archive(item.id), [archive, item.id]);
  const onDelete = useCallback(() => void remove({ agentId: item.id }), [remove, item.id]);
  const submitRename = useCallback((title: string) => rename(item.id, title), [rename, item.id]);
  return (
    <View
      {...dragAttributes}
      {...dragHandleProps?.listeners}
      ref={dragHandleProps?.setActivatorNodeRef as Ref<View> | undefined}
      style={CHAT_DRAG_STYLE}
    >
      <SidebarChatRow
        flat
        serverId={item.serverId}
        chat={item}
        selected={focused === item.id}
        untitledLabel={t("sidebar.workspace.chats.untitled")}
        onOpen={open}
        onRename={onRename}
        onArchive={onArchive}
        onDelete={onDelete}
      />
      {renaming ? (
        <AdaptiveRenameModal
          visible
          title={t("workspace.tabs.menu.renameAgent")}
          initialValue={item.title ?? ""}
          submitLabel={t("workspace.tabs.menu.rename")}
          maxLength={200}
          onClose={close}
          onSubmit={submitRename}
          testID={`sidebar-chat-rename-modal-${item.key}`}
        />
      ) : null}
    </View>
  );
}

const CHAT_DRAG_STYLE = { minWidth: 0, width: "100%" } as const;

function sameChats(left: DesktopSidebarChat[], right: DesktopSidebarChat[]): boolean {
  return (
    left.length === right.length &&
    left.every((chat, index) => {
      const other = right[index];
      return (
        other !== undefined &&
        chat.key === other.key &&
        chat.workspaceId === other.workspaceId &&
        isSameSidebarChat(chat, other)
      );
    })
  );
}

const chatKey = (chat: DesktopSidebarChat) => chat.key;
const renderChat = (info: DraggableRenderItemInfo<DesktopSidebarChat>) => <Chat {...info} />;

export function SidebarDesktopChatList({
  workspaces,
  testID,
}: {
  workspaces: readonly SidebarWorkspacePlacement[];
  testID: string;
}) {
  const sortOrder = useSidebarDesktopStore((state) => state.sortOrder);
  const chatOrder = useSidebarDesktopStore((state) => state.chatOrder);
  const setChatOrder = useSidebarDesktopStore((state) => state.setChatOrder);
  const chats = useStoreWithEqualityFn(
    useSessionStore,
    (state) =>
      workspaces.flatMap((workspace) =>
        selectSidebarWorkspaceChats(state, workspace).map((chat) => ({
          id: chat.id,
          title: chat.title,
          provider: chat.provider,
          bucket: chat.bucket,
          lastActivityAt: chat.lastActivityAt,
          serverId: workspace.serverId,
          workspaceId: workspace.workspaceId,
          key: `${workspace.serverId}:${chat.id}`,
        })),
      ),
    sameChats,
  );
  const ordered = useMemo(
    () => orderSidebarChats(chats, sortOrder, chatOrder),
    [chats, sortOrder, chatOrder],
  );
  const reorder = useCallback(
    (next: DesktopSidebarChat[]) => {
      const keys = next.map(chatKey);
      setChatOrder([...keys, ...chatOrder.filter((key) => !keys.includes(key))]);
    },
    [setChatOrder, chatOrder],
  );
  return (
    <View testID={testID}>
      <DraggableList
        data={ordered}
        keyExtractor={chatKey}
        renderItem={renderChat}
        onDragEnd={reorder}
        scrollEnabled={false}
        useDragHandle
      />
    </View>
  );
}
