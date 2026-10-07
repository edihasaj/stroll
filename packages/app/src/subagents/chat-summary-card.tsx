import { memo, useCallback, useState, type ReactElement } from "react";
import { Pressable, Text, View, type LayoutChangeEvent } from "react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet } from "react-native-unistyles";
import { ComposerDiffStatPill } from "@/composer/diff-stat-pill";
import { useVisibleWorkspaceDiffStat } from "@/composer/workspace-diff-stat";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useHostDisplayNames } from "@/hosts/use-host-badges";
import { useSettings } from "@/hooks/use-settings";
import { usePaneContext } from "@/panels/pane-context";
import { DEFAULT_CONTENT_MAX_WIDTH } from "@/styles/theme";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import { openPreferredWorkspaceTarget } from "@/workspace-tabs/open-beside";
import { openComposerChanges } from "@/workspace-tabs/open-supporting-view";
import {
  buildChatSummary,
  resolveRemoteHostSummaryLabel,
  type ChatSummary,
} from "./chat-summary-model";
import type { SubagentRow } from "./select";
import { SubagentGlyph } from "./subagent-glyph";
import { subagentGlyphSeed } from "./subagent-glyph-model";

const CARD_WIDTH = 240;
/** Space kept between the card and the transcript column, and the card's own inset. */
const CARD_GUTTER = 32;
/** Room the compact glyph cluster needs; narrower panes leave subagents to the composer pill. */
const CLUSTER_WIDTH = 96;

/**
 * Codex's thread summary, top right of a chat: the chat's subagents (glyphs, "1 working · 2
 * done") and its uncommitted changes. Clicking subagents opens the Subagents panel beside the
 * chat; clicking changes opens the diff. The header's "Toggle summary" button hides it.
 */
export const ChatSummaryCard = memo(function ChatSummaryCard({
  serverId,
  workspaceId,
  cwd,
  agentId,
  subagentRows,
}: {
  serverId: string;
  workspaceId: string;
  cwd: string;
  agentId: string;
  subagentRows: readonly SubagentRow[];
}): ReactElement | null {
  const { t } = useTranslation();
  const isCompact = useIsCompactFormFactor();
  const showChatSummary = useSettings((settings) => settings.showChatSummary);
  const contentMaxWidth =
    useSettings((settings) => settings.contentMaxWidth) ?? DEFAULT_CONTENT_MAX_WIDTH;
  const openInSidePane = useSettings((settings) => settings.openInSidePane);
  const { tabId } = usePaneContext();
  const diffStat = useVisibleWorkspaceDiffStat(serverId, workspaceId);
  const [paneWidth, setPaneWidth] = useState(0);
  const workspaceKey = buildWorkspaceTabPersistenceKey({ serverId, workspaceId });
  const summary = buildChatSummary(subagentRows);
  const hostNames = useHostDisplayNames();
  const hostLabel = resolveRemoteHostSummaryLabel(subagentRows, serverId, hostNames);

  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => setPaneWidth(event.nativeEvent.layout.width),
    [],
  );
  const openSubagents = useCallback(() => {
    if (!workspaceKey) return;
    openPreferredWorkspaceTarget({
      isCompact,
      workspaceKey,
      target: { kind: "subagents", parentAgentId: agentId },
      source: "subagents",
      preferences: openInSidePane,
      parentTabId: tabId,
    });
  }, [agentId, isCompact, openInSidePane, tabId, workspaceKey]);
  const openChanges = useCallback(() => {
    if (!workspaceKey) return;
    openComposerChanges({
      isCompact,
      workspaceKey,
      checkout: { serverId, cwd, isGit: true },
      preferences: openInSidePane,
    });
  }, [cwd, isCompact, openInSidePane, serverId, workspaceKey]);

  if (isCompact || !showChatSummary || (!summary && !diffStat)) return null;
  return (
    <View style={styles.layer} pointerEvents="box-none" onLayout={handleLayout}>
      {renderSummary()}
    </View>
  );

  function renderSummary(): ReactElement | null {
    if (paneWidth === 0) return null;
    // The full card only shows where the gutter beside the centred transcript can hold it; a
    // narrower pane gets the small glyph cluster, and a narrow split none, so no text is covered.
    if (paneWidth >= contentMaxWidth + 2 * (CARD_WIDTH + CARD_GUTTER)) {
      return (
        <View style={styles.card} testID="chat-summary-card">
          {summary ? (
            <SubagentsSection
              summary={summary}
              rows={subagentRows}
              hostLabel={hostLabel}
              onPress={openSubagents}
            />
          ) : null}
          {summary && diffStat ? <View style={styles.divider} /> : null}
          {diffStat ? (
            <View style={styles.section}>
              <Text style={styles.heading}>{t("subagents.summary.changes")}</Text>
              <ComposerDiffStatPill
                additions={diffStat.additions}
                deletions={diffStat.deletions}
                onPress={openChanges}
              />
            </View>
          ) : null}
        </View>
      );
    }
    if (!summary || paneWidth < contentMaxWidth + 2 * (CLUSTER_WIDTH + CARD_GUTTER)) return null;
    return (
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("subagents.summary.open")}
        onPress={openSubagents}
        style={styles.cluster}
        testID="chat-summary-cluster"
      >
        <GlyphStack rows={subagentRows} />
        <Text style={styles.statusText}>{subagentRows.length}</Text>
      </Pressable>
    );
  }
});

function SubagentsSection({
  summary,
  rows,
  hostLabel,
  onPress,
}: {
  summary: ChatSummary;
  rows: readonly SubagentRow[];
  /** Distinct remote host names among `rows`, when any differ from the parent's own. */
  hostLabel: string | null;
  onPress: () => void;
}): ReactElement {
  const { t } = useTranslation();
  const parts = [
    summary.needsYou > 0 ? t("subagents.summary.needsYou", { count: summary.needsYou }) : null,
    summary.working > 0 ? t("subagents.summary.working", { count: summary.working }) : null,
    summary.done > 0 ? t("subagents.summary.done", { count: summary.done }) : null,
    hostLabel,
  ].filter((part): part is string => part !== null);
  return (
    <View style={styles.section}>
      <Text style={styles.heading}>{t("subagents.summary.title")}</Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t("subagents.summary.open")}
        onPress={onPress}
        style={styles.subagentsRow}
        testID="chat-summary-subagents"
      >
        {({ hovered }) => (
          <>
            <GlyphStack rows={rows} />
            <Text style={[styles.statusText, hovered && styles.statusTextHovered]}>
              {parts.join(" · ")}
            </Text>
          </>
        )}
      </Pressable>
    </View>
  );
}

const MAX_GLYPHS = 4;

function GlyphStack({ rows }: { rows: readonly SubagentRow[] }): ReactElement {
  const shown = rows.slice(0, MAX_GLYPHS);
  const extra = rows.length - shown.length;
  return (
    <View style={styles.glyphs}>
      {shown.map((row) => (
        <SubagentGlyph key={row.id} seed={subagentGlyphSeed(row)} size={14} />
      ))}
      {extra > 0 ? <Text style={styles.extra}>+{extra}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  layer: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: "flex-end",
    paddingTop: theme.spacing[3],
    paddingRight: theme.spacing[4],
  },
  card: {
    width: CARD_WIDTH,
    borderRadius: theme.borderRadius.lg,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
    paddingVertical: theme.spacing[2],
  },
  section: {
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    alignItems: "flex-start",
  },
  heading: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  subagentsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  glyphs: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[0.5],
  },
  extra: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  statusText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foreground,
  },
  statusTextHovered: {
    textDecorationLine: "underline",
  },
  divider: {
    height: theme.borderWidth[1],
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing[1],
  },
  cluster: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.full,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
}));
