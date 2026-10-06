import { buildStatusGroups } from "@/hooks/sidebar-status-view-model";
import {
  splitPinnedSidebarGroups,
  type PinnedSidebarGroups,
  type PinnedSidebarKeys,
} from "@/hooks/use-sidebar-pins";
import type {
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
} from "@/hooks/use-sidebar-workspaces-list";
import type { SidebarGroupMode } from "@/stores/sidebar-view-store";
import {
  resolveSidebarProjectIconTargets,
  type SidebarProjectIconTarget,
} from "@/utils/sidebar-project-row-model";
import {
  buildSidebarShortcutSections,
  type SidebarShortcutModel,
  type SidebarShortcutSection,
} from "@/utils/sidebar-shortcuts";
import {
  flattenVisibleNestedWorkspaces,
  groupWorkspacesByNesting,
  type WorkspaceParentMap,
} from "./workspace-nesting";
import {
  labelWorkspaceGroups,
  statusWorkspaceGroups,
  type SidebarWorkspaceGroup,
} from "./sidebar-labels";

const EMPTY_WORKSPACE_PARENTS: WorkspaceParentMap = new Map();
const EMPTY_EXPANDED_NESTED_KEYS: ReadonlySet<string> = new Set();

export interface SidebarProjection {
  pinnedGroups: PinnedSidebarGroups;
  workspaceGroups: SidebarWorkspaceGroup[];
  /**
   * The project icons this projection needs fetched, keyed by `projectViewKey` — one per project,
   * whatever the mode groups by. It sits here rather than beside `useProjectIcons` in the list
   * because it is the same `projects` the rows above are projected from: a mode that renders a
   * row can only ever ask for an icon this list already covers. It used to be derived in the
   * list, under a `groupMode === "status"` gate written when status was the only mode that put
   * icons on rows.
   */
  projectIconTargets: SidebarProjectIconTarget[];
  shortcutModel: SidebarShortcutModel;
}

export interface SidebarProjectionInput {
  projects: SidebarProjectEntry[];
  pinnedKeys: PinnedSidebarKeys;
  pinnedWorkspaceOrder: string[];
  workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
  projectNamesByViewKey: Map<string, string>;
  groupMode: SidebarGroupMode;
  pinnedCollapsed: boolean;
  collapsedProjectKeys: ReadonlySet<string>;
  collapsedWorkspaceGroupKeys: ReadonlySet<string>;
  /** Label display order; label mode renders one group per entry, in this order. */
  labelOrder: readonly string[];
  /** Translated header for the trailing unlabelled group. */
  chatsLabel: string;
  /**
   * Child workspace -> direct parent workspace (project mode only; see `buildWorkspaceGroups`).
   * Absent/empty means no workspace nests under another.
   */
  workspaceParents?: WorkspaceParentMap;
  /** Nested parent workspace keys currently expanded. Absent/empty means every parent is collapsed. */
  expandedNestedWorkspaceKeys?: ReadonlySet<string>;
}

export function buildSidebarProjection(input: SidebarProjectionInput): SidebarProjection {
  const pinnedGroups = splitPinnedSidebarGroups({
    projects: input.projects,
    keys: input.pinnedKeys,
    pinnedWorkspaceOrder: input.pinnedWorkspaceOrder,
  });
  const pinnedWorkspaceKeys = new Set(input.pinnedKeys.pinnedWorkspaceKeys);
  const unpinnedWorkspaces = Array.from(input.workspaceEntriesByKey.values()).filter(
    (workspace) => !pinnedWorkspaceKeys.has(workspace.workspaceKey),
  );
  // One switch decides both what the list groups by and what the keyboard shortcuts walk, so the
  // two cannot disagree and a new grouping mode is a compile error here rather than a silent
  // fall-through to the project rows.
  const workspaceGroups = buildWorkspaceGroups(input, unpinnedWorkspaces);

  const sections: SidebarShortcutSection[] = [];
  // Pinned chats are hoisted out of every project/group and shown flush, with no header of
  // their own to nest under — a pinned child still numbers and renders flat here. Project mode
  // is the only grouping that nests at all (see `buildWorkspaceGroups`'s doc comment).
  if (!input.pinnedCollapsed) {
    sections.push({ workspaces: pinnedGroups.pinnedChats });
  }
  if (input.groupMode === "project") {
    const workspaceParents = input.workspaceParents ?? EMPTY_WORKSPACE_PARENTS;
    const expandedNestedWorkspaceKeys =
      input.expandedNestedWorkspaceKeys ?? EMPTY_EXPANDED_NESTED_KEYS;
    sections.push(
      ...pinnedGroups.unpinnedProjects.map((project) => {
        const { topLevel, childrenByParentKey } = groupWorkspacesByNesting({
          workspaces: project.workspaces,
          parentByChildKey: workspaceParents,
        });
        return {
          // Parent, then its visible expanded children in order, so numbering reads top to
          // bottom the way the rows render; a collapsed parent's children consume no number.
          workspaces: flattenVisibleNestedWorkspaces({
            topLevel,
            childrenByParentKey,
            isExpanded: (workspaceKey) => expandedNestedWorkspaceKeys.has(workspaceKey),
          }),
          collapsed: input.collapsedProjectKeys.has(project.viewKey),
        };
      }),
    );
  } else {
    sections.push(
      ...workspaceGroups.map((group) => ({
        workspaces: group.rows,
        collapsed: input.collapsedWorkspaceGroupKeys.has(group.key),
      })),
    );
  }

  return {
    pinnedGroups,
    workspaceGroups,
    projectIconTargets: resolveSidebarProjectIconTargets(input.projects),
    shortcutModel: buildSidebarShortcutSections({ sections }),
  };
}

/**
 * Project mode keeps its project headers and groups nothing; status mode groups the rows by
 * status, and label mode groups them by label with the unlabelled rows in a trailing Chats group.
 *
 * Child-workspace nesting (a workspace whose root agent's parent lives in another workspace) is
 * project-mode-only, applied where `buildSidebarProjection` builds each project's section. Status
 * and label mode regroup every workspace by a status/label that has nothing to do with its
 * parent, so a nested child and its parent routinely land in different groups here — flattening
 * is correct for both, not a gap to close.
 */
function buildWorkspaceGroups(
  input: SidebarProjectionInput,
  unpinnedWorkspaces: SidebarWorkspaceEntry[],
): SidebarWorkspaceGroup[] {
  switch (input.groupMode) {
    case "project":
      return [];
    case "status":
      return statusWorkspaceGroups(
        buildStatusGroups(unpinnedWorkspaces, input.projectNamesByViewKey),
      );
    case "label":
      return labelWorkspaceGroups({
        workspaces: unpinnedWorkspaces,
        labelOrder: input.labelOrder,
        chatsLabel: input.chatsLabel,
      });
  }
}
