import { useCallback, useMemo } from "react";
import { Folder } from "lucide-react-native";
import invariant from "tiny-invariant";
import { FileExplorerPane } from "@/components/file-explorer-pane";
import { usePaneContext } from "@/panels/pane-context";
import { definePanel, type PanelDescriptor } from "@/panels/panel-registry";
import { buildAbsoluteExplorerPath } from "@/utils/explorer-paths";

function useFolderPanelDescriptor(target: { kind: "folder"; path: string }): PanelDescriptor {
  const folderName = target.path.split("/").findLast(Boolean) ?? target.path;
  return {
    label: folderName,
    subtitle: target.path,
    tooltip: target.path,
    titleState: "ready",
    icon: Folder,
    statusBucket: null,
  };
}

/**
 * A standalone folder browser — opened from a directory link that lands outside the current
 * workspace (or when there is no workspace at all). Renders the same FileExplorerPane the
 * Explorer's Files view uses, rooted at the folder instead of a workspace, with no workspaceId —
 * its explorer state key is `root:<path>` (see buildWorkspaceExplorerStateKey), independent of
 * any workspace's own Files state.
 */
function FolderPanel() {
  const { serverId, target, openPreferredTarget, openTargetToSide } = usePaneContext();
  invariant(target.kind === "folder", "FolderPanel requires a folder target");
  const folderPath = target.path;

  // Explorer entry paths are relative to the folder, and a relative file tab resolves against the
  // workspace root, so the tab gets the absolute path.
  const toAbsolute = useCallback(
    (entryPath: string) => buildAbsoluteExplorerPath({ workspaceRoot: folderPath, entryPath }),
    [folderPath],
  );
  const onOpenFile = useCallback(
    (path: string) =>
      openPreferredTarget({ kind: "file", path: toAbsolute(path) }, "explorerFiles"),
    [openPreferredTarget, toAbsolute],
  );
  const onOpenFileToSide = useCallback(
    (path: string) => openTargetToSide?.({ kind: "file", path: toAbsolute(path) }),
    [openTargetToSide, toAbsolute],
  );
  const explorerProps = useMemo(
    () => ({
      serverId,
      workspaceRoot: folderPath,
      onOpenFile,
      onOpenFileToSide: openTargetToSide ? onOpenFileToSide : undefined,
    }),
    [folderPath, onOpenFile, onOpenFileToSide, openTargetToSide, serverId],
  );

  return <FileExplorerPane {...explorerProps} />;
}

export const folderPanelRegistration = definePanel("folder", {
  component: FolderPanel,
  useDescriptor: useFolderPanelDescriptor,
});
