import { describe, expect, it } from "vitest";
import { removePaneFromSplitTree } from "@/components/split-container-explorer-tree";
import type { SplitNode } from "@/stores/workspace-layout-store";

const pane = (id: string): SplitNode => ({
  kind: "pane",
  pane: { id, tabIds: [], focusedTabId: null },
});
const group = (id: string, children: SplitNode[], sizes: number[]): SplitNode => ({
  kind: "group",
  group: { id, direction: "horizontal", children, sizes },
});

describe("removePaneFromSplitTree", () => {
  it("keeps the side pane's share when the Explorer sits in the nested workspace root", () => {
    const root = group(
      "outer",
      [group("workspace-root", [pane("main"), pane("explorer")], [0.78, 0.22]), pane("side")],
      [0.7, 0.3],
    );

    const rendered = removePaneFromSplitTree(root, "explorer");

    expect(rendered).toEqual(group("outer", [pane("main"), pane("side")], [0.7, 0.3]));
  });

  it("rescales the remaining children of the group that held the Explorer", () => {
    const root = group("root", [pane("main"), pane("side"), pane("explorer")], [0.5, 0.25, 0.25]);

    const rendered = removePaneFromSplitTree(root, "explorer");

    expect(rendered?.kind === "group" ? rendered.group.sizes : null).toEqual([2 / 3, 1 / 3]);
  });

  it("returns the same tree when the Explorer is not in it", () => {
    const root = group("root", [pane("main"), pane("side")], [0.7, 0.3]);

    expect(removePaneFromSplitTree(root, "explorer")).toBe(root);
  });
});
