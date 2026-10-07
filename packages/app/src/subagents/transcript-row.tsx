import { useCallback, useMemo, useState, type ReactElement } from "react";
import { Pressable, Text, View, type GestureResponderEvent } from "react-native";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ROUTE_ID_LABEL } from "@getpaseo/protocol/agent-route";
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { ToolCallDetailsContent } from "@/components/tool-call-details";
import { useAuxClickRef } from "@/hooks/use-aux-click-ref";
import { getShortcutOs } from "@/utils/shortcut-platform";
import { useSessionStore } from "@/stores/session-store";
import type { Theme } from "@/styles/theme";
import { isSubagentOpenAsTabClick, readSubagentClickModifiers } from "./open-gesture";
import { providerSubagentKey, useProviderSubagentStore } from "./provider-store";
import {
  buildManagedSubagentRowPresentation,
  buildNativeSubagentRowPresentation,
  type ManagedSubagentLiveFields,
  type SubagentToolCallRowPresentation,
} from "./transcript-row-model";
import type { SubagentToolCallLink } from "./tool-call-link";
import { resolveManagedElapsedWindow } from "./track-presentation";
import { useElapsedLabel } from "./use-elapsed-label";
import { useOpenSubagent } from "./use-open-subagent";
import { SubagentGlyph } from "./subagent-glyph";
import { subagentGlyphSeed } from "./subagent-glyph-model";

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const CHEVRON_SIZE = 14;

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export interface SubagentToolCallRowProps {
  link: SubagentToolCallLink;
  toolName: string;
  detail: ToolCallDetail;
  toolCallStatus: "executing" | "running" | "completed" | "failed" | "canceled";
  errorText?: string;
  isLoadingDetails: boolean;
  serverId: string;
  /**
   * The hosting pane's own top-level managed agent id — the `parentAgentId` every provider
   * subagent descriptor is keyed under. `null` inside a read-only/nested provider-subagent pane,
   * where the hosting id is a synthetic stream id instead and cannot be trusted for that lookup;
   * the row then renders with its own status and no open action rather than a wrong one.
   */
  parentAgentId: string | null;
  workspaceId: string | undefined;
  isLastInSequence?: boolean;
  disableOuterSpacing?: boolean;
}

function useManagedAgentLiveFields(
  serverId: string,
  agentId: string | null,
): ManagedSubagentLiveFields | null {
  const agent = useSessionStore((state) => {
    if (!agentId) return undefined;
    const session = state.sessions[serverId];
    return session?.agents.get(agentId) ?? session?.agentDetails.get(agentId);
  });
  if (!agent) {
    return null;
  }
  const elapsed = resolveManagedElapsedWindow(agent);
  return {
    title: agent.title,
    provider: agent.provider,
    model: agent.model,
    routeId: agent.labels[ROUTE_ID_LABEL] ?? null,
    isRunning: agent.turn.phase === "open",
    startedAt: elapsed.startedAt,
    endedAt: elapsed.endedAt,
    pendingPermissionCount: agent.pendingPermissions.length,
    isFailed: agent.status === "error",
    lastError: agent.lastError ?? null,
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The `create_agent` call's own task prompt — a title fallback before the agent names itself. */
function readCreateAgentPrompt(detail: ToolCallDetail): string | null {
  if (detail.type !== "unknown" || !isRecord(detail.input)) {
    return null;
  }
  const prompt = detail.input.initialPrompt;
  return typeof prompt === "string" && prompt.length > 0 ? prompt : null;
}

function useNativeDescriptorFields(
  serverId: string,
  parentAgentId: string | null,
  mappedSubagentId: string | null,
) {
  return useProviderSubagentStore((state) => {
    if (!parentAgentId || !mappedSubagentId) return undefined;
    const descriptor = state.descriptors.get(
      providerSubagentKey(serverId, parentAgentId, mappedSubagentId),
    );
    if (!descriptor) return undefined;
    return {
      isRunning: descriptor.status === "running",
      isFailed: descriptor.status === "failed",
      startedAt: new Date(descriptor.createdAt),
      endedAt: new Date(descriptor.updatedAt),
    };
  });
}

interface SubagentToolCallPresentationResult {
  presentation: SubagentToolCallRowPresentation;
  /** Provider id to resolve the row's icon with — known immediately for native rows, only once
   * the agent record hydrates for managed ones. */
  iconProvider: string;
}

/**
 * Resolves the row's presentation from whichever live source applies, subscribing to both stores
 * unconditionally (hook order must stay stable) and letting the inapplicable one return nothing.
 */
function useSubagentToolCallPresentation(input: {
  link: SubagentToolCallLink;
  detail: ToolCallDetail;
  toolCallStatus: SubagentToolCallRowProps["toolCallStatus"];
  serverId: string;
  parentAgentId: string | null;
}): SubagentToolCallPresentationResult {
  const { link, detail } = input;
  const managedAgentId = link.kind === "managed" ? link.agentId : null;
  const managedFields = useManagedAgentLiveFields(input.serverId, managedAgentId);
  const nativeParentAgentId = link.kind === "native" ? input.parentAgentId : null;
  const nativeMappedId = link.kind === "native" ? link.mappedSubagentId : null;
  const descriptor = useNativeDescriptorFields(input.serverId, nativeParentAgentId, nativeMappedId);

  return useMemo(() => {
    if (link.kind === "managed") {
      return {
        presentation: buildManagedSubagentRowPresentation({
          agentId: link.agentId,
          agent: managedFields,
          toolCallDescription: readCreateAgentPrompt(detail),
        }),
        iconProvider: managedFields?.provider ?? "",
      };
    }
    return {
      presentation: buildNativeSubagentRowPresentation({
        provider: link.provider,
        subAgentType: detail.type === "sub_agent" ? (detail.subAgentType ?? null) : null,
        description: detail.type === "sub_agent" ? (detail.description ?? null) : null,
        parentAgentId: nativeParentAgentId ?? "",
        mappedSubagentId: nativeParentAgentId ? nativeMappedId : null,
        descriptor: descriptor ?? null,
        toolCallStatus: input.toolCallStatus,
      }),
      iconProvider: link.provider,
    };
  }, [
    link,
    managedFields,
    nativeParentAgentId,
    nativeMappedId,
    descriptor,
    detail,
    input.toolCallStatus,
  ]);
}

/** The same identity glyph the subagent shows in the track and the panel. */
function resolveTranscriptGlyphSeed(input: {
  link: SubagentToolCallLink;
  parentAgentId: string | null;
  toolName: string;
  detail: ToolCallDetail;
}): string {
  if (input.link.kind === "managed") return input.link.agentId;
  if (input.parentAgentId && input.link.mappedSubagentId) {
    return subagentGlyphSeed({
      kind: "provider",
      id: input.link.mappedSubagentId,
      parentAgentId: input.parentAgentId,
    });
  }
  const task =
    input.detail.type === "sub_agent"
      ? (input.detail.description ?? input.detail.subAgentType ?? "")
      : "";
  return `${input.toolName}:${task}`;
}

export function SubagentToolCallRow(props: SubagentToolCallRowProps): ReactElement {
  const { t } = useTranslation();
  const {
    link,
    toolName,
    detail,
    toolCallStatus,
    errorText,
    isLoadingDetails,
    serverId,
    parentAgentId,
    workspaceId,
    isLastInSequence = false,
    disableOuterSpacing = false,
  } = props;
  const [isExpanded, setIsExpanded] = useState(false);
  const { presentation } = useSubagentToolCallPresentation({
    link,
    detail,
    toolCallStatus,
    serverId,
    parentAgentId,
  });
  const glyphSeed = resolveTranscriptGlyphSeed({ link, parentAgentId, toolName, detail });

  const { openSubagent, openProviderSubagent } = useOpenSubagent({ serverId, workspaceId });
  const isMac = useMemo(() => getShortcutOs() === "mac", []);
  const openRow = useCallback(
    (forceTab: boolean) => {
      const target = presentation.openTarget;
      if (!target) return;
      if (target.kind === "agent") {
        openSubagent(target.agentId, { forceTab });
      } else {
        openProviderSubagent(target.parentAgentId, target.subagentId, { forceTab });
      }
    },
    [openProviderSubagent, openSubagent, presentation.openTarget],
  );
  const handlePress = useCallback(
    (event: GestureResponderEvent) => {
      const modifiers = readSubagentClickModifiers(event);
      openRow(isSubagentOpenAsTabClick(modifiers, { isMac }));
    },
    [isMac, openRow],
  );
  const handleAuxClick = useMemo(
    () => (presentation.openTarget ? () => openRow(true) : undefined),
    [openRow, presentation.openTarget],
  );
  const auxClickRef = useAuxClickRef(handleAuxClick);

  const toggleExpanded = useCallback(() => setIsExpanded((previous) => !previous), []);
  const statusLabel = t(
    presentation.statusText.key,
    presentation.statusText.params ? { reason: presentation.statusText.params.reason } : undefined,
  );
  const elapsedLabel = useElapsedLabel({
    startedAt: presentation.startedAt,
    isRunning: presentation.isRunning,
    endedAt: presentation.endedAt,
  });
  const displayTitle =
    presentation.titleState === "loading" ? t("common.states.loading") : presentation.title;
  const accessibilityLabel = presentation.meta
    ? `${displayTitle}, ${presentation.meta}, ${statusLabel}`
    : `${displayTitle}, ${statusLabel}`;

  const rowContent = (
    <>
      <SubagentGlyph seed={glyphSeed} size={16} />
      <View style={styles.textColumn}>
        <View style={styles.titleRow}>
          <Text style={styles.titleText} numberOfLines={1}>
            {displayTitle}
          </Text>
          {presentation.meta ? (
            <>
              <Text style={styles.metaDivider}>{"·"}</Text>
              <Text style={styles.metaText} numberOfLines={1}>
                {presentation.meta}
              </Text>
            </>
          ) : null}
        </View>
        <View style={styles.statusRow}>
          <Text style={styles.statusText} numberOfLines={1}>
            {statusLabel}
          </Text>
          {elapsedLabel ? (
            <>
              <Text style={styles.statusDivider}>{"·"}</Text>
              <Text style={styles.elapsedText}>{elapsedLabel}</Text>
            </>
          ) : null}
        </View>
      </View>
    </>
  );

  return (
    <View
      ref={auxClickRef}
      style={[styles.container, !disableOuterSpacing && styles.containerSpacing]}
      testID="subagent-tool-call-row"
    >
      <View style={styles.card}>
        {presentation.openTarget ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel}
            onPress={handlePress}
            style={styles.row}
          >
            {rowContent}
          </Pressable>
        ) : (
          <View accessibilityLabel={accessibilityLabel} style={styles.row}>
            {rowContent}
          </View>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t(
            isExpanded ? "subagents.collapseAction" : "subagents.expandAction",
            { label: displayTitle },
          )}
          testID="subagent-tool-call-row-expand"
          onPress={toggleExpanded}
          hitSlop={8}
          style={styles.chevron}
        >
          {isExpanded ? (
            <ThemedChevronDown size={CHEVRON_SIZE} uniProps={mutedColorMapping} />
          ) : (
            <ThemedChevronRight size={CHEVRON_SIZE} uniProps={mutedColorMapping} />
          )}
        </Pressable>
      </View>
      {isExpanded ? (
        <View style={[styles.detailWrapper, isLastInSequence && styles.detailWrapperLast]}>
          <ToolCallDetailsContent
            toolName={toolName}
            detail={detail}
            errorText={errorText}
            showLoadingSkeleton={isLoadingDetails}
          />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    alignItems: "flex-start",
    flexWrap: "wrap",
    gap: theme.spacing[1],
  },
  containerSpacing: {
    marginBottom: theme.spacing[2],
  },
  card: {
    flexDirection: "row",
    alignItems: "center",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    paddingLeft: theme.spacing[2],
  },
  textColumn: {
    flexGrow: 1,
    flexShrink: 1,
    minWidth: 0,
    gap: theme.spacing[0.5],
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "baseline",
    minWidth: 0,
    gap: theme.spacing[1],
  },
  metaDivider: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  titleText: {
    flexShrink: 1,
    minWidth: 0,
    fontSize: theme.fontSize.base,
    color: theme.colors.foreground,
  },
  metaText: {
    flexShrink: 2,
    minWidth: 0,
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  statusRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  statusText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  statusDivider: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  elapsedText: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
    fontVariant: ["tabular-nums"],
  },
  chevron: {
    alignSelf: "stretch",
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[2],
  },
  detailWrapper: {
    width: "100%",
    marginTop: theme.spacing[1],
  },
  detailWrapperLast: {
    marginBottom: 0,
  },
}));
