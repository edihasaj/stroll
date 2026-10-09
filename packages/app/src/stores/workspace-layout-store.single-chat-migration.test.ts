import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@react-native-async-storage/async-storage", () => {
  const storage = new Map<string, string>();
  return {
    default: {
      getItem: vi.fn(async (key: string) => storage.get(key) ?? null),
      setItem: vi.fn(async (key: string, value: string) => {
        storage.set(key, value);
      }),
      removeItem: vi.fn(async (key: string) => {
        storage.delete(key);
      }),
    },
  };
});

import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  collectAllPanes,
  collectAllTabs,
  createWorkspaceLayoutStore,
  findPaneById,
  type SplitNode,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-store";
import { WorkspaceLayoutPersistedStateSchema } from "@/stores/workspace-layout-storage";
import { WORKSPACE_LAYOUT_PRE_SINGLE_CHAT_BACKUP_KEY } from "@/stores/workspace-layout-migration";
import type { WorkspaceTab, WorkspaceTabTarget } from "@/workspace-tabs/model";

const STORAGE_KEY = "workspace-layout-state";
const workspaceKey = "server:workspace";

function createIds() {
  let next = 0;
  return {
    createNodeId: (prefix: "pane" | "group") => `${prefix}_migrated_${++next}`,
    createFocusRestorationToken: () => `token_${++next}`,
  };
}

const desktopEnv = { singleChatMain: () => true, collapseSavedLayouts: () => true };
const nativeEnv = { singleChatMain: () => false, collapseSavedLayouts: () => false };

function tab(tabId: string, target: WorkspaceTabTarget): WorkspaceTab {
  return { tabId, target, createdAt: 1 };
}

function chat(agentId: string): WorkspaceTab {
  return tab(`agent_${agentId}`, { kind: "agent", agentId });
}

function draft(draftId: string): WorkspaceTab {
  return tab(`draft_${draftId}`, { kind: "draft", draftId });
}

function terminal(terminalId: string): WorkspaceTab {
  return tab(`terminal_${terminalId}`, { kind: "terminal", terminalId });
}

function file(path: string): WorkspaceTab {
  return tab(`file_${path}`, { kind: "file", path });
}

function browser(browserId: string): WorkspaceTab {
  return tab(`browser_${browserId}`, { kind: "browser", browserId });
}

function pane(
  id: string,
  tabs: WorkspaceTab[],
  options: { focusedTabId?: string | null; hidden?: boolean } = {},
): SplitNode {
  return {
    kind: "pane",
    pane: {
      id,
      tabIds: tabs.map((entry) => entry.tabId),
      focusedTabId: options.focusedTabId ?? tabs.at(-1)?.tabId ?? null,
      ...(options.hidden ? { hidden: true } : {}),
      tabs,
    },
  } as SplitNode;
}

function explorer(hidden = false): SplitNode {
  return pane(
    "explorer",
    [tab("files", { kind: "files" }), tab("changes_tree", { kind: "changes_tree" })],
    {
      focusedTabId: "files",
      hidden,
    },
  );
}

function group(id: string, children: SplitNode[], sizes: number[]): SplitNode {
  return { kind: "group", group: { id, direction: "horizontal", children, sizes } };
}

function layoutOf(root: SplitNode, focusedPaneId: string): WorkspaceLayout {
  return { root, focusedPaneId };
}

async function persist(input: {
  version: number;
  layout: WorkspaceLayout;
  sidePaneId?: string | null;
  extra?: Record<string, unknown>;
}) {
  await AsyncStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({
      state: {
        layoutByWorkspace: { [workspaceKey]: input.layout },
        splitSizesByWorkspace: {},
        explorerPaneIdByWorkspace: { [workspaceKey]: "explorer" },
        explorerSidebarWidthByWorkspace: {},
        sidePaneIdByWorkspace: input.sidePaneId ? { [workspaceKey]: input.sidePaneId } : {},
        ...input.extra,
      },
      version: input.version,
    }),
  );
}

async function loadMigrated(env = desktopEnv) {
  const store = createWorkspaceLayoutStore(createIds(), env);
  await store.persist.rehydrate();
  return store;
}

async function readPersisted() {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  return JSON.parse(raw ?? "{}") as { version: number; state: Record<string, unknown> };
}

function tabTargets(layout: WorkspaceLayout, paneId: string): string[] {
  const found = findPaneById(layout.root, paneId);
  return collectAllTabs(layout.root)
    .filter((entry) => found?.tabIds.includes(entry.tabId))
    .map((entry) => {
      const target = entry.target;
      if (target.kind === "agent") return `agent:${target.agentId}`;
      if (target.kind === "draft") return `draft:${target.draftId}`;
      if (target.kind === "terminal") return `terminal:${target.terminalId}`;
      if (target.kind === "browser") return `browser:${target.browserId}`;
      if (target.kind === "file") return `file:${target.path}`;
      return target.kind;
    });
}

async function expectPersistedSchemaValid() {
  const persisted = await readPersisted();
  expect(persisted.version).toBe(3);
  expect(WorkspaceLayoutPersistedStateSchema.safeParse(persisted.state).success).toBe(true);
}

describe("workspace layout version 3 migration", () => {
  beforeEach(async () => {
    await AsyncStorage.removeItem(STORAGE_KEY);
    await AsyncStorage.removeItem(WORKSPACE_LAYOUT_PRE_SINGLE_CHAT_BACKUP_KEY);
  });

  it("keeps the focused chat in main and moves the terminal and file into a new side pane", async () => {
    const main = pane("main", [chat("a"), chat("b"), terminal("t1"), file("src/a.ts")], {
      focusedTabId: "agent_b",
    });
    await persist({
      version: 2,
      layout: layoutOf(group("root", [main, explorer()], [0.78, 0.22]), "main"),
    });

    const store = await loadMigrated();

    const layout = store.getState().layoutByWorkspace[workspaceKey];
    const sidePaneId = store.getState().sidePaneIdByWorkspace[workspaceKey];
    expect(tabTargets(layout, "main")).toEqual(["agent:b"]);
    expect(sidePaneId).toBeTruthy();
    expect(tabTargets(layout, sidePaneId as string)).toEqual(["terminal:t1", "file:src/a.ts"]);
    expect(tabTargets(layout, "explorer")).toEqual(["files", "changes_tree"]);
    expect(layout.focusedPaneId).toBe("main");
    await vi.waitFor(expectPersistedSchemaValid);
  });

  it("keeps a browser in the side pane and the chat that was focused there", async () => {
    const main = pane("main", [chat("a"), chat("b")], { focusedTabId: "agent_a" });
    const side = pane("side", [browser("b1"), chat("c")], { focusedTabId: "agent_c" });
    await persist({
      version: 2,
      sidePaneId: "side",
      layout: layoutOf(
        group("root", [group("inner", [main, side], [0.6, 0.4]), explorer()], [0.78, 0.22]),
        "side",
      ),
    });

    const store = await loadMigrated();

    const layout = store.getState().layoutByWorkspace[workspaceKey];
    expect(tabTargets(layout, "main")).toEqual(["agent:c"]);
    expect(tabTargets(layout, "side")).toEqual(["browser:b1"]);
    expect(store.getState().sidePaneIdByWorkspace[workspaceKey]).toBe("side");
    expect(findPaneById(layout.root, "side")?.hidden).not.toBe(true);
    await vi.waitFor(expectPersistedSchemaValid);
  });

  it("flattens nested splits into one main pane and one side pane", async () => {
    const left = pane("main", [chat("a"), terminal("t1")], { focusedTabId: "agent_a" });
    const topRight = pane("pane-top", [file("src/a.ts"), chat("b")], {
      focusedTabId: "file_src/a.ts",
    });
    const bottomRight = pane("pane-bottom", [browser("b1")]);
    const rightColumn: SplitNode = {
      kind: "group",
      group: {
        id: "right-column",
        direction: "vertical",
        children: [topRight, bottomRight],
        sizes: [0.5, 0.5],
      },
    };
    await persist({
      version: 2,
      layout: layoutOf(
        group("root", [group("inner", [left, rightColumn], [0.5, 0.5]), explorer()], [0.78, 0.22]),
        "main",
      ),
    });

    const store = await loadMigrated();

    const layout = store.getState().layoutByWorkspace[workspaceKey];
    const ordinary = collectAllPanes(layout.root).filter((entry) => entry.id !== "explorer");
    expect(ordinary).toHaveLength(2);
    expect(tabTargets(layout, "main")).toEqual(["agent:a"]);
    const sidePaneId = store.getState().sidePaneIdByWorkspace[workspaceKey] as string;
    expect(tabTargets(layout, sidePaneId).sort()).toEqual([
      "browser:b1",
      "file:src/a.ts",
      "terminal:t1",
    ]);
    await vi.waitFor(expectPersistedSchemaValid);
  });

  it.each([
    ["hidden", true],
    ["visible", false],
  ])("leaves a %s Explorer and its tabs alone", async (_name, hidden) => {
    const main = pane("main", [chat("a"), terminal("t1")], { focusedTabId: "agent_a" });
    await persist({
      version: 2,
      layout: layoutOf(group("root", [main, explorer(hidden)], [0.78, 0.22]), "main"),
    });

    const store = await loadMigrated();

    const layout = store.getState().layoutByWorkspace[workspaceKey];
    expect(Boolean(findPaneById(layout.root, "explorer")?.hidden)).toBe(hidden);
    expect(tabTargets(layout, "explorer")).toEqual(["files", "changes_tree"]);
    expect(store.getState().explorerSidebarPaneIdByWorkspace[workspaceKey]).toBe("explorer");
  });

  it("migrates a workspace with no chats and leaves main on the launcher", async () => {
    const main = pane("main", [terminal("t1"), file("src/a.ts")], { focusedTabId: "terminal_t1" });
    await persist({
      version: 2,
      layout: layoutOf(group("root", [main, explorer()], [0.78, 0.22]), "main"),
    });

    const store = await loadMigrated();

    const layout = store.getState().layoutByWorkspace[workspaceKey];
    const sidePaneId = store.getState().sidePaneIdByWorkspace[workspaceKey] as string;
    expect(tabTargets(layout, "main")).toEqual(["new_tab"]);
    expect(tabTargets(layout, sidePaneId)).toEqual(["terminal:t1", "file:src/a.ts"]);
    await vi.waitFor(expectPersistedSchemaValid);
  });

  it("keeps a draft as the chat in main", async () => {
    const main = pane("main", [draft("d1"), terminal("t1")], { focusedTabId: "draft_d1" });
    await persist({
      version: 2,
      layout: layoutOf(group("root", [main, explorer()], [0.78, 0.22]), "main"),
    });

    const store = await loadMigrated();

    expect(tabTargets(store.getState().layoutByWorkspace[workspaceKey], "main")).toEqual([
      "draft:d1",
    ]);
  });

  it("does not run the version 1 migration again on a version 2 blob", async () => {
    const explorerWithFile = pane(
      "explorer",
      [
        tab("files", { kind: "files" }),
        tab("changes_tree", { kind: "changes_tree" }),
        file("kept-in-explorer.ts"),
      ],
      { focusedTabId: "files" },
    );
    const main = pane("main", [chat("a")]);
    await persist({
      version: 2,
      layout: layoutOf(group("root", [main, explorerWithFile], [0.78, 0.22]), "main"),
    });

    const store = await loadMigrated();

    expect(tabTargets(store.getState().layoutByWorkspace[workspaceKey], "explorer")).toEqual([
      "files",
      "changes_tree",
      "file:kept-in-explorer.ts",
    ]);
  });

  it("runs the version 1 and version 3 migrations in order on a raw version 1 blob", async () => {
    const main = pane("main", [chat("a"), chat("b")], { focusedTabId: "agent_a" });
    const legacyExplorer = pane(
      "explorer",
      [
        tab("files", { kind: "files" }),
        tab("changes_tree", { kind: "changes_tree" }),
        file("src/legacy.ts"),
      ],
      { focusedTabId: "file_src/legacy.ts", hidden: true },
    );
    await persist({
      version: 1,
      layout: layoutOf(group("root", [main, legacyExplorer], [0.6, 0.4]), "main"),
    });

    const store = await loadMigrated();

    const layout = store.getState().layoutByWorkspace[workspaceKey];
    const sidePaneId = store.getState().sidePaneIdByWorkspace[workspaceKey] as string;
    expect(tabTargets(layout, "main")).toEqual(["agent:a"]);
    expect(tabTargets(layout, sidePaneId)).toEqual(["file:src/legacy.ts"]);
    expect(tabTargets(layout, "explorer")).toEqual(["files", "changes_tree"]);
    await vi.waitFor(expectPersistedSchemaValid);
  });

  it("does not collapse layouts on a platform without desktop panes, but still versions them", async () => {
    const main = pane("main", [chat("a"), chat("b"), terminal("t1")], { focusedTabId: "agent_a" });
    const original = layoutOf(group("root", [main, explorer()], [0.78, 0.22]), "main");
    await persist({ version: 2, layout: original });

    const store = await loadMigrated(nativeEnv);

    const layout = store.getState().layoutByWorkspace[workspaceKey];
    expect(tabTargets(layout, "main")).toEqual(["agent:a", "agent:b", "terminal:t1"]);
    await vi.waitFor(expectPersistedSchemaValid);
    expect(await AsyncStorage.getItem(WORKSPACE_LAYOUT_PRE_SINGLE_CHAT_BACKUP_KEY)).toBeNull();
  });

  it("leaves an already migrated version 3 layout untouched and saves no backup", async () => {
    const main = pane("main", [chat("a"), chat("b")], { focusedTabId: "agent_a" });
    await persist({
      version: 3,
      layout: layoutOf(group("root", [main, explorer()], [0.78, 0.22]), "main"),
    });

    const store = await loadMigrated();

    expect(tabTargets(store.getState().layoutByWorkspace[workspaceKey], "main")).toEqual([
      "agent:a",
      "agent:b",
    ]);
    expect(await AsyncStorage.getItem(WORKSPACE_LAYOUT_PRE_SINGLE_CHAT_BACKUP_KEY)).toBeNull();
  });

  describe("backup", () => {
    it("saves the raw blob once before migrating", async () => {
      const main = pane("main", [chat("a"), chat("b")], { focusedTabId: "agent_a" });
      await persist({
        version: 2,
        layout: layoutOf(group("root", [main, explorer()], [0.78, 0.22]), "main"),
      });
      const raw = await AsyncStorage.getItem(STORAGE_KEY);

      await loadMigrated();

      expect(await AsyncStorage.getItem(WORKSPACE_LAYOUT_PRE_SINGLE_CHAT_BACKUP_KEY)).toBe(raw);
    });

    it("does not replace a backup that already exists", async () => {
      await AsyncStorage.setItem(WORKSPACE_LAYOUT_PRE_SINGLE_CHAT_BACKUP_KEY, "the first backup");
      const main = pane("main", [chat("a"), chat("b")]);
      await persist({
        version: 2,
        layout: layoutOf(group("root", [main, explorer()], [0.78, 0.22]), "main"),
      });

      await loadMigrated();

      expect(await AsyncStorage.getItem(WORKSPACE_LAYOUT_PRE_SINGLE_CHAT_BACKUP_KEY)).toBe(
        "the first backup",
      );
    });
  });
});
