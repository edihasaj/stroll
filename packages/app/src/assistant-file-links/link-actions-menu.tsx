import { useCallback, useMemo, type ReactElement } from "react";
import { withUnistyles } from "react-native-unistyles";
import {
  ArrowRightToLine,
  Copy,
  ExternalLink,
  FolderOpen,
  SquareArrowOutUpRight,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import * as Clipboard from "expo-clipboard";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import {
  coerceEventPoint,
  ContextMenuContent,
  ContextMenuItem,
  useContextMenu,
} from "@/components/ui/context-menu";
import { useIsLocalDaemon } from "@/hooks/use-is-local-daemon";
import { openDesktopTarget, useDesktopOpenTargets } from "@/workspace/desktop-open-targets";
import type { InlinePathTarget } from "./parse";

export interface LinkActionsMenuGesture {
  onLongPress: (event: unknown) => void;
  onContextMenu: (event: unknown) => void;
}

/**
 * Opens the menu by calling `setAnchorRect`/`setOpen` directly, at the gesture's point, instead
 * of through a `ContextMenuTrigger` — that trigger wraps its children in a View, which breaks a
 * link rendered as a native leaf span (iOS UITextView) or anything else that can't tolerate an
 * extra wrapping view. Must be called from a descendant of `<ContextMenu>`.
 */
export function useLinkActionsMenuGesture(): LinkActionsMenuGesture {
  const ctx = useContextMenu();
  const openMenuAt = useCallback(
    (event: unknown) => {
      const point = coerceEventPoint(event);
      if (!point) {
        return;
      }
      ctx.setAnchorRect({ x: point.pageX, y: point.pageY, width: 0, height: 0 });
      ctx.setOpen(true);
    },
    [ctx],
  );
  const handleContextMenu = useCallback(
    (event: unknown) => {
      if (typeof event === "object" && event !== null) {
        const preventDefault = Reflect.get(event, "preventDefault");
        const stopPropagation = Reflect.get(event, "stopPropagation");
        if (typeof preventDefault === "function") preventDefault.call(event);
        if (typeof stopPropagation === "function") stopPropagation.call(event);
      }
      openMenuAt(event);
    },
    [openMenuAt],
  );
  return { onLongPress: openMenuAt, onContextMenu: handleContextMenu };
}

function foregroundMutedColorMapping(theme: Theme) {
  return { color: theme.colors.foregroundMuted };
}

const ThemedOpenIcon = withUnistyles(SquareArrowOutUpRight);
const ThemedOpenToSideIcon = withUnistyles(ArrowRightToLine);
const ThemedRevealIcon = withUnistyles(FolderOpen);
const ThemedOpenInEditorIcon = withUnistyles(ExternalLink);
const ThemedCopyPathIcon = withUnistyles(Copy);

// Stable: every prop below is a module-scope constant, so these never need to be recreated.
const OPEN_ICON = <ThemedOpenIcon size={ICON_SIZE.sm} uniProps={foregroundMutedColorMapping} />;
const OPEN_TO_SIDE_ICON = (
  <ThemedOpenToSideIcon size={ICON_SIZE.sm} uniProps={foregroundMutedColorMapping} />
);
const REVEAL_ICON = <ThemedRevealIcon size={ICON_SIZE.sm} uniProps={foregroundMutedColorMapping} />;
const OPEN_IN_EDITOR_ICON = (
  <ThemedOpenInEditorIcon size={ICON_SIZE.sm} uniProps={foregroundMutedColorMapping} />
);
const COPY_PATH_ICON = (
  <ThemedCopyPathIcon size={ICON_SIZE.sm} uniProps={foregroundMutedColorMapping} />
);

function parentDirectoryOf(path: string): string {
  const trimmed = path.replace(/\/+$/, "");
  const lastSlash = trimmed.lastIndexOf("/");
  return lastSlash > 0 ? trimmed.slice(0, lastSlash) : "/";
}

export interface LinkActionsMenuContentProps {
  target: InlinePathTarget;
  serverId?: string;
  workspaceRoot?: string;
  onOpen: () => void;
  onOpenToSide: () => void;
  testIDPrefix?: string;
}

/**
 * Right-click (web/Electron) / long-press (native) actions for a file or folder link: Open,
 * Open to the side (files only), Reveal in <file manager>, Open in <editor> (desktop only, hidden
 * when no desktop bridge target is available), and Copy path. `onOpen`/`onOpenToSide` come from
 * the caller's own `useFileLink` so the menu reuses the exact same open path as a plain click.
 */
export function LinkActionsMenuContent({
  target,
  serverId,
  workspaceRoot,
  onOpen,
  onOpenToSide,
  testIDPrefix,
}: LinkActionsMenuContentProps): ReactElement {
  const { t } = useTranslation();
  const isLocalExecution = useIsLocalDaemon(serverId ?? "");
  const { targets } = useDesktopOpenTargets({ isLocalExecution });
  const fileManagerTarget = useMemo(
    () => targets.find((desktopTarget) => desktopTarget.kind === "file-manager"),
    [targets],
  );
  const editorTarget = useMemo(
    () => targets.find((desktopTarget) => desktopTarget.kind === "editor"),
    [targets],
  );
  const isDirectory = target.kind === "directory";
  const targetPath = target.path;
  const targetLineStart = target.lineStart;

  const handleReveal = useCallback(() => {
    if (!fileManagerTarget) {
      return;
    }
    void openDesktopTarget(
      isDirectory
        ? { editorId: fileManagerTarget.id, workspacePath: targetPath }
        : {
            editorId: fileManagerTarget.id,
            workspacePath: workspaceRoot ?? parentDirectoryOf(targetPath),
            filePath: targetPath,
          },
    );
  }, [fileManagerTarget, isDirectory, targetPath, workspaceRoot]);

  const handleOpenInEditor = useCallback(() => {
    if (!editorTarget) {
      return;
    }
    void openDesktopTarget(
      isDirectory
        ? { editorId: editorTarget.id, workspacePath: targetPath }
        : {
            editorId: editorTarget.id,
            workspacePath: workspaceRoot ?? parentDirectoryOf(targetPath),
            filePath: targetPath,
            line: targetLineStart,
          },
    );
  }, [editorTarget, isDirectory, targetLineStart, targetPath, workspaceRoot]);

  const handleCopyPath = useCallback(() => {
    void Clipboard.setStringAsync(targetPath);
  }, [targetPath]);

  const testID = testIDPrefix ? `${testIDPrefix}-context-menu` : undefined;
  const openTestID = testIDPrefix ? `${testIDPrefix}-open` : undefined;
  const openToSideTestID = testIDPrefix ? `${testIDPrefix}-open-to-side` : undefined;
  const revealTestID = testIDPrefix ? `${testIDPrefix}-reveal` : undefined;
  const openInEditorTestID = testIDPrefix ? `${testIDPrefix}-open-in-editor` : undefined;
  const copyPathTestID = testIDPrefix ? `${testIDPrefix}-copy-path` : undefined;

  return (
    <ContextMenuContent align="start" width={220} testID={testID}>
      <ContextMenuItem leading={OPEN_ICON} onSelect={onOpen} testID={openTestID}>
        {t("fileLinks.menu.open")}
      </ContextMenuItem>
      {!isDirectory ? (
        <ContextMenuItem
          leading={OPEN_TO_SIDE_ICON}
          onSelect={onOpenToSide}
          testID={openToSideTestID}
        >
          {t("workspace.fileActions.openToSide")}
        </ContextMenuItem>
      ) : null}
      {fileManagerTarget ? (
        <ContextMenuItem leading={REVEAL_ICON} onSelect={handleReveal} testID={revealTestID}>
          {t("workspace.fileActions.revealIn", { target: fileManagerTarget.label })}
        </ContextMenuItem>
      ) : null}
      {editorTarget ? (
        <ContextMenuItem
          leading={OPEN_IN_EDITOR_ICON}
          onSelect={handleOpenInEditor}
          testID={openInEditorTestID}
        >
          {t("workspace.fileActions.openIn", { target: editorTarget.label })}
        </ContextMenuItem>
      ) : null}
      <ContextMenuItem leading={COPY_PATH_ICON} onSelect={handleCopyPath} testID={copyPathTestID}>
        {t("workspace.fileActions.copyPath")}
      </ContextMenuItem>
    </ContextMenuContent>
  );
}
