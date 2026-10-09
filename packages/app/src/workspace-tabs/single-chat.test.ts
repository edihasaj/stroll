import { describe, expect, it } from "vitest";
import {
  collectAllTabs,
  type SplitNode,
  type SplitPane,
  type WorkspaceLayout,
} from "@/stores/workspace-layout-actions";
import type { WorkspaceTab, WorkspaceTabTarget } from "@/workspace-tabs/model";
import {
  canMoveTabInSingleChat,
  canReplaceTabInSingleChat,
  collapseToSingleChat,
  findReplaceableChatTab,
  isChatTarget,
  isSingleChatMainActive,
  mainPaneHasChat,
  resolveMainPane,
  resolveSingleChatPlacement,
  SINGLE_CHAT_MAIN_ENABLED,
} from "@/workspace-tabs/single-chat";

const agent = (agentId: string): WorkspaceTabTarget => ({ kind: "agent", agentId });
const terminal = (terminalId: string): WorkspaceTabTarget => ({ kind: "terminal", terminalId });
const file = (path: string): WorkspaceTabTarget => ({ kind: "file", path });
const browser = (browserId: string): WorkspaceTabTarget => ({ kind: "browser", browserId });

function tab(
  tabId: string,
  target: WorkspaceTabTarget,
  state?: WorkspaceTab["state"],
): WorkspaceTab {
  return { tabId, target, createdAt: 1, ...(state === undefined ? {} : { state }) };
}

interface PaneFixture extends SplitPane {
  tabs: WorkspaceTab[];
}

function pane(input: {
  id: string;
  tabs: WorkspaceTab[];
  focusedTabId?: string | null;
  hidden?: boolean;
}): SplitNode {
  const fixture: PaneFixture = {
    id: input.id,
    tabIds: input.tabs.map((entry) => entry.tabId),
    tabs: input.tabs,
    focusedTabId: input.focusedTabId ?? input.tabs[input.tabs.length - 1]?.tabId ?? null,
    ...(input.hidden === undefined ? {} : { hidden: input.hidden }),
  };
  return { kind: "pane", pane: fixture };
}

function group(input: {
  id: string;
  direction?: "horizontal" | "vertical";
  children: SplitNode[];
  sizes?: number[];
}): SplitNode {
  return {
    kind: "group",
    group: {
      id: input.id,
      direction: input.direction ?? "horizontal",
      children: input.children,
      sizes: input.sizes ?? input.children.map(() => 1 / input.children.length),
    },
  };
}

function explorer(hidden: boolean): SplitNode {
  return pane({
    id: "explorer",
    tabs: [tab("files", { kind: "files" }), tab("changes", { kind: "changes_tree" })],
    hidden: hidden ? true : undefined,
  });
}

function createIds() {
  let next = 0;
  return (prefix: "pane" | "group") => `${prefix}_new_${++next}`;
}

function collapse(layout: WorkspaceLayout, sidePaneId?: string) {
  return collapseToSingleChat({ layout, sidePaneId, createNodeId: createIds() });
}

function panesOf(
  node: SplitNode,
): Array<{ id: string; tabIds: string[]; focusedTabId: string | null }> {
  if (node.kind === "pane") {
    return [{ id: node.pane.id, tabIds: node.pane.tabIds, focusedTabId: node.pane.focusedTabId }];
  }
  return node.group.children.flatMap(panesOf);
}

function shape(node: SplitNode): unknown {
  if (node.kind === "pane") {
    return node.pane.id;
  }
  return { [node.group.id]: node.group.children.map(shape), sizes: node.group.sizes };
}

describe("single-chat rules", () => {
  it("is on, and never applies to a compact window", () => {
    expect(SINGLE_CHAT_MAIN_ENABLED).toBe(true);
    expect(isSingleChatMainActive({ isCompact: true })).toBe(false);
  });

  it("treats agents and drafts as chats", () => {
    expect(isChatTarget(agent("a"))).toBe(true);
    expect(isChatTarget({ kind: "draft", draftId: "d" })).toBe(true);
    for (const target of [
      terminal("t"),
      file("a.ts"),
      browser("b"),
      { kind: "new_tab" } as const,
      { kind: "provider_subagent", parentAgentId: "a", subagentId: "s" } as const,
      { kind: "subagents", parentAgentId: "a" } as const,
    ]) {
      expect(isChatTarget(target)).toBe(false);
    }
  });
});

describe("single-chat placement", () => {
  const root = group({
    id: "root",
    children: [
      group({
        id: "inner",
        children: [pane({ id: "main", tabs: [tab("chat", agent("a"))] }), explorer(true)],
      }),
      pane({ id: "side", tabs: [tab("term", terminal("t"))] }),
    ],
  });
  const base = { root, explorerPaneId: "explorer", supportsExplorer: true };

  it("sends a chat to the main pane whatever was requested", () => {
    for (const placement of [
      { mode: "ambient" },
      { mode: "focused" },
      { mode: "prefer", paneId: "side" },
      { mode: "pane", paneId: "explorer" },
    ] as const) {
      expect(resolveSingleChatPlacement({ ...base, target: agent("b"), placement })).toEqual({
        mode: "pane",
        paneId: "main",
      });
    }
  });

  it("sends everything else to the side pane and keeps the request strength", () => {
    expect(
      resolveSingleChatPlacement({
        ...base,
        target: file("a.ts"),
        placement: { mode: "ambient" },
      }),
    ).toEqual({ mode: "prefer", paneId: "side" });
    expect(
      resolveSingleChatPlacement({
        ...base,
        target: file("a.ts"),
        placement: { mode: "prefer", paneId: "main" },
      }),
    ).toEqual({ mode: "prefer", paneId: "side" });
    expect(
      resolveSingleChatPlacement({
        ...base,
        target: file("a.ts"),
        placement: { mode: "pane", paneId: "main" },
      }),
    ).toEqual({ mode: "pane", paneId: "side" });
  });

  it("honors a request for the Explorer dock only when the target can live there", () => {
    const placement = { mode: "pane", paneId: "explorer" } as const;
    expect(resolveSingleChatPlacement({ ...base, target: file("a.ts"), placement })).toEqual(
      placement,
    );
    expect(
      resolveSingleChatPlacement({
        ...base,
        target: file("a.ts"),
        placement,
        supportsExplorer: false,
      }),
    ).toEqual({ mode: "pane", paneId: "side" });
  });

  it("asks the caller to create the side pane when it does not exist", () => {
    const mainOnly = group({
      id: "root",
      children: [pane({ id: "main", tabs: [tab("chat", agent("a"))] }), explorer(true)],
    });
    expect(
      resolveSingleChatPlacement({
        ...base,
        root: mainOnly,
        target: terminal("t2"),
        placement: { mode: "ambient" },
      }),
    ).toBeNull();
  });

  it("finds the main pane by id, else the first ordinary pane", () => {
    expect(resolveMainPane(root, "explorer")?.id).toBe("main");
    const renamed = group({
      id: "root",
      children: [pane({ id: "left", tabs: [] }), pane({ id: "right", tabs: [] }), explorer(true)],
    });
    expect(resolveMainPane(renamed, "explorer")?.id).toBe("left");
  });
});

describe("single-chat main pane contents", () => {
  const chatTab = tab("chat", agent("a"));
  const root = group({
    id: "root",
    children: [
      pane({ id: "main", tabs: [chatTab] }),
      pane({ id: "side", tabs: [tab("term", terminal("t"))] }),
      explorer(false),
    ],
  });

  it("reports whether main already shows a chat", () => {
    expect(mainPaneHasChat(root, "explorer")).toBe(true);
    const launcher = group({
      id: "root",
      children: [pane({ id: "main", tabs: [tab("new", { kind: "new_tab" })] }), explorer(true)],
    });
    expect(mainPaneHasChat(launcher, "explorer")).toBe(false);
  });

  it("names the chat a new chat replaces", () => {
    const main = resolveMainPane(root, "explorer");
    expect(main && findReplaceableChatTab(main)).toEqual(chatTab);
  });

  it("keeps chats in main and everything else out of it when moving tabs", () => {
    const move = (target: WorkspaceTabTarget, toPaneId: string) =>
      canMoveTabInSingleChat({ root, target, toPaneId, explorerPaneId: "explorer" });
    expect(move(agent("b"), "main")).toBe(true);
    expect(move(agent("b"), "side")).toBe(false);
    expect(move(agent("b"), "explorer")).toBe(false);
    expect(move(terminal("t"), "side")).toBe(true);
    expect(move(terminal("t"), "explorer")).toBe(true);
    expect(move(terminal("t"), "main")).toBe(false);
  });

  it("keeps a replaced tab in a slot that suits the new target", () => {
    const replace = (tabId: string, nextTarget: WorkspaceTabTarget) =>
      canReplaceTabInSingleChat({ root, tabId, nextTarget, explorerPaneId: "explorer" });
    expect(replace("chat", agent("b"))).toBe(true);
    expect(replace("chat", { kind: "draft", draftId: "d" })).toBe(true);
    expect(replace("chat", terminal("t2"))).toBe(false);
    expect(replace("term", file("a.ts"))).toBe(true);
    expect(replace("term", agent("b"))).toBe(false);
    expect(replace("missing", agent("b"))).toBe(true);
  });
});

describe("collapseToSingleChat", () => {
  it("keeps the focused chat of a multi-chat main and moves terminal and file to a new side pane", () => {
    const explorerPane = explorer(true);
    const layout: WorkspaceLayout = {
      root: group({
        id: "workspace-root",
        children: [
          pane({
            id: "main",
            tabs: [
              tab("chat-a", agent("a")),
              tab("chat-b", agent("b")),
              tab("term", terminal("t"), { cwd: "/repo" }),
              tab("file", file("src/a.ts")),
              tab("chat-c", { kind: "draft", draftId: "c" }),
            ],
            focusedTabId: "chat-b",
          }),
          explorerPane,
        ],
        sizes: [0.78, 0.22],
      }),
      focusedPaneId: "main",
    };

    const result = collapse(layout);

    expect(shape(result.root)).toEqual({
      group_new_2: [{ "workspace-root": ["main", "explorer"], sizes: [0.78, 0.22] }, "pane_new_1"],
      sizes: [0.7, 0.3],
    });
    expect(panesOf(result.root)).toEqual([
      { id: "main", tabIds: ["chat-b"], focusedTabId: "chat-b" },
      { id: "explorer", tabIds: ["files", "changes"], focusedTabId: "changes" },
      { id: "pane_new_1", tabIds: ["term", "file"], focusedTabId: "file" },
    ]);
    expect(result.focusedPaneId).toBe("main");
    expect(collectAllTabs(result.root).find((entry) => entry.tabId === "term")).toEqual(
      tab("term", terminal("t"), { cwd: "/repo" }),
    );
  });

  it("moves a side pane's browser into the remembered side pane and keeps the two-pane sizes", () => {
    const layout: WorkspaceLayout = {
      root: group({
        id: "outer",
        children: [
          group({
            id: "inner",
            children: [pane({ id: "main", tabs: [tab("chat", agent("a"))] }), explorer(false)],
            sizes: [0.7, 0.3],
          }),
          pane({
            id: "side",
            tabs: [tab("browser", browser("b1")), tab("term", terminal("t"))],
            focusedTabId: "browser",
          }),
        ],
        sizes: [0.6, 0.4],
      }),
      focusedPaneId: "main",
    };

    const result = collapse(layout, "side");

    expect(shape(result.root)).toEqual(shape(layout.root));
    expect(panesOf(result.root)).toEqual([
      { id: "main", tabIds: ["chat"], focusedTabId: "chat" },
      { id: "explorer", tabIds: ["files", "changes"], focusedTabId: "changes" },
      { id: "side", tabIds: ["browser", "term"], focusedTabId: "browser" },
    ]);
  });

  it("flattens nested splits into main and one side pane, dropping other chats and sizes", () => {
    const layout: WorkspaceLayout = {
      root: group({
        id: "outer",
        children: [
          group({
            id: "tiles",
            children: [
              pane({
                id: "main",
                tabs: [tab("chat-a", agent("a")), tab("chat-b", agent("b"))],
                focusedTabId: "chat-a",
              }),
              group({
                id: "stack",
                direction: "vertical",
                children: [
                  pane({
                    id: "p2",
                    tabs: [tab("term", terminal("t")), tab("chat-c", agent("c"))],
                    focusedTabId: "term",
                  }),
                  pane({ id: "p3", tabs: [tab("file", file("a.ts"))] }),
                  pane({ id: "p4", tabs: [tab("diff", { kind: "working_diff" })] }),
                ],
                sizes: [0.2, 0.3, 0.5],
              }),
            ],
            sizes: [0.4, 0.6],
          }),
          explorer(true),
        ],
        sizes: [0.78, 0.22],
      }),
      focusedPaneId: "p2",
    };

    const result = collapse(layout);

    expect(shape(result.root)).toEqual({
      outer: [{ tiles: ["main", "p2"], sizes: [0.4, 0.6] }, "explorer"],
      sizes: [0.78, 0.22],
    });
    expect(panesOf(result.root)).toEqual([
      { id: "main", tabIds: ["chat-a"], focusedTabId: "chat-a" },
      { id: "p2", tabIds: ["term", "file", "diff"], focusedTabId: "term" },
      { id: "explorer", tabIds: ["files", "changes"], focusedTabId: "changes" },
    ]);
    expect(result.focusedPaneId).toBe("main");
  });

  it("resets sizes of groups that lost panes outside a plain main|side split", () => {
    const layout: WorkspaceLayout = {
      root: group({
        id: "row",
        children: [
          pane({ id: "main", tabs: [tab("chat", agent("a"))] }),
          pane({ id: "side", tabs: [tab("term", terminal("t"))] }),
          pane({ id: "third", tabs: [tab("file", file("a.ts"))] }),
        ],
        sizes: [0.2, 0.3, 0.5],
      }),
      focusedPaneId: "main",
    };

    const result = collapse(layout);

    expect(shape(result.root)).toEqual({ row: ["main", "side"], sizes: [0.5, 0.5] });
    expect(panesOf(result.root)[1]).toEqual({
      id: "side",
      tabIds: ["term", "file"],
      focusedTabId: "term",
    });
  });

  it("leaves a visible Explorer and its tabs alone, moving none of them", () => {
    const explorerPane = pane({
      id: "explorer",
      tabs: [
        tab("files", { kind: "files" }),
        tab("changes", { kind: "changes_tree" }),
        tab("term-dock", terminal("dock")),
      ],
      focusedTabId: "term-dock",
    });
    const layout: WorkspaceLayout = {
      root: group({
        id: "root",
        children: [pane({ id: "main", tabs: [tab("chat", agent("a"))] }), explorerPane],
        sizes: [0.7, 0.3],
      }),
      focusedPaneId: "main",
    };

    const result = collapse(layout);

    expect(result.root).toEqual(layout.root);
  });

  it("honors an Explorer pane registered under a generated id", () => {
    const layout: WorkspaceLayout = {
      root: group({
        id: "root",
        children: [
          pane({ id: "main", tabs: [tab("chat", agent("a")), tab("term", terminal("t"))] }),
          pane({ id: "pane_dock", tabs: [tab("files", { kind: "files" })], hidden: true }),
        ],
        sizes: [0.78, 0.22],
      }),
      focusedPaneId: "main",
    };

    const result = collapseToSingleChat({
      layout,
      explorerPaneId: "pane_dock",
      createNodeId: createIds(),
    });

    expect(panesOf(result.root).map((entry) => [entry.id, entry.tabIds])).toEqual([
      ["main", ["chat"]],
      ["pane_dock", ["files"]],
      ["pane_new_1", ["term"]],
    ]);
  });

  it("keeps no chat and lists every other tab in the side pane when there are no chats", () => {
    const layout: WorkspaceLayout = {
      root: group({
        id: "root",
        children: [
          pane({ id: "main", tabs: [tab("term", terminal("t"))] }),
          pane({ id: "side", tabs: [tab("file", file("a.ts"))] }),
          explorer(true),
        ],
      }),
      focusedPaneId: "main",
    };

    const result = collapse(layout, "side");

    expect(panesOf(result.root)).toEqual([
      { id: "main", tabIds: [], focusedTabId: null },
      { id: "side", tabIds: ["file", "term"], focusedTabId: "term" },
      { id: "explorer", tabIds: ["files", "changes"], focusedTabId: "changes" },
    ]);
    expect(mainPaneHasChat(result.root, "explorer")).toBe(false);
  });

  it("keeps main's chat and selects the side tab when the side pane has focus", () => {
    const layout: WorkspaceLayout = {
      root: group({
        id: "root",
        children: [
          pane({
            id: "main",
            tabs: [tab("chat-a", agent("a")), tab("chat-b", agent("b"))],
            focusedTabId: "chat-a",
          }),
          pane({
            id: "side",
            tabs: [tab("browser", browser("b1")), tab("term", terminal("t"))],
            focusedTabId: "term",
          }),
          explorer(true),
        ],
      }),
      focusedPaneId: "side",
    };

    const result = collapse(layout, "side");

    expect(panesOf(result.root)).toEqual([
      { id: "main", tabIds: ["chat-a"], focusedTabId: "chat-a" },
      { id: "side", tabIds: ["browser", "term"], focusedTabId: "term" },
      { id: "explorer", tabIds: ["files", "changes"], focusedTabId: "changes" },
    ]);
    expect(result.focusedPaneId).toBe("main");
  });

  it("keeps a chat from a side pane when main has none", () => {
    const layout: WorkspaceLayout = {
      root: group({
        id: "root",
        children: [
          pane({ id: "main", tabs: [tab("term", terminal("t"))] }),
          pane({ id: "side", tabs: [tab("chat-a", agent("a"))] }),
        ],
      }),
      focusedPaneId: "main",
    };

    const result = collapse(layout);

    expect(panesOf(result.root)).toEqual([
      { id: "main", tabIds: ["chat-a"], focusedTabId: "chat-a" },
      { id: "side", tabIds: ["term"], focusedTabId: "term" },
    ]);
  });

  it("drops a side pane that holds nothing but chats and launchers", () => {
    const layout: WorkspaceLayout = {
      root: group({
        id: "root",
        children: [
          pane({ id: "main", tabs: [tab("chat-a", agent("a"))] }),
          pane({
            id: "side",
            tabs: [tab("chat-b", agent("b")), tab("new", { kind: "new_tab" })],
          }),
          explorer(true),
        ],
      }),
      focusedPaneId: "side",
    };

    const result = collapse(layout, "side");

    expect(shape(result.root)).toEqual({ root: ["main", "explorer"], sizes: [0.5, 0.5] });
  });

  it("prunes parent links to tabs that were dropped", () => {
    const layout: WorkspaceLayout = {
      root: group({
        id: "root",
        children: [
          pane({
            id: "main",
            tabs: [tab("chat-a", agent("a")), tab("chat-b", agent("b")), tab("file", file("a.ts"))],
            focusedTabId: "chat-a",
          }),
        ],
      }),
      focusedPaneId: "main",
      parentTabIdByTabId: { file: "chat-a", "chat-b": "chat-a" },
    };

    const result = collapse(layout);

    expect(result.parentTabIdByTabId).toEqual({ file: "chat-a" });
  });

  it("is idempotent", () => {
    const layout: WorkspaceLayout = {
      root: group({
        id: "root",
        children: [
          pane({ id: "main", tabs: [tab("chat-a", agent("a")), tab("term", terminal("t"))] }),
          explorer(true),
        ],
      }),
      focusedPaneId: "main",
    };

    const once = collapse(layout);
    const twice = collapse(once);

    expect(twice).toEqual(once);
  });
});
