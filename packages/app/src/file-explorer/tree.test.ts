import { describe, expect, it, vi } from "vitest";
import type { ExplorerEntry } from "@/stores/session-store";
import {
  collectExplorerAncestorPaths,
  MAX_AUTO_EXPANDED_DIRECTORY_DEPTH,
  flattenExplorerTree,
  reconcileRestoredExpandedPaths,
  restoreExpandedDirectories,
  revealExplorerEntry,
  setExpandedDirectoryPath,
  showHiddenFilesAndRestoreExpandedDirectories,
} from "./tree";

function makeDirectoryEntry(name: string, path: string): ExplorerEntry {
  return {
    name,
    path,
    kind: "directory",
    size: 0,
    modifiedAt: "2026-01-01T00:00:00.000Z",
  };
}

describe("file explorer tree", () => {
  it("flattens a deeply expanded tree without consuming the call stack", () => {
    const depth = 10_000;
    const directories = new Map<string, { path: string; entries: ExplorerEntry[] }>();
    const expandedPaths = new Set<string>(["."]);
    let parentPath = ".";

    for (let index = 1; index <= depth; index += 1) {
      const childPath = `directory-${index}`;
      directories.set(parentPath, {
        path: parentPath,
        entries: [makeDirectoryEntry(childPath, childPath)],
      });
      expandedPaths.add(childPath);
      parentPath = childPath;
    }
    directories.set(parentPath, { path: parentPath, entries: [] });

    const rows = flattenExplorerTree({
      directories,
      expandedPaths,
      sortOption: "name",
      showHiddenFiles: true,
    });

    expect(rows).toHaveLength(depth);
    expect(rows[0]).toEqual({
      entry: makeDirectoryEntry("directory-1", "directory-1"),
      depth: 0,
    });
    expect(rows.at(-1)).toEqual({
      entry: makeDirectoryEntry(`directory-${depth}`, `directory-${depth}`),
      depth: depth - 1,
    });
  });

  it("flattens a large expanded directory without spreading its rows into the parent", () => {
    const fileCount = 150_000;
    const files = Array.from(
      { length: fileCount },
      (_, index): ExplorerEntry => ({
        name: `file-${index.toString().padStart(6, "0")}`,
        path: `generated/file-${index}`,
        kind: "file",
        size: index,
        modifiedAt: "2026-01-01T00:00:00.000Z",
      }),
    );
    const child = makeDirectoryEntry("generated", "generated");
    const directories = new Map([
      [".", { path: ".", entries: [child] }],
      ["generated", { path: "generated", entries: files }],
    ]);

    const rows = flattenExplorerTree({
      directories,
      expandedPaths: new Set([".", "generated"]),
      sortOption: "name",
      showHiddenFiles: true,
    });

    expect(rows).toHaveLength(fileCount + 1);
    expect(rows[0]).toEqual({ entry: child, depth: 0 });
    expect(rows.at(-1)).toEqual({ entry: files[fileCount - 1], depth: 1 });
  });

  it("restores five rendered directory levels rather than counting path segments", async () => {
    const paths = [
      "generated/cache/level-1",
      "generated/cache/level-1/level-2",
      "generated/cache/level-1/level-2/level-3",
      "generated/cache/level-1/level-2/level-3/level-4",
      "generated/cache/level-1/level-2/level-3/level-4/level-5",
      "generated/cache/level-1/level-2/level-3/level-4/level-5/level-6",
    ];
    const directories = new Map<string, { path: string; entries: ExplorerEntry[] }>();
    const rootDirectory = {
      path: ".",
      entries: [makeDirectoryEntry("level-1", paths[0])],
    };
    directories.set(".", rootDirectory);
    for (let index = 0; index < paths.length - 1; index += 1) {
      directories.set(paths[index], {
        path: paths[index],
        entries: [makeDirectoryEntry(`level-${index + 2}`, paths[index + 1])],
      });
    }

    const requestedPaths: string[] = [];
    const expandedPaths = await restoreExpandedDirectories({
      rootDirectory,
      persistedExpandedPaths: new Set(paths),
      showHiddenFiles: true,
      requestDirectoryListing: async (path) => {
        requestedPaths.push(path);
        return directories.get(path) ?? null;
      },
    });

    expect(MAX_AUTO_EXPANDED_DIRECTORY_DEPTH).toBe(5);
    expect(requestedPaths).toEqual(paths.slice(0, 5));
    expect(expandedPaths).toEqual([".", ...paths.slice(0, 5)]);
  });

  it("does not restore persisted descendants beneath a collapsed rendered directory", async () => {
    const rootDirectory = {
      path: ".",
      entries: [makeDirectoryEntry("parent", "parent")],
    };
    const requestedPaths: string[] = [];

    const expandedPaths = await restoreExpandedDirectories({
      rootDirectory,
      persistedExpandedPaths: new Set(["parent/child", "parent/child/grandchild"]),
      showHiddenFiles: true,
      requestDirectoryListing: async (path) => {
        requestedPaths.push(path);
        return null;
      },
    });

    expect(requestedPaths).toEqual([]);
    expect(expandedPaths).toEqual(["."]);
  });

  it("preserves expansion changes made while persisted directories are restoring", () => {
    const paths = reconcileRestoredExpandedPaths({
      persistedExpandedPaths: new Set([".", "parent", "parent/child"]),
      currentExpandedPaths: new Set([".", "parent/child", "manual"]),
      restoredExpandedPaths: [".", "parent"],
    });

    expect(paths).toEqual([".", "manual"]);
  });

  it("applies a directory click to the latest restored expansion paths", () => {
    const expanded = setExpandedDirectoryPath({
      currentExpandedPaths: [".", "restored"],
      directoryPath: "manual",
      expanded: true,
    });
    const collapsed = setExpandedDirectoryPath({
      currentExpandedPaths: expanded,
      directoryPath: "manual",
      expanded: false,
    });

    expect(expanded).toEqual([".", "restored", "manual"]);
    expect(collapsed).toEqual([".", "restored"]);
  });

  it("shows hidden files before waiting for expanded directories to restore", async () => {
    const rootDirectory = {
      path: ".",
      entries: [makeDirectoryEntry(".hidden", ".hidden")],
    };
    let resolveDirectory!: (directory: { path: string; entries: ExplorerEntry[] }) => void;
    const directoryListing = new Promise<{ path: string; entries: ExplorerEntry[] }>((resolve) => {
      resolveDirectory = resolve;
    });
    let hiddenFilesAreShown = false;

    const restoration = showHiddenFilesAndRestoreExpandedDirectories({
      rootDirectory,
      persistedExpandedPaths: new Set([".hidden"]),
      showHiddenFiles: () => {
        hiddenFilesAreShown = true;
      },
      requestDirectoryListing: () => directoryListing,
    });

    expect(hiddenFilesAreShown).toBe(true);
    resolveDirectory({ path: ".hidden", entries: [] });
    await expect(restoration).resolves.toEqual([".", ".hidden"]);
  });
});

describe("collectExplorerAncestorPaths", () => {
  it("returns every strict ancestor, root to leaf, excluding the entry itself", () => {
    expect(collectExplorerAncestorPaths("a/b/c.ts")).toEqual(["a", "a/b"]);
  });

  it("returns an empty list for a root-level entry", () => {
    expect(collectExplorerAncestorPaths("file.ts")).toEqual([]);
  });

  it("returns an empty list for the root path itself", () => {
    expect(collectExplorerAncestorPaths(".")).toEqual([]);
    expect(collectExplorerAncestorPaths("")).toEqual([]);
  });

  it("returns ancestors for a directory entry, excluding the directory itself", () => {
    expect(collectExplorerAncestorPaths("a/b")).toEqual(["a"]);
  });
});

describe("revealExplorerEntry", () => {
  it("loads every ancestor plus the entry itself, in parallel, skipping ones already loaded", async () => {
    const directories = new Map<string, { path: string; entries: ExplorerEntry[] }>([
      ["a", { path: "a", entries: [] }],
    ]);
    const requested: string[] = [];
    const requestDirectoryListing = vi.fn(async (path: string) => {
      requested.push(path);
      return { path, entries: [] };
    });
    const setExpandedPathsForWorkspace = vi.fn();

    await revealExplorerEntry({
      entryPath: "a/b/c.ts",
      directories,
      workspaceStateKey: "workspace:w1",
      requestDirectoryListing,
      setExpandedPathsForWorkspace,
    });

    expect(requested.toSorted()).toEqual(["a/b", "a/b/c.ts"]);
    expect(requestDirectoryListing).toHaveBeenCalledWith("a/b", {
      recordHistory: false,
      setCurrentPath: false,
    });
  });

  it("expands every ancestor plus the entry itself", async () => {
    const directories = new Map<string, { path: string; entries: ExplorerEntry[] }>();
    const requestDirectoryListing = vi.fn(async (path: string) => ({ path, entries: [] }));
    const setExpandedPathsForWorkspace = vi.fn();

    await revealExplorerEntry({
      entryPath: "a/b/c.ts",
      directories,
      workspaceStateKey: "workspace:w1",
      requestDirectoryListing,
      setExpandedPathsForWorkspace,
    });

    expect(setExpandedPathsForWorkspace).toHaveBeenCalledTimes(1);
    const [workspaceStateKey, updater] = setExpandedPathsForWorkspace.mock.calls[0] as [
      string,
      (current: string[]) => string[],
    ];
    expect(workspaceStateKey).toBe("workspace:w1");
    expect(new Set(updater(["."]))).toEqual(new Set([".", "a", "a/b", "a/b/c.ts"]));
  });

  it("expands a directory entry itself, not just its ancestors", async () => {
    const directories = new Map<string, { path: string; entries: ExplorerEntry[] }>([
      ["a", { path: "a", entries: [] }],
      ["a/b", { path: "a/b", entries: [] }],
    ]);
    const requestDirectoryListing = vi.fn(async (path: string) => ({ path, entries: [] }));
    const setExpandedPathsForWorkspace = vi.fn();

    await revealExplorerEntry({
      entryPath: "a/b",
      directories,
      workspaceStateKey: "workspace:w1",
      requestDirectoryListing,
      setExpandedPathsForWorkspace,
    });

    expect(requestDirectoryListing).not.toHaveBeenCalled();
    const [, updater] = setExpandedPathsForWorkspace.mock.calls[0] as [
      string,
      (current: string[]) => string[],
    ];
    expect(new Set(updater([]))).toEqual(new Set(["a", "a/b"]));
  });
});
