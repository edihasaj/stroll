import { memo, useCallback, useMemo, type ReactElement } from "react";
import { Pressable, ScrollView, Text, View, type GestureResponderEvent } from "react-native";
import { useTranslation } from "react-i18next";
import { Users } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import invariant from "tiny-invariant";
import { usePaneContext } from "@/panels/pane-context";
import { definePanel, type PanelPresentation } from "@/panels/panel-registry";
import { getShortcutOs } from "@/utils/shortcut-platform";
import { isSubagentOpenAsTabClick, readSubagentClickModifiers } from "@/subagents/open-gesture";
import { useSubagentsForParent, type SubagentRow } from "@/subagents/select";
import { SubagentGlyph } from "@/subagents/subagent-glyph";
import { subagentGlyphSeed } from "@/subagents/subagent-glyph-model";
import {
  buildSubagentRowPresentationData,
  isSubagentRowActive,
} from "@/subagents/track-presentation";
import { useElapsedLabel } from "@/subagents/use-elapsed-label";
import { useOpenSubagent } from "@/subagents/use-open-subagent";

const ThemedUsers = withUnistyles(Users);

const subagentsPanelPresentation = {
  label: (t) => t("subagents.panel.title"),
  subtitle: (t) => t("subagents.panel.subtitle"),
  tooltip: (t) => t("subagents.panel.title"),
  icon: ThemedUsers,
} satisfies PanelPresentation;

const STATUS_TEXT_KEY = {
  running: "subagents.statusWorking",
  needs_input: "subagents.statusNeedsPermission",
  attention: "subagents.statusNeedsPermission",
  failed: "subagents.statusFailedGeneric",
  done: "subagents.statusDone",
} as const;

/**
 * The Subagents side-panel tab, as in Codex: the parent's subagents in Active and Done groups,
 * each with its glyph, name, status, and elapsed time. A row opens that subagent next to it;
 * ⌘/Ctrl- or middle-click opens it as a tab.
 */
function SubagentsPanel(): ReactElement {
  const { t } = useTranslation();
  const { serverId, workspaceId, target } = usePaneContext();
  invariant(target.kind === "subagents", "SubagentsPanel requires a subagents target");
  const rows = useSubagentsForParent({ serverId, parentAgentId: target.parentAgentId });
  const { active, done } = useMemo(() => {
    const activeRows: SubagentRow[] = [];
    const doneRows: SubagentRow[] = [];
    for (const row of rows) (isSubagentRowActive(row) ? activeRows : doneRows).push(row);
    return { active: activeRows, done: doneRows };
  }, [rows]);
  const { openSubagent, openProviderSubagent } = useOpenSubagent({ serverId, workspaceId });
  const handleOpen = useCallback(
    (row: SubagentRow, forceTab: boolean) => {
      if (row.kind === "paseo") openSubagent(row.id, { forceTab });
      else openProviderSubagent(row.parentAgentId, row.id, { forceTab });
    },
    [openProviderSubagent, openSubagent],
  );

  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{t("subagents.panel.empty")}</Text>
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Text style={styles.heading}>{t("subagents.panel.active", { count: active.length })}</Text>
      {active.length === 0 ? (
        <Text style={styles.noneText}>{t("subagents.panel.noActive")}</Text>
      ) : (
        active.map((row) => <SubagentPanelRow key={row.id} row={row} onOpen={handleOpen} />)
      )}
      {done.length > 0 ? (
        <>
          <Text style={[styles.heading, styles.headingSpaced]}>
            {t("subagents.panel.done", { count: done.length })}
          </Text>
          {done.map((row) => (
            <SubagentPanelRow key={row.id} row={row} onOpen={handleOpen} />
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const SubagentPanelRow = memo(function SubagentPanelRow({
  row,
  onOpen,
}: {
  row: SubagentRow;
  onOpen: (row: SubagentRow, forceTab: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const presentation = buildSubagentRowPresentationData(row);
  const elapsed = useElapsedLabel({
    startedAt: presentation.startedAt,
    isRunning: presentation.isRunning,
    endedAt: presentation.endedAt,
  });
  const isMac = getShortcutOs() === "mac";
  const handlePress = useCallback(
    (event: GestureResponderEvent) =>
      onOpen(row, isSubagentOpenAsTabClick(readSubagentClickModifiers(event), { isMac })),
    [isMac, onOpen, row],
  );
  const status = t(
    presentation.statusBucket ? STATUS_TEXT_KEY[presentation.statusBucket] : "subagents.statusDone",
  );
  const label = presentation.label || t("common.states.loading");
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${label}, ${status}`}
      onPress={handlePress}
      style={styles.row}
      testID={`subagents-panel-row-${row.id}`}
    >
      {({ hovered }) => (
        <>
          <SubagentGlyph seed={subagentGlyphSeed(row)} size={20} />
          <View style={styles.text}>
            <Text style={[styles.label, hovered && styles.labelHovered]} numberOfLines={1}>
              {label}
            </Text>
            <Text style={styles.meta} numberOfLines={1}>
              {presentation.subtitle ? `${status} · ${presentation.subtitle}` : status}
            </Text>
          </View>
          {elapsed ? <Text style={styles.elapsed}>{elapsed}</Text> : null}
        </>
      )}
    </Pressable>
  );
});

export const subagentsPanelRegistration = definePanel("subagents", {
  component: SubagentsPanel,
  presentation: subagentsPanelPresentation,
});

const styles = StyleSheet.create((theme) => ({
  content: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[1],
  },
  heading: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foregroundMuted,
    paddingHorizontal: theme.spacing[2],
    paddingBottom: theme.spacing[1],
  },
  headingSpaced: {
    marginTop: theme.spacing[3],
  },
  noneText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    paddingHorizontal: theme.spacing[2],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    borderRadius: theme.borderRadius.md,
  },
  text: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[0.5],
  },
  label: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
  },
  labelHovered: {
    textDecorationLine: "underline",
  },
  meta: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  elapsed: {
    flexShrink: 0,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    fontVariant: ["tabular-nums"],
  },
  empty: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[4],
  },
  emptyText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
}));
