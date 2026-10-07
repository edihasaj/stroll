import { memo, useCallback, useMemo, useState, type ReactElement, type ReactNode } from "react";
import { Pressable, ScrollView, Text, View, type GestureResponderEvent } from "react-native";
import { useTranslation } from "react-i18next";
import { Archive, Square, Users } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import invariant from "tiny-invariant";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isNative } from "@/constants/platform";
import { useAuxClickRef } from "@/hooks/use-aux-click-ref";
import { usePaneContext } from "@/panels/pane-context";
import { definePanel, type PanelPresentation } from "@/panels/panel-registry";
import { useSessionStore } from "@/stores/session-store";
import type { Theme } from "@/styles/theme";
import { getShortcutOs } from "@/utils/shortcut-platform";
import {
  useArchiveFinishedSubagents,
  useArchiveSubagent,
  useDetachSubagent,
  useSubagentsForParent,
} from "@/subagents";
import type { ArchiveFinishedStatus } from "@/subagents/archive-finished";
import { isSubagentOpenAsTabClick, readSubagentClickModifiers } from "@/subagents/open-gesture";
import type { SubagentRow } from "@/subagents/select";
import { SubagentGlyph } from "@/subagents/subagent-glyph";
import { subagentGlyphSeed } from "@/subagents/subagent-glyph-model";
import { SubagentRowActions } from "@/subagents/track";
import {
  buildSubagentRowPresentationData,
  isSubagentRowActive,
} from "@/subagents/track-presentation";
import { useElapsedLabel } from "@/subagents/use-elapsed-label";
import { useOpenSubagent } from "@/subagents/use-open-subagent";
import { useStopSubagents } from "@/subagents/use-stop-subagents";

const ThemedUsers = withUnistyles(Users);
const ThemedArchive = withUnistyles(Archive);
const ThemedSquare = withUnistyles(Square);
const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const HEADING_ICON_SIZE = 14;

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

interface SubagentRowHandlers {
  open: (row: SubagentRow, forceTab: boolean) => void;
  archive: (subagentId: string) => void;
  stop: (subagentId: string) => void;
  detach: ((subagentId: string) => void) | undefined;
}

/**
 * The Subagents side-panel tab, as in Codex: the parent's subagents in Active and Done groups,
 * each with its glyph, name, status, and elapsed time. A row opens that subagent next to it;
 * ⌘/Ctrl- or middle-click opens it as a tab. Rows carry the same stop/archive actions as the
 * composer pill, and the group headings carry stop-all and archive-finished.
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
  const archiveSubagent = useArchiveSubagent({ serverId });
  const detachSubagent = useDetachSubagent({ serverId });
  const canDetach = useSessionStore(
    (state) => state.sessions[serverId]?.serverInfo?.features?.agentDetach === true,
  );
  const { stopSubagent, stopAllActive } = useStopSubagents({ serverId, rows });
  const archiveFinished = useArchiveFinishedSubagents({
    serverId,
    parentAgentId: target.parentAgentId,
    rows,
  });
  const handlers = useMemo<SubagentRowHandlers>(
    () => ({
      open: (row, forceTab) => {
        if (row.kind === "paseo") openSubagent(row.id, { forceTab });
        else openProviderSubagent(row.parentAgentId, row.id, { forceTab });
      },
      archive: archiveSubagent,
      stop: stopSubagent,
      detach: canDetach ? detachSubagent : undefined,
    }),
    [archiveSubagent, canDetach, detachSubagent, openProviderSubagent, openSubagent, stopSubagent],
  );
  const handleStopAll = useCallback(() => void stopAllActive?.(), [stopAllActive]);
  const runArchiveFinished = archiveFinished.archiveFinished;
  const handleArchiveFinished = useCallback(() => void runArchiveFinished(), [runArchiveFinished]);

  if (rows.length === 0) {
    return (
      <View style={styles.empty}>
        <Text style={styles.emptyText}>{t("subagents.panel.empty")}</Text>
      </View>
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <GroupHeading label={t("subagents.panel.active", { count: active.length })}>
        {stopAllActive ? (
          <HeadingAction
            icon="stop"
            label={t("subagents.stopAllAction")}
            onPress={handleStopAll}
            testID="subagents-panel-stop-all"
          />
        ) : null}
      </GroupHeading>
      {active.length === 0 ? (
        <Text style={styles.noneText}>{t("subagents.panel.noActive")}</Text>
      ) : (
        active.map((row) => <SubagentPanelRow key={row.id} row={row} handlers={handlers} />)
      )}
      {done.length > 0 ? (
        <>
          <GroupHeading label={t("subagents.panel.done", { count: done.length })} spaced>
            <ArchiveFinishedAction
              status={archiveFinished.status}
              eligibleCount={archiveFinished.eligibleCount}
              onPress={handleArchiveFinished}
            />
          </GroupHeading>
          {done.map((row) => (
            <SubagentPanelRow key={row.id} row={row} handlers={handlers} />
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

function GroupHeading({
  label,
  spaced = false,
  children,
}: {
  label: string;
  spaced?: boolean;
  children?: ReactNode;
}): ReactElement {
  return (
    <View style={spaced ? styles.headingRowSpaced : styles.headingRow}>
      <Text style={styles.heading}>{label}</Text>
      {children}
    </View>
  );
}

function HeadingAction({
  icon,
  label,
  onPress,
  testID,
}: {
  icon: "stop" | "archive";
  label: string;
  onPress: () => void;
  testID: string;
}): ReactElement {
  const renderIcon = useCallback(
    ({ hovered, pressed }: { hovered?: boolean; pressed: boolean }) => {
      const uniProps = hovered || pressed ? foregroundColorMapping : mutedColorMapping;
      return icon === "stop" ? (
        <ThemedSquare size={HEADING_ICON_SIZE} uniProps={uniProps} />
      ) : (
        <ThemedArchive size={HEADING_ICON_SIZE} uniProps={uniProps} />
      );
    },
    [icon],
  );
  return (
    <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          onPress={onPress}
          style={styles.headingAction}
          hitSlop={8}
          testID={testID}
        >
          {renderIcon}
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="top" align="center" offset={8}>
        <Text style={styles.tooltipText}>{label}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

/** Archive-finished in the Done heading: the button, then its progress, then a retry on failure. */
function ArchiveFinishedAction({
  status,
  eligibleCount,
  onPress,
}: {
  status: ArchiveFinishedStatus;
  eligibleCount: number;
  onPress: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  if (status.kind === "archiving") {
    return (
      <Text style={styles.headingMeta} testID="subagents-panel-archive-progress">
        {status.completedCount}/{status.totalCount}
      </Text>
    );
  }
  if (status.kind === "failed") {
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("subagents.archiveFinishedAction")}
        onPress={onPress}
        hitSlop={8}
        testID="subagents-panel-archive-retry"
      >
        <Text style={styles.headingMeta}>
          {t("subagents.archiveFinishedRetry", {
            failed: status.failedCount,
            total: status.totalCount,
          })}
        </Text>
      </Pressable>
    );
  }
  if (eligibleCount === 0) return null;
  return (
    <HeadingAction
      icon="archive"
      label={t("subagents.archiveFinishedAction")}
      onPress={onPress}
      testID="subagents-panel-archive-finished"
    />
  );
}

// Hover lives on the outer View and press on the inner Pressable, so the row actions (Pressables
// themselves) can sit inside without the two fighting over hover (docs/hover.md).
const SubagentPanelRow = memo(function SubagentPanelRow({
  row,
  handlers,
}: {
  row: SubagentRow;
  handlers: SubagentRowHandlers;
}): ReactElement {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const [hovered, setHovered] = useState(false);
  const handlePointerEnter = useCallback(() => setHovered(true), []);
  const handlePointerLeave = useCallback(() => setHovered(false), []);
  const presentation = buildSubagentRowPresentationData(row);
  const elapsed = useElapsedLabel({
    startedAt: presentation.startedAt,
    isRunning: presentation.isRunning,
    endedAt: presentation.endedAt,
  });
  const isMac = getShortcutOs() === "mac";
  const handlePress = useCallback(
    (event: GestureResponderEvent) =>
      handlers.open(row, isSubagentOpenAsTabClick(readSubagentClickModifiers(event), { isMac })),
    [handlers, isMac, row],
  );
  const handleAuxClick = useCallback(() => handlers.open(row, true), [handlers, row]);
  const auxClickRef = useAuxClickRef(handleAuxClick);
  const handleArchive = useCallback(() => handlers.archive(row.id), [handlers, row.id]);
  const handleStop = useCallback(() => handlers.stop(row.id), [handlers, row.id]);
  const detach = handlers.detach;
  const handleDetach = useCallback(() => detach?.(row.id), [detach, row.id]);
  const status = t(
    presentation.statusBucket ? STATUS_TEXT_KEY[presentation.statusBucket] : "subagents.statusDone",
  );
  const label = presentation.label || t("common.states.loading");
  return (
    <View
      ref={auxClickRef}
      style={styles.rowContainer}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${label}, ${status}`}
        onPress={handlePress}
        style={styles.row}
        testID={`subagents-panel-row-${row.id}`}
      >
        <SubagentGlyph seed={subagentGlyphSeed(row)} size={20} />
        <View style={styles.text}>
          <Text style={hovered ? styles.labelHovered : styles.label} numberOfLines={1}>
            {label}
          </Text>
          <Text style={styles.meta} numberOfLines={1}>
            {presentation.subtitle ? `${status} · ${presentation.subtitle}` : status}
          </Text>
        </View>
        {elapsed ? <Text style={styles.elapsed}>{elapsed}</Text> : null}
        {row.kind === "paseo" ? (
          <SubagentRowActions
            rowId={row.id}
            displayLabel={label}
            visible={hovered || isNative || isCompact}
            onDetachPress={detach ? handleDetach : undefined}
            onStopPress={row.status === "running" ? handleStop : undefined}
            onArchivePress={handleArchive}
            testIDPrefix="subagents-panel"
          />
        ) : null}
      </Pressable>
    </View>
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
  headingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 24,
    paddingHorizontal: theme.spacing[2],
    paddingBottom: theme.spacing[1],
  },
  headingRowSpaced: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 24,
    paddingHorizontal: theme.spacing[2],
    paddingBottom: theme.spacing[1],
    marginTop: theme.spacing[3],
  },
  heading: {
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foregroundMuted,
  },
  headingMeta: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    fontVariant: ["tabular-nums"],
  },
  headingAction: {
    padding: theme.spacing[1],
    alignItems: "center",
    justifyContent: "center",
  },
  tooltipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  noneText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    paddingHorizontal: theme.spacing[2],
  },
  rowContainer: {
    position: "relative",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[3],
    minHeight: 48,
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
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    color: theme.colors.foreground,
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
