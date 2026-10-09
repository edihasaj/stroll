import { useMemo, type ReactElement } from "react";
import { Text } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Archive, Copy, Pencil, RotateCw, Trash2 } from "lucide-react-native";
import { DropdownMenuItem, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import type { ChatMenuLabels } from "@/screens/workspace/chat-menu";
import type { WorkspaceTabMenuEntry } from "@/screens/workspace/workspace-tab-menu";
import type { Theme } from "@/styles/theme";

const ThemedArchive = withUnistyles(Archive);
const ThemedCopy = withUnistyles(Copy);
const ThemedPencil = withUnistyles(Pencil);
const ThemedRotateCw = withUnistyles(RotateCw);
const ThemedTrash2 = withUnistyles(Trash2);

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const destructiveColorMapping = (theme: Theme) => ({ color: theme.colors.destructive });

const ICON_SIZE = 14;

type ChatMenuItemEntry = Extract<WorkspaceTabMenuEntry, { kind: "item" }>;

export function useChatMenuLabels(): ChatMenuLabels {
  const { t } = useTranslation();
  return useMemo(
    () => ({
      rename: t("workspace.tabs.menu.rename"),
      copyResumeCommand: t("workspace.tabs.menu.copyResumeCommand"),
      copyAgentId: t("workspace.tabs.menu.copyAgentId"),
      reloadAgent: t("workspace.tabs.menu.reloadAgent"),
      archiveChat: t("workspace.tabs.menu.archiveChat"),
      deleteChat: t("workspace.tabs.menu.deleteChat"),
    }),
    [t],
  );
}

function ChatMenuItem({ entry }: { entry: ChatMenuItemEntry }): ReactElement {
  const leading = useMemo(() => {
    switch (entry.icon) {
      case "copy":
        return <ThemedCopy size={ICON_SIZE} uniProps={mutedColorMapping} />;
      case "pencil":
        return <ThemedPencil size={ICON_SIZE} uniProps={mutedColorMapping} />;
      case "rotate-cw":
        return <ThemedRotateCw size={ICON_SIZE} uniProps={mutedColorMapping} />;
      case "archive":
        return <ThemedArchive size={ICON_SIZE} uniProps={mutedColorMapping} />;
      case "trash":
        return <ThemedTrash2 size={ICON_SIZE} uniProps={destructiveColorMapping} />;
      default:
        return undefined;
    }
  }, [entry.icon]);
  const trailing = useMemo(
    () => (entry.hint ? <Text style={styles.hint}>{entry.hint}</Text> : undefined),
    [entry.hint],
  );
  return (
    <DropdownMenuItem
      testID={entry.testID}
      destructive={entry.destructive}
      onSelect={entry.onSelect}
      leading={leading}
      trailing={trailing}
    >
      {entry.label}
    </DropdownMenuItem>
  );
}

/** Renders `buildChatMenuEntries` output inside a `DropdownMenuContent`. */
export function ChatMenuItems({
  entries,
}: {
  entries: readonly WorkspaceTabMenuEntry[];
}): ReactElement {
  return (
    <>
      {entries.map((entry) =>
        entry.kind === "separator" ? (
          <DropdownMenuSeparator key={entry.key} />
        ) : (
          <ChatMenuItem key={entry.key} entry={entry} />
        ),
      )}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  hint: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
