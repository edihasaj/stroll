import AsyncStorage from "@react-native-async-storage/async-storage";
import { create } from "zustand";
import { persist } from "zustand/middleware";
import { z } from "zod";
import { createValidatedPersistStorage } from "@/storage/validated-persist-storage";

export type SidebarSortOrder = "manual" | "updated";
export function sidebarProjectMembershipKey(serverId: string, projectId: string): string {
  return JSON.stringify([serverId, projectId]);
}

const schema = z.object({
  projectKeys: z.array(z.string()).default([]),
  sortOrder: z.enum(["manual", "updated"]).default("updated"),
  chatOrder: z.array(z.string()).default([]),
  recentsCollapsed: z.boolean().default(false),
});

interface SidebarDesktopState extends z.infer<typeof schema> {
  addProject: (serverId: string, projectId: string) => void;
  removeProject: (keys: string[]) => void;
  setSortOrder: (order: SidebarSortOrder) => void;
  setChatOrder: (keys: string[]) => void;
  toggleRecents: () => void;
}

/** Desktop Projects is an explicit collection. Discovering a daemon project never adds it. */
export const useSidebarDesktopStore = create<SidebarDesktopState>()(
  persist(
    (set) => ({
      projectKeys: [],
      sortOrder: "updated",
      chatOrder: [],
      recentsCollapsed: false,
      addProject: (serverId, projectId) =>
        set((state) => ({
          projectKeys: [
            ...new Set([...state.projectKeys, sidebarProjectMembershipKey(serverId, projectId)]),
          ],
        })),
      removeProject: (keys) =>
        set((state) => ({ projectKeys: state.projectKeys.filter((key) => !keys.includes(key)) })),
      setSortOrder: (sortOrder) => set({ sortOrder }),
      setChatOrder: (chatOrder) => set({ chatOrder: [...new Set(chatOrder)], sortOrder: "manual" }),
      toggleRecents: () => set((state) => ({ recentsCollapsed: !state.recentsCollapsed })),
    }),
    {
      name: "sidebar-desktop-collections",
      storage: createValidatedPersistStorage(AsyncStorage, schema),
      partialize: ({ projectKeys, sortOrder, chatOrder, recentsCollapsed }) => ({
        projectKeys,
        sortOrder,
        chatOrder,
        recentsCollapsed,
      }),
    },
  ),
);
