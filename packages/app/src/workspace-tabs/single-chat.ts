import { supportsDesktopPaneSplits, useIsCompactFormFactor } from "@/constants/layout";
import type {
  SplitNode,
  SplitPane,
  WorkspaceLayout,
  WorkspaceTabPlacement,
} from "@/stores/workspace-layout-actions";
import { DEFAULT_PANE_ID, EXPLORER_SIDEBAR_PANE_ID } from "@/stores/workspace-layout-constants";
import type { WorkspaceLayoutNodeIdPrefix } from "@/stores/workspace-layout-ids";
import type { WorkspaceTab, WorkspaceTabTarget } from "@/workspace-tabs/model";

/**
 * The workspace shows one chat in its main pane. Everything else opens in the side pane or the
 * Explorer dock. The store applies these rules only where `SINGLE_CHAT_MAIN_ENABLED` is on and the
 * device supports desktop pane splits in a non-compact layout.
 */
export const SINGLE_CHAT_MAIN_ENABLED = false;

/** Desktop only: compact windows and native layouts keep tabs in the main pane. */
export function isSingleChatMainActive(input: { isCompact: boolean }): boolean {
  return SINGLE_CHAT_MAIN_ENABLED && supportsDesktopPaneSplits() && !input.isCompact;
}

export function useIsSingleChatMain(): boolean {
  return isSingleChatMainActive({ isCompact: useIsCompactFormFactor() });
}

type PanePlacement = Extract<WorkspaceTabPlacement, { paneId: string }>;

interface PaneWithTabs extends SplitPane {
  tabs: WorkspaceTab[];
}

/** Layouts store each pane's tabs next to `tabIds`; the exported `SplitPane` type only names the ids. */
function hasTabs(pane: SplitPane): pane is PaneWithTabs {
  return "tabs" in pane && Array.isArray(pane.tabs);
}

function paneTabs(pane: SplitPane): WorkspaceTab[] {
  return hasTabs(pane) ? pane.tabs : [];
}

export function isChatTarget(target: WorkspaceTabTarget): boolean {
  return target.kind === "agent" || target.kind === "draft";
}

function isChatTab(tab: WorkspaceTab): boolean {
  return isChatTarget(tab.target);
}

function listPanes(node: SplitNode): SplitPane[] {
  if (node.kind === "pane") {
    return [node.pane];
  }
  return node.group.children.flatMap(listPanes);
}

function listOrdinaryPanes(root: SplitNode, explorerPaneId: string | null): SplitPane[] {
  return listPanes(root).filter((pane) => pane.id !== explorerPaneId);
}

/** The pane that holds the chat: the default pane, else the first ordinary pane in tree order. */
export function resolveMainPane(root: SplitNode, explorerPaneId: string | null): SplitPane | null {
  const panes = listOrdinaryPanes(root, explorerPaneId);
  return panes.find((pane) => pane.id === DEFAULT_PANE_ID) ?? panes[0] ?? null;
}

export function resolveSidePane(root: SplitNode, explorerPaneId: string | null): SplitPane | null {
  const mainPaneId = resolveMainPane(root, explorerPaneId)?.id;
  return listOrdinaryPanes(root, explorerPaneId).find((pane) => pane.id !== mainPaneId) ?? null;
}

interface SingleChatPlacementInput {
  root: SplitNode;
  target: WorkspaceTabTarget;
  placement: WorkspaceTabPlacement;
  explorerPaneId: string | null;
  /** Whether the target's panel can live in the Explorer dock. */
  supportsExplorer: boolean;
}

/**
 * Rewrites where an open lands. Chats go to the main pane. Every other target goes to the side
 * pane, except a target that asked for the Explorer dock and can live there. Returns `null` when
 * the destination pane does not exist yet; the caller creates the side pane and asks again.
 */
export function resolveSingleChatPlacement(input: SingleChatPlacementInput): PanePlacement | null {
  if (isChatTarget(input.target)) {
    const mainPane = resolveMainPane(input.root, input.explorerPaneId);
    return mainPane ? { mode: "pane", paneId: mainPane.id } : null;
  }
  const { placement } = input;
  const requestsPane = placement.mode === "pane" || placement.mode === "prefer";
  if (
    requestsPane &&
    input.supportsExplorer &&
    input.explorerPaneId !== null &&
    placement.paneId === input.explorerPaneId
  ) {
    return placement;
  }
  const sidePane = resolveSidePane(input.root, input.explorerPaneId);
  if (!sidePane) {
    return null;
  }
  return { mode: placement.mode === "pane" ? "pane" : "prefer", paneId: sidePane.id };
}

/** Whether the main pane already shows a chat, so a reconcile pass must not add another. */
export function mainPaneHasChat(root: SplitNode, explorerPaneId: string | null): boolean {
  const mainPane = resolveMainPane(root, explorerPaneId);
  return mainPane ? paneTabs(mainPane).some(isChatTab) : false;
}

/** The chat tab a new chat replaces in the pane it opens in, if any. */
export function findReplaceableChatTab(pane: SplitPane): WorkspaceTab | null {
  return paneTabs(pane).find(isChatTab) ?? null;
}

/** Chats stay in the main pane; everything else stays out of it. */
export function canMoveTabInSingleChat(input: {
  root: SplitNode;
  target: WorkspaceTabTarget;
  toPaneId: string;
  explorerPaneId: string | null;
}): boolean {
  const isMainDestination =
    resolveMainPane(input.root, input.explorerPaneId)?.id === input.toPaneId;
  return isChatTarget(input.target) === isMainDestination;
}

/**
 * Whether replacing a tab's target keeps the tab in a pane that suits the new target. A chat
 * slot only takes chats; a side or Explorer slot never takes one.
 */
export function canReplaceTabInSingleChat(input: {
  root: SplitNode;
  tabId: string;
  nextTarget: WorkspaceTabTarget;
  explorerPaneId: string | null;
}): boolean {
  const pane = listPanes(input.root).find((candidate) => candidate.tabIds.includes(input.tabId));
  if (!pane) {
    return true;
  }
  const isMainPane = resolveMainPane(input.root, input.explorerPaneId)?.id === pane.id;
  if (isMainPane) {
    return isChatTarget(input.nextTarget) || input.nextTarget.kind === "new_tab";
  }
  return !isChatTarget(input.nextTarget);
}

interface CollapseToSingleChatInput {
  layout: WorkspaceLayout;
  /** The remembered side pane, preferred as the home for moved tabs. */
  sidePaneId?: string | null;
  /** Defaults to the literal `"explorer"` pane id. */
  explorerPaneId?: string | null;
  createNodeId: (prefix: WorkspaceLayoutNodeIdPrefix) => string;
}

function pickKeptChat(
  layout: WorkspaceLayout,
  ordinaryPanes: SplitPane[],
  mainPane: SplitPane,
): WorkspaceTab | null {
  const focusedPane = ordinaryPanes.find((pane) => pane.id === layout.focusedPaneId);
  const focusedTab = focusedPane
    ? paneTabs(focusedPane).find((tab) => tab.tabId === focusedPane.focusedTabId)
    : undefined;
  if (focusedTab && isChatTab(focusedTab)) {
    return focusedTab;
  }
  const mainTabs = paneTabs(mainPane);
  const mainFocusedTab = mainTabs.find((tab) => tab.tabId === mainPane.focusedTabId);
  if (mainFocusedTab && isChatTab(mainFocusedTab)) {
    return mainFocusedTab;
  }
  return mainTabs.find(isChatTab) ?? ordinaryPanes.flatMap(paneTabs).find(isChatTab) ?? null;
}

function pickSidePane(
  ordinaryPanes: SplitPane[],
  mainPane: SplitPane,
  sidePaneId: string | null | undefined,
): SplitPane | null {
  const candidates = ordinaryPanes.filter((pane) => pane.id !== mainPane.id);
  return candidates.find((pane) => pane.id === sidePaneId) ?? candidates[0] ?? null;
}

function listMovableTabs(orderedPanes: SplitPane[]): WorkspaceTab[] {
  const seen = new Set<string>();
  const tabs: WorkspaceTab[] = [];
  for (const tab of orderedPanes.flatMap(paneTabs)) {
    const movable = !isChatTab(tab) && tab.target.kind !== "new_tab";
    if (movable && !seen.has(tab.tabId)) {
      seen.add(tab.tabId);
      tabs.push(tab);
    }
  }
  return tabs;
}

function pickSideFocusedTabId(input: {
  layout: WorkspaceLayout;
  ordinaryPanes: SplitPane[];
  sidePane: SplitPane | null;
  tabs: WorkspaceTab[];
}): string | null {
  const focusedPane = input.ordinaryPanes.find((pane) => pane.id === input.layout.focusedPaneId);
  const candidateIds = [focusedPane?.focusedTabId, input.sidePane?.focusedTabId];
  for (const tabId of candidateIds) {
    if (tabId && input.tabs.some((tab) => tab.tabId === tabId)) {
      return tabId;
    }
  }
  return input.tabs[input.tabs.length - 1]?.tabId ?? null;
}

function createPaneNode(input: {
  id: string;
  tabs: WorkspaceTab[];
  focusedTabId: string | null;
}): SplitNode {
  const pane: PaneWithTabs = {
    id: input.id,
    tabIds: input.tabs.map((tab) => tab.tabId),
    tabs: input.tabs,
    focusedTabId: input.focusedTabId,
  };
  return { kind: "pane", pane };
}

function equalSizes(count: number): number[] {
  return Array.from({ length: count }, () => 1 / count);
}

function isPlainMainSideGroup(input: {
  children: SplitNode[];
  explorerPaneId: string | null;
  mainPaneId: string;
  sidePaneId: string;
}): boolean {
  if (input.children.length !== 2) {
    return false;
  }
  const ordinaryIdsByChild = new Set(
    input.children.map((child) =>
      listOrdinaryPanes(child, input.explorerPaneId)
        .map((pane) => pane.id)
        .join(","),
    ),
  );
  return ordinaryIdsByChild.has(input.mainPaneId) && ordinaryIdsByChild.has(input.sidePaneId);
}

interface RebuildInput {
  explorerPaneId: string | null;
  mainNode: SplitNode;
  mainPaneId: string;
  sideNode: SplitNode | null;
  sidePaneId: string | null;
}

function rebuildNode(node: SplitNode, input: RebuildInput): SplitNode | null {
  if (node.kind === "pane") {
    if (node.pane.id === input.explorerPaneId) {
      return node;
    }
    if (node.pane.id === input.mainPaneId) {
      return input.mainNode;
    }
    return node.pane.id === input.sidePaneId ? input.sideNode : null;
  }
  const children = node.group.children
    .map((child) => rebuildNode(child, input))
    .filter((child): child is SplitNode => child !== null);
  if (children.length === 0) {
    return null;
  }
  if (children.length === 1) {
    return children[0];
  }
  const keepsExplorer = children.some(
    (child) => child.kind === "pane" && child.pane.id === input.explorerPaneId,
  );
  const keepsSizes =
    children.length === node.group.children.length &&
    (keepsExplorer ||
      (input.sidePaneId !== null &&
        isPlainMainSideGroup({
          children,
          explorerPaneId: input.explorerPaneId,
          mainPaneId: input.mainPaneId,
          sidePaneId: input.sidePaneId,
        })));
  return {
    kind: "group",
    group: {
      ...node.group,
      children,
      sizes: keepsSizes ? node.group.sizes : equalSizes(children.length),
    },
  };
}

function pruneParentTabMap(
  layout: WorkspaceLayout,
  root: SplitNode,
): Pick<WorkspaceLayout, "parentTabIdByTabId"> {
  const openTabIds = new Set(
    listPanes(root)
      .flatMap(paneTabs)
      .map((tab) => tab.tabId),
  );
  const entries = Object.entries(layout.parentTabIdByTabId ?? {}).filter(
    ([childTabId, parentTabId]) => openTabIds.has(childTabId) && openTabIds.has(parentTabId),
  );
  return entries.length > 0 ? { parentTabIdByTabId: Object.fromEntries(entries) } : {};
}

/**
 * Reduces a layout to one chat in the main pane and everything else in one side pane. Used by
 * the layout migration that introduces the single-chat main view. Tab ids and state survive; the
 * dropped chats stay in the sidebar and are neither closed nor archived. The Explorer pane, its
 * hidden flag, and its tabs are left alone, and group sizes survive only where the tree is a
 * plain main|side split.
 */
export function collapseToSingleChat(input: CollapseToSingleChatInput): WorkspaceLayout {
  const { layout } = input;
  const explorerPaneId = input.explorerPaneId ?? EXPLORER_SIDEBAR_PANE_ID;
  const ordinaryPanes = listOrdinaryPanes(layout.root, explorerPaneId);
  const mainPane = resolveMainPane(layout.root, explorerPaneId);
  if (!mainPane) {
    return layout;
  }

  const keptChat = pickKeptChat(layout, ordinaryPanes, mainPane);
  const existingSidePane = pickSidePane(ordinaryPanes, mainPane, input.sidePaneId);
  const orderedPanes = existingSidePane
    ? [existingSidePane, ...ordinaryPanes.filter((pane) => pane.id !== existingSidePane.id)]
    : ordinaryPanes;
  const sideTabs = listMovableTabs(orderedPanes);

  const mainNode = createPaneNode({
    id: mainPane.id,
    tabs: keptChat ? [keptChat] : [],
    focusedTabId: keptChat?.tabId ?? null,
  });
  const sidePaneId =
    sideTabs.length === 0 ? null : (existingSidePane?.id ?? input.createNodeId("pane"));
  const sideNode =
    sidePaneId === null
      ? null
      : createPaneNode({
          id: sidePaneId,
          tabs: sideTabs,
          focusedTabId: pickSideFocusedTabId({
            layout,
            ordinaryPanes,
            sidePane: existingSidePane,
            tabs: sideTabs,
          }),
        });

  const rebuilt = rebuildNode(layout.root, {
    explorerPaneId,
    mainNode,
    mainPaneId: mainPane.id,
    sideNode,
    sidePaneId,
  });
  let root = rebuilt ?? mainNode;
  if (sideNode && !existingSidePane) {
    root = {
      kind: "group",
      group: {
        id: input.createNodeId("group"),
        direction: "horizontal",
        children: [root, sideNode],
        sizes: [0.7, 0.3],
      },
    };
  }

  return {
    root,
    focusedPaneId: mainPane.id,
    ...pruneParentTabMap(layout, root),
  };
}
