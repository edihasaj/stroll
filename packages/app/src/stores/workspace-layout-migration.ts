import type { StateStorage } from "zustand/middleware";
import type { z } from "zod";
import { findPaneById, type WorkspaceLayout } from "@/stores/workspace-layout-actions";
import { EXPLORER_SIDEBAR_PANE_ID } from "@/stores/workspace-layout-constants";
import type { WorkspaceLayoutIdSource } from "@/stores/workspace-layout-ids";
import type { WorkspaceLayoutPersistedStateSchema } from "@/stores/workspace-layout-storage";
import { collapseToSingleChat, resolveSidePane } from "@/workspace-tabs/single-chat";

export type WorkspaceLayoutPersistedState = z.infer<typeof WorkspaceLayoutPersistedStateSchema>;

/** Where the raw blob is kept before the single-chat migration rewrites it. */
export const WORKSPACE_LAYOUT_PRE_SINGLE_CHAT_BACKUP_KEY = "workspace-layout-state.v2-backup";

/** The persisted layout version that introduced one chat in the main view. */
export const SINGLE_CHAT_LAYOUT_VERSION = 3;

/**
 * Version 3: every workspace keeps one chat in the main pane and everything else moves to one side
 * pane. This changes layout trees and the remembered side pane id only; the schema gains no key.
 * Tabs are moved, never closed, so browsers keep their webviews and chats stay in the sidebar.
 */
export function collapsePersistedLayoutsToSingleChat(
  state: WorkspaceLayoutPersistedState,
  ids: WorkspaceLayoutIdSource,
): WorkspaceLayoutPersistedState {
  const layoutByWorkspace: Record<string, WorkspaceLayout> = {};
  const sidePaneIdByWorkspace = { ...state.sidePaneIdByWorkspace };
  for (const [workspaceKey, layout] of Object.entries(state.layoutByWorkspace)) {
    const registeredExplorerPaneId =
      state.explorerPaneIdByWorkspace?.[workspaceKey] ??
      state.explorerSidebarPaneIdByWorkspace?.[workspaceKey] ??
      null;
    const explorerPaneId =
      findPaneById(layout.root, registeredExplorerPaneId)?.id ?? EXPLORER_SIDEBAR_PANE_ID;
    const collapsed = collapseToSingleChat({
      layout,
      sidePaneId: state.sidePaneIdByWorkspace?.[workspaceKey],
      explorerPaneId,
      createNodeId: ids.createNodeId,
    });
    layoutByWorkspace[workspaceKey] = collapsed;
    sidePaneIdByWorkspace[workspaceKey] =
      resolveSidePane(collapsed.root, explorerPaneId)?.id ?? null;
  }
  return { ...state, layoutByWorkspace, sidePaneIdByWorkspace };
}

/** A blob that is not JSON counts as current: the validated storage discards it, nothing to save. */
function persistedVersionOf(raw: string): number {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return Number.POSITIVE_INFINITY;
  }
  if (typeof parsed === "object" && parsed !== null && "version" in parsed) {
    return typeof parsed.version === "number" ? parsed.version : 0;
  }
  return 0;
}

interface PreMigrationBackupInput {
  storage: StateStorage;
  backupKey: string;
  /** The blob is saved only while its version is below this one. */
  beforeVersion: number;
  /** Evaluated at read time; a platform that skips the migration keeps no backup. */
  enabled: () => boolean;
}

/**
 * Copies the raw persisted blob to `backupKey` the first time an older one is read, before the
 * persist middleware migrates and overwrites it. A backup that exists is never replaced, so a later
 * failed attempt cannot clobber the original. Failing to write it must not block loading layouts.
 */
export function withPreMigrationBackup(input: PreMigrationBackupInput): StateStorage {
  const { storage, backupKey, beforeVersion, enabled } = input;
  return {
    getItem: async (name) => {
      const raw = await storage.getItem(name);
      if (raw === null || !enabled() || persistedVersionOf(raw) >= beforeVersion) {
        return raw;
      }
      try {
        if ((await storage.getItem(backupKey)) === null) {
          await storage.setItem(backupKey, raw);
        }
      } catch (error) {
        console.warn("[WorkspaceLayout] Could not back up the layout before migrating", error);
      }
      return raw;
    },
    setItem: (name, value) => storage.setItem(name, value),
    removeItem: (name) => storage.removeItem(name),
  };
}
