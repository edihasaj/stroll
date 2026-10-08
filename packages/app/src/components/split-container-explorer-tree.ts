import type { SplitNode } from "@/stores/workspace-layout-store";

/**
 * The split tree the canvas renders: the layout without the docked Explorer pane. A group that
 * loses a child keeps its remaining children's proportions; every other group keeps its sizes,
 * so the side pane opens at its own share instead of half the canvas.
 */
export function removePaneFromSplitTree(node: SplitNode, paneId: string | null): SplitNode | null {
  if (!paneId) {
    return node;
  }
  if (node.kind === "pane") {
    return node.pane.id === paneId ? null : node;
  }

  const kept: { child: SplitNode; size: number }[] = [];
  let changed = false;
  node.group.children.forEach((child, index) => {
    const nextChild = removePaneFromSplitTree(child, paneId);
    if (nextChild !== child) changed = true;
    if (nextChild) kept.push({ child: nextChild, size: node.group.sizes[index] ?? 0 });
  });
  if (kept.length === 0) {
    return null;
  }
  if (kept.length === 1) {
    return kept[0]?.child ?? null;
  }
  if (!changed) {
    return node;
  }
  const total = kept.reduce((sum, entry) => sum + entry.size, 0);
  return {
    kind: "group",
    group: {
      ...node.group,
      children: kept.map((entry) => entry.child),
      sizes: kept.map((entry) => (total > 0 ? entry.size / total : 1 / kept.length)),
    },
  };
}
