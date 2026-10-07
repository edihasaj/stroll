import { Fragment, useCallback, useMemo, useState, type ReactElement } from "react";
import { Pressable, Text, View, type GestureResponderEvent } from "react-native";
import { useTranslation } from "react-i18next";
import { Archive, ChevronDown, ChevronRight, Play, Square, Unlink } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useProviderIcon } from "@/components/provider-icons";
import { ComposerTrackActions, ComposerTrackPill, ComposerTrackRow } from "@/composer/tracks";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isNative } from "@/constants/platform";
import { useAgentQueuePrompts } from "@/agent-queue/use-agent-queue";
import { useHostDisplayNames } from "@/hosts/use-host-badges";
import { useSessionStore } from "@/stores/session-store";
import { type WorkspaceTabPresentation } from "@/screens/workspace/workspace-tab-presentation";
import type { Theme } from "@/styles/theme";
import { getPanelManifest } from "@/panels/panel-manifest";
import { getShortcutOs } from "@/utils/shortcut-platform";
import { isSubagentOpenAsTabClick, readSubagentClickModifiers } from "./open-gesture";
import type { SubagentRow, SubagentTreeNode } from "./select";
import type { OpenSubagentOptions } from "./use-open-subagent";
import type { ArchiveFinishedStatus } from "./use-archive-finished";
import { useElapsedLabel } from "./use-elapsed-label";
import { SubagentGlyph } from "./subagent-glyph";
import { subagentGlyphSeed } from "./subagent-glyph-model";
import {
  buildSubagentPillPresentation,
  buildSubagentRowPresentationData,
  countFinishedSubagents,
  groupSubagentTopLevelNodes,
  joinMeta,
  resolveSubagentHostLabel,
  type SubagentRowPresentationData,
} from "./track-presentation";

const ThemedArchive = withUnistyles(Archive);
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const ThemedPlay = withUnistyles(Play);
const ThemedSquare = withUnistyles(Square);
const ThemedUnlink = withUnistyles(Unlink);

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

export interface SubagentsTrackProps {
  serverId: string;
  rows: SubagentRow[];
  tree?: SubagentTreeNode[];
  onOpenSubagent: (id: string, options?: OpenSubagentOptions) => void;
  onOpenProviderSubagent: (
    parentAgentId: string,
    subagentId: string,
    options?: OpenSubagentOptions,
  ) => void;
  onArchiveSubagent: (id: string) => void;
  onArchiveFinished?: () => void;
  archiveFinishedStatus?: ArchiveFinishedStatus;
  onDetachSubagent?: (id: string) => void;
  onStopSubagent?: (id: string) => void;
  onStopAllActive?: () => void;
}

const IDLE_ARCHIVE_FINISHED_STATUS: ArchiveFinishedStatus = { kind: "idle" };

function toFlatTree(rows: SubagentRow[]): SubagentTreeNode[] {
  return rows.map((row) => ({
    key: row.kind === "paseo" ? `agent:${row.id}` : `provider:${row.parentAgentId}:${row.id}`,
    row,
    depth: 0,
    children: [],
  }));
}

function isFinishedRow(row: SubagentRow): boolean {
  return row.kind === "paseo"
    ? row.status === "idle" || row.status === "closed" || row.status === "error"
    : row.status !== "running";
}

function flattenSubagentTree(
  nodes: SubagentTreeNode[],
  collapsedKeys: ReadonlySet<string>,
  expandedFinishedKeys: ReadonlySet<string>,
): Array<{ node: SubagentTreeNode; expanded: boolean }> {
  const result: Array<{ node: SubagentTreeNode; expanded: boolean }> = [];
  for (const node of nodes) {
    const isFinished = isFinishedRow(node.row) && !node.row.requiresAttention;
    const expanded =
      node.children.length > 0 &&
      !collapsedKeys.has(node.key) &&
      (!isFinished || expandedFinishedKeys.has(node.key));
    result.push({ node, expanded });
    if (expanded) {
      result.push(...flattenSubagentTree(node.children, collapsedKeys, expandedFinishedKeys));
    }
  }
  return result;
}

function collectSubagentRows(nodes: SubagentTreeNode[]): SubagentRow[] {
  return nodes.flatMap((node) => [node.row, ...collectSubagentRows(node.children)]);
}

/** Leading and action glyphs share one size so rows keep a single icon column. */
const ROW_ICON_SIZE = 14;

/** `WorkspaceTabIcon` reads the base presentation; the row itself also reads the elapsed-time fields. */
type SubagentRowPresentation = WorkspaceTabPresentation &
  Pick<SubagentRowPresentationData, "startedAt" | "isRunning" | "endedAt">;

function useRowPresentation(row: SubagentRow): SubagentRowPresentation {
  // The row's own host, not necessarily the pane's — a custom provider's icon is only ever
  // registered under the host that actually runs it (docs/peers.md).
  const icon = useProviderIcon(row.provider, row.hostServerId);
  const data = buildSubagentRowPresentationData(row);
  return {
    ...data,
    tooltip: data.label,
    modified: false,
    showCloseButton: getPanelManifest(data.kind).showCloseButton,
    icon,
  };
}

export function SubagentsTrack({
  serverId,
  rows,
  tree,
  onOpenSubagent,
  onOpenProviderSubagent,
  onArchiveSubagent,
  onArchiveFinished,
  archiveFinishedStatus = IDLE_ARCHIVE_FINISHED_STATUS,
  onDetachSubagent,
  onStopSubagent,
  onStopAllActive,
}: SubagentsTrackProps): ReactElement | null {
  const { t } = useTranslation();
  const hostNames = useHostDisplayNames();
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());
  const [expandedFinishedKeys, setExpandedFinishedKeys] = useState<Set<string>>(new Set());
  const [doneGroupExpanded, setDoneGroupExpanded] = useState(false);
  const treeNodes = useMemo(() => tree ?? toFlatTree(rows), [rows, tree]);
  // The pill reflects every top-level row regardless of the Active/Done split below — collapsing
  // the Done group is a display choice for the row list, not a reason for a failed or
  // needs-attention child to vanish from the summary above the composer.
  const pillRows = useMemo(
    () =>
      flattenSubagentTree(treeNodes, collapsedKeys, expandedFinishedKeys).map(
        ({ node }) => node.row,
      ),
    [collapsedKeys, expandedFinishedKeys, treeNodes],
  );
  const { active: activeTopLevel, done: doneTopLevel } = useMemo(
    () => groupSubagentTopLevelNodes(treeNodes),
    [treeNodes],
  );
  const visibleActiveRows = useMemo(
    () => flattenSubagentTree(activeTopLevel, collapsedKeys, expandedFinishedKeys),
    [activeTopLevel, collapsedKeys, expandedFinishedKeys],
  );
  const visibleDoneRows = useMemo(
    () =>
      doneGroupExpanded
        ? flattenSubagentTree(doneTopLevel, collapsedKeys, expandedFinishedKeys)
        : [],
    [collapsedKeys, doneGroupExpanded, doneTopLevel, expandedFinishedKeys],
  );
  const toggleExpanded = useCallback((node: SubagentTreeNode, expanded: boolean) => {
    setCollapsedKeys((current) => {
      const next = new Set(current);
      if (expanded) next.add(node.key);
      else next.delete(node.key);
      return next;
    });
    setExpandedFinishedKeys((current) => {
      const next = new Set(current);
      if (expanded) next.delete(node.key);
      else next.add(node.key);
      return next;
    });
  }, []);
  const toggleDoneGroupExpanded = useCallback(() => setDoneGroupExpanded((prev) => !prev), []);

  const isArchivingFinished = archiveFinishedStatus.kind === "archiving";
  const isArchiveFinishedFailed = archiveFinishedStatus.kind === "failed";
  if (pillRows.length === 0 && !isArchivingFinished && !isArchiveFinishedFailed) {
    return null;
  }

  const pill = buildSubagentPillPresentation(t, pillRows);
  const finishedCount = countFinishedSubagents(collectSubagentRows(treeNodes));
  const showArchiveFinished = finishedCount > 0 || isArchivingFinished || isArchiveFinishedFailed;
  const hasAnyRow = pillRows.length > 0;

  const renderRowGroup = (visible: Array<{ node: SubagentTreeNode; expanded: boolean }>) =>
    visible.map(({ node, expanded }) => (
      <Fragment key={node.key}>
        <SubagentsTrackRow
          row={node.row}
          node={node}
          depth={node.depth}
          hasChildren={node.children.length > 0}
          expanded={expanded}
          hostLabel={resolveSubagentHostLabel(node.row.hostServerId, serverId, hostNames)}
          onToggleExpanded={toggleExpanded}
          onOpenSubagent={onOpenSubagent}
          onOpenProviderSubagent={onOpenProviderSubagent}
          onArchiveSubagent={onArchiveSubagent}
          onDetachSubagent={onDetachSubagent}
          onStopSubagent={onStopSubagent}
        />
        {node.row.kind === "paseo" ? (
          <AgentQueueRows serverId={serverId} agentId={node.row.id} depth={node.depth + 1} />
        ) : null}
      </Fragment>
    ));

  return (
    <ComposerTrackPill
      testID="subagents-track-header"
      segments={pill.segments}
      accessibilityLabel={pill.accessibilityLabel}
      panelTitle={t("subagents.title")}
    >
      {onStopAllActive ? (
        <ComposerTrackActions divided={hasAnyRow}>
          <StopAllRow onPress={onStopAllActive} />
        </ComposerTrackActions>
      ) : null}
      {showArchiveFinished && onArchiveFinished ? (
        <ComposerTrackActions divided={hasAnyRow}>
          <ArchiveFinishedRow
            status={archiveFinishedStatus}
            disabled={isArchivingFinished}
            onPress={onArchiveFinished}
          />
        </ComposerTrackActions>
      ) : null}
      {renderRowGroup(visibleActiveRows)}
      {doneTopLevel.length > 0 ? (
        <DoneGroupRow
          count={doneTopLevel.length}
          expanded={doneGroupExpanded}
          onPress={toggleDoneGroupExpanded}
        />
      ) : null}
      {doneGroupExpanded ? renderRowGroup(visibleDoneRows) : null}
    </ComposerTrackPill>
  );
}

/**
 * The Done group's own disclosure — collapsed by default so a long-lived parent's finished fan-out
 * does not bury the rows someone still needs to act on. Mirrors `ArchiveFinishedRow`'s shape: a
 * named row above the list it covers, not an icon folded into a count.
 */
function DoneGroupRow({
  count,
  expanded,
  onPress,
}: {
  count: number;
  expanded: boolean;
  onPress: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const label = t("subagents.doneGroupLabel", { count });
  const renderRow = useCallback(
    ({ active }: { active: boolean }) => (
      <>
        {expanded ? (
          <ThemedChevronDown
            size={ROW_ICON_SIZE}
            uniProps={active ? foregroundColorMapping : foregroundMutedColorMapping}
          />
        ) : (
          <ThemedChevronRight
            size={ROW_ICON_SIZE}
            uniProps={active ? foregroundColorMapping : foregroundMutedColorMapping}
          />
        )}
        <Text style={styles.rowLabel} numberOfLines={1}>
          {label}
        </Text>
      </>
    ),
    [expanded, label],
  );
  return (
    <ComposerTrackRow
      accessibilityLabel={label}
      testID="subagents-track-done-group"
      // Toggling a group of rows in the panel is a display choice, not a selection — the panel
      // stays open the same way a per-row disclosure does.
      closeOnSelect={false}
      onPress={onPress}
    >
      {renderRow}
    </ComposerTrackRow>
  );
}

/**
 * Bulk archive, as a row above the list rather than an icon next to the count. The pill has no
 * header to hang an icon off, and a destructive-ish action reads better with its name attached.
 */
function ArchiveFinishedRow({
  status,
  disabled,
  onPress,
}: {
  status: ArchiveFinishedStatus;
  disabled: boolean;
  onPress: () => void;
}): ReactElement {
  const { t } = useTranslation();

  const renderRow = useCallback(
    ({ active }: { active: boolean }) => (
      <>
        <ThemedArchive
          size={ROW_ICON_SIZE}
          uniProps={active ? foregroundColorMapping : foregroundMutedColorMapping}
        />
        <Text style={styles.rowLabel} numberOfLines={1}>
          {t("subagents.archiveFinishedAction")}
        </Text>
        {status.kind === "archiving" ? (
          <Text style={styles.rowTrailing} testID="subagents-track-archive-progress">
            {status.completedCount}/{status.totalCount}
          </Text>
        ) : null}
        {status.kind === "failed" ? (
          <Text style={styles.rowTrailing} testID="subagents-track-archive-failed">
            {t("subagents.archiveFinishedRetry", {
              failed: status.failedCount,
              total: status.totalCount,
            })}
          </Text>
        ) : null}
      </>
    ),
    [status, t],
  );

  return (
    <ComposerTrackRow
      accessibilityLabel={t("subagents.archiveFinishedAction")}
      testID="subagents-track-archive-finished"
      disabled={disabled}
      // Progress and the retry count land on this row, so the panel is where the result of
      // pressing it shows up. Dismissing would hide the thing the press produces.
      closeOnSelect={false}
      onPress={onPress}
    >
      {renderRow}
    </ComposerTrackRow>
  );
}

function StopAllRow({ onPress }: { onPress: () => void }): ReactElement {
  const { t } = useTranslation();
  const renderRow = useCallback(
    ({ active }: { active: boolean }) => (
      <>
        <ThemedSquare
          size={ROW_ICON_SIZE}
          uniProps={active ? foregroundColorMapping : foregroundMutedColorMapping}
        />
        <Text style={styles.rowLabel} numberOfLines={1}>
          {t("subagents.stopAllAction")}
        </Text>
      </>
    ),
    [t],
  );
  return (
    <ComposerTrackRow accessibilityLabel={t("subagents.stopAllAction")} onPress={onPress}>
      {renderRow}
    </ComposerTrackRow>
  );
}

function AgentQueueRows({
  serverId,
  agentId,
  depth,
}: {
  serverId: string;
  agentId: string;
  depth: number;
}): ReactElement | null {
  const prompts = useAgentQueuePrompts({ serverId, agentId });
  if (prompts.length === 0) return null;
  return (
    <>
      {prompts.map((prompt) => (
        <QueuedPromptTrackRow
          key={prompt.id}
          serverId={serverId}
          agentId={agentId}
          promptId={prompt.id}
          text={prompt.text}
          depth={depth}
        />
      ))}
    </>
  );
}

function QueuedPromptTrackRow({
  serverId,
  agentId,
  promptId,
  text,
  depth,
}: {
  serverId: string;
  agentId: string;
  promptId: string;
  text: string;
  depth: number;
}): ReactElement {
  const { t } = useTranslation();
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const handleSendNow = useCallback(() => {
    if (!client) return;
    void client.sendAgentQueuePromptNow(agentId, promptId).catch(() => undefined);
  }, [agentId, client, promptId]);
  const renderRow = useCallback(
    ({ active }: { active: boolean }) => (
      <>
        <View style={[styles.depthRail, { width: depth * 12 }]} />
        <View style={styles.disclosure} />
        <Text style={styles.queuePreview} numberOfLines={1}>
          {text}
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t("composer.attachments.sendQueuedMessageNow")}
          onPress={handleSendNow}
          hitSlop={6}
          style={active ? styles.queueActionActive : styles.queueAction}
        >
          <ThemedPlay size={ROW_ICON_SIZE} uniProps={foregroundMutedColorMapping} />
        </Pressable>
      </>
    ),
    [depth, handleSendNow, t, text],
  );
  return (
    <ComposerTrackRow
      accessibilityLabel={text}
      testID={`subagents-track-queued-${promptId}`}
      onPress={handleSendNow}
    >
      {renderRow}
    </ComposerTrackRow>
  );
}

interface SubagentsTrackRowProps {
  row: SubagentRow;
  node: SubagentTreeNode;
  depth: number;
  hasChildren: boolean;
  expanded: boolean;
  /** The row's host name when it differs from the parent's (docs/peers.md "In the app"). */
  hostLabel: string | null;
  onToggleExpanded: (node: SubagentTreeNode, expanded: boolean) => void;
  onOpenSubagent: (id: string, options?: OpenSubagentOptions) => void;
  onOpenProviderSubagent: (
    parentAgentId: string,
    subagentId: string,
    options?: OpenSubagentOptions,
  ) => void;
  onArchiveSubagent: (id: string) => void;
  onDetachSubagent?: (id: string) => void;
  onStopSubagent?: (id: string) => void;
}

function SubagentsTrackRow({
  row,
  node,
  depth,
  hasChildren,
  expanded,
  hostLabel,
  onToggleExpanded,
  onOpenSubagent,
  onOpenProviderSubagent,
  onArchiveSubagent,
  onDetachSubagent,
  onStopSubagent,
}: SubagentsTrackRowProps): ReactElement {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const presentation = useRowPresentation(row);
  const trailingText = joinMeta([presentation.subtitle || null, hostLabel]);
  const elapsedLabel = useElapsedLabel({
    startedAt: presentation.startedAt,
    isRunning: presentation.isRunning,
    endedAt: presentation.endedAt,
  });
  // A collapsed parent hides its children's rows, so it reports what is behind them: how many
  // are still running, or — nothing running — how many there are. Computed from the full
  // subtree rather than `node.children.length` so a collapsed grandparent still counts what a
  // collapsed child is itself hiding.
  const descendantRows = useMemo(
    () => (hasChildren ? collectSubagentRows(node.children) : []),
    [hasChildren, node.children],
  );
  const runningDescendantCount = useMemo(
    () => descendantRows.filter((descendant) => !isFinishedRow(descendant)).length,
    [descendantRows],
  );
  const displayLabel =
    presentation.titleState === "loading" ? t("common.states.loading") : presentation.label;
  const isMac = useMemo(() => getShortcutOs() === "mac", []);
  const openRow = useCallback(
    (forceTab: boolean) => {
      if (row.kind === "provider") {
        onOpenProviderSubagent(row.parentAgentId, row.id, { forceTab });
      } else {
        onOpenSubagent(row.id, { forceTab });
      }
    },
    [onOpenProviderSubagent, onOpenSubagent, row],
  );
  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      const modifiers = readSubagentClickModifiers(event);
      openRow(isSubagentOpenAsTabClick(modifiers, { isMac }));
    },
    [isMac, openRow],
  );
  const handleAuxClick = useCallback(() => openRow(true), [openRow]);
  const handleArchivePress = useCallback(() => {
    onArchiveSubagent(row.id);
  }, [onArchiveSubagent, row.id]);
  const handleDetachPress = useCallback(() => {
    onDetachSubagent?.(row.id);
  }, [onDetachSubagent, row.id]);
  const handleStopPress = useCallback(() => {
    onStopSubagent?.(row.id);
  }, [onStopSubagent, row.id]);
  const handleToggleExpanded = useCallback(
    () => onToggleExpanded(node, expanded),
    [expanded, node, onToggleExpanded],
  );
  const actionsAlwaysVisible = isNative || isCompact;

  const glyphSeed = subagentGlyphSeed(row);
  const renderRow = useCallback(
    ({ active }: { active: boolean }) => (
      <>
        <View style={[styles.depthRail, { width: depth * 12 }]} />
        {hasChildren ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${expanded ? "Collapse" : "Expand"} ${displayLabel}`}
            testID={`subagents-track-disclosure-${row.id}`}
            onPress={handleToggleExpanded}
            hitSlop={6}
            style={styles.disclosure}
          >
            {expanded ? (
              <ThemedChevronDown size={ROW_ICON_SIZE} uniProps={foregroundMutedColorMapping} />
            ) : (
              <ThemedChevronRight size={ROW_ICON_SIZE} uniProps={foregroundMutedColorMapping} />
            )}
          </Pressable>
        ) : (
          <View style={styles.disclosure} />
        )}
        <SubagentGlyph seed={glyphSeed} size={16} />
        <Text style={styles.rowLabel} numberOfLines={1}>
          {displayLabel}
        </Text>
        {trailingText ? (
          <Text style={styles.rowTrailing} numberOfLines={1}>
            {trailingText}
          </Text>
        ) : null}
        {elapsedLabel ? (
          <Text
            style={styles.rowElapsed}
            numberOfLines={1}
            testID={`subagents-track-elapsed-${row.id}`}
          >
            {elapsedLabel}
          </Text>
        ) : null}
        {hasChildren && !expanded ? (
          <CollapsedSubagentCount
            rowId={row.id}
            runningCount={runningDescendantCount}
            totalCount={descendantRows.length}
          />
        ) : null}
        {row.kind === "paseo" ? (
          <SubagentRowActions
            rowId={row.id}
            displayLabel={displayLabel}
            visible={actionsAlwaysVisible || active}
            onDetachPress={onDetachSubagent ? handleDetachPress : undefined}
            onStopPress={row.status === "running" ? handleStopPress : undefined}
            onArchivePress={handleArchivePress}
          />
        ) : null}
      </>
    ),
    [
      actionsAlwaysVisible,
      glyphSeed,
      displayLabel,
      depth,
      descendantRows.length,
      elapsedLabel,
      expanded,
      handleArchivePress,
      handleDetachPress,
      hasChildren,
      onDetachSubagent,
      handleStopPress,
      handleToggleExpanded,
      row.kind,
      row.id,
      row.status,
      runningDescendantCount,
      trailingText,
    ],
  );

  return (
    <ComposerTrackRow
      accessibilityLabel={displayLabel}
      testID={`subagents-track-row-${row.id}`}
      onPress={handlePress}
      onAuxClick={handleAuxClick}
    >
      {renderRow}
    </ComposerTrackRow>
  );
}

/** What a collapsed parent reports about the children its chevron is hiding. */
function CollapsedSubagentCount({
  rowId,
  runningCount,
  totalCount,
}: {
  rowId: string;
  runningCount: number;
  totalCount: number;
}): ReactElement {
  const { t } = useTranslation();
  if (runningCount > 0) {
    return (
      <StatusBadge variant="success" label={t("subagents.runningCount", { count: runningCount })} />
    );
  }
  return (
    <Text style={styles.rowTrailing} testID={`subagents-track-count-${rowId}`}>
      {totalCount}
    </Text>
  );
}

/** A managed subagent's row actions, shared by the composer pill and the Subagents panel. */
export function SubagentRowActions({
  rowId,
  displayLabel,
  visible,
  onDetachPress,
  onArchivePress,
  onStopPress,
  testIDPrefix = "subagents-track",
}: {
  rowId: string;
  displayLabel: string;
  visible: boolean;
  onDetachPress?: () => void;
  onArchivePress: () => void;
  onStopPress?: () => void;
  testIDPrefix?: string;
}): ReactElement {
  const { t } = useTranslation();
  return (
    <View
      style={visible ? styles.actionClusterVisible : styles.actionClusterHidden}
      pointerEvents={visible ? "auto" : "none"}
    >
      {onDetachPress ? (
        <SubagentActionButton
          accessibilityLabel={t("subagents.detachAction", { label: displayLabel })}
          testID={`${testIDPrefix}-detach-${rowId}`}
          tooltipLabel={t("subagents.detachTooltip")}
          icon="detach"
          visible={visible}
          onPress={onDetachPress}
        />
      ) : null}
      {onStopPress ? (
        <SubagentActionButton
          accessibilityLabel={t("subagents.stopAction", { label: displayLabel })}
          testID={`${testIDPrefix}-stop-${rowId}`}
          tooltipLabel={t("subagents.stopAction", { label: displayLabel })}
          icon="stop"
          visible={visible}
          onPress={onStopPress}
        />
      ) : null}
      <SubagentActionButton
        accessibilityLabel={t("subagents.archiveAction", { label: displayLabel })}
        testID={`${testIDPrefix}-archive-${rowId}`}
        tooltipLabel={t("subagents.archiveTooltip")}
        icon="archive"
        visible={visible}
        onPress={onArchivePress}
      />
    </View>
  );
}

type SubagentActionIcon = "archive" | "detach" | "stop";

function renderSubagentActionIcon(icon: SubagentActionIcon, isActive: boolean): ReactElement {
  const uniProps = isActive ? foregroundColorMapping : foregroundMutedColorMapping;
  if (icon === "detach") {
    return <ThemedUnlink size={ROW_ICON_SIZE} uniProps={uniProps} />;
  }
  if (icon === "stop") {
    return <ThemedSquare size={ROW_ICON_SIZE} uniProps={uniProps} />;
  }
  return <ThemedArchive size={ROW_ICON_SIZE} uniProps={uniProps} />;
}

function SubagentActionButton({
  accessibilityLabel,
  testID,
  tooltipLabel,
  icon,
  visible,
  onPress,
}: {
  accessibilityLabel: string;
  testID: string;
  tooltipLabel: string;
  icon: SubagentActionIcon;
  visible: boolean;
  onPress: () => void;
}): ReactElement {
  return (
    <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger asChild disabled={!visible}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel}
          testID={testID}
          onPress={onPress}
          style={styles.actionButton}
          hitSlop={8}
        >
          {({ hovered, pressed }) => renderSubagentActionIcon(icon, hovered || pressed)}
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="top" align="center" offset={8}>
        <Text style={styles.tooltipText}>{tooltipLabel}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

const styles = StyleSheet.create((theme) => ({
  depthRail: {
    flexShrink: 0,
    alignSelf: "stretch",
    borderLeftWidth: 1,
    borderLeftColor: theme.colors.border,
    marginLeft: theme.spacing[1],
  },
  disclosure: {
    width: ROW_ICON_SIZE,
    height: ROW_ICON_SIZE,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  queuePreview: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  queueAction: {
    padding: theme.spacing[1],
    borderRadius: theme.borderRadius.sm,
  },
  queueActionActive: {
    padding: theme.spacing[1],
    borderRadius: theme.borderRadius.sm,
    backgroundColor: theme.colors.surface2,
  },
  // `flexBasis: "auto"` rather than `flex: 1`: a zero-basis label contributes nothing to the row's
  // intrinsic width, so the panel measures itself at its floor and truncates every label at once.
  rowLabel: {
    flexGrow: 1,
    flexShrink: 1,
    flexBasis: "auto",
    minWidth: 0,
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
  },
  // Trailing metadata — provider context on a subagent row, progress on the archive row. No width
  // cap: the panel's own ceiling bounds it. It shrinks twice as fast as the label, so a wordy
  // provider subtitle gives way first instead of squeezing the thing that names the row.
  rowTrailing: {
    flexShrink: 2,
    minWidth: 0,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  // Fixed-ish width digits: never shrinks, so the label and subtitle give way and a running row's
  // clock doesn't jitter the layout or truncate to "1…".
  rowElapsed: {
    flexShrink: 0,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    fontVariant: ["tabular-nums"],
  },
  actionClusterVisible: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    opacity: 1,
  },
  actionClusterHidden: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    opacity: 0,
  },
  actionButton: {
    padding: theme.spacing[1],
    alignItems: "center",
    justifyContent: "center",
  },
  tooltipText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
}));
