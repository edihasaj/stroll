import React, { memo, useCallback, useMemo, type ReactNode } from "react";
import { Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import type { TFunction } from "i18next";
import { StyleSheet } from "react-native-unistyles";
import { SPACING } from "@/styles/theme";
import type { TurnTiming } from "@/timeline/turn-time";
import type { StreamItem } from "@/types/stream";
import {
  collectAssistantResponseContentForStreamRenderStrategy,
  type StreamStrategy,
} from "./strategy";
import { resolveAssistantTurnForkBoundary, type AssistantTurnForkBoundary } from "./turn-boundary";
import { AssistantTurnFooter, LiveElapsed, type AssistantForkTarget } from "@/components/message";
import type { TurnFooterHost } from "./layout";
import { AssistantForkMenu } from "@/components/assistant-fork-menu";
import { useRetainedPanelActive } from "@/components/retained-panel";
import { WorkingShimmerText } from "./working-shimmer-text";
import type { LiveActivity } from "./live-activity";

export const TURN_FOOTER_BOTTOM_SPACING = SPACING[8];

export type TurnContentStrategy = StreamStrategy;
export type AssistantTurnForkHandler = (input: {
  target: AssistantForkTarget;
  boundary: AssistantTurnForkBoundary;
}) => Promise<void> | void;
/**
 * Fork handler for the turn that is still streaming. It deliberately takes no
 * boundary: `selectForkContextRows` projects the entire timeline when neither
 * boundary field is given, which is what captures the partially streamed text
 * the user is watching. Pinning a boundary here would silently drop the live
 * response — the opposite of what a fork button next to the loader promises.
 *
 * Kept separate from `AssistantTurnForkHandler` (whose `boundary` stays
 * required) so the compiler keeps enforcing that completed turns always pin one.
 */
export type InFlightTurnForkHandler = (target: AssistantForkTarget) => Promise<void> | void;

export const TurnFooter = memo(function TurnFooter({
  isRunning,
  inFlightTurnStartedAt,
  activity = null,
  host,
  strategy,
  supportsTimelineCursor,
  onForkAssistantTurn,
  onForkInFlightTurn,
}: {
  isRunning: boolean;
  inFlightTurnStartedAt: Date | null;
  /** The running turn's current step; null shows the plain "Working" label. */
  activity?: LiveActivity | null;
  host: TurnFooterHost | null;
  strategy: TurnContentStrategy;
  supportsTimelineCursor: boolean;
  onForkAssistantTurn?: AssistantTurnForkHandler;
  onForkInFlightTurn?: InFlightTurnForkHandler;
}) {
  if (isRunning) {
    return (
      <TurnFooterRow>
        <RunningTurnFooter
          inFlightTurnStartedAt={inFlightTurnStartedAt}
          activity={activity}
          onForkInFlightTurn={onForkInFlightTurn}
        />
      </TurnFooterRow>
    );
  }
  if (!host) {
    return null;
  }
  return (
    <CompletedTurnFooterRow
      strategy={strategy}
      items={host.items}
      timing={host.timing}
      startIndex={host.startIndex}
      supportsTimelineCursor={supportsTimelineCursor}
      onForkAssistantTurn={onForkAssistantTurn}
    />
  );
});

export const CompletedTurnFooterRow = memo(function CompletedTurnFooterRow({
  strategy,
  items,
  timing,
  startIndex,
  supportsTimelineCursor,
  onForkAssistantTurn,
}: {
  strategy: TurnContentStrategy;
  items: StreamItem[];
  timing?: TurnTiming;
  startIndex: number;
  supportsTimelineCursor: boolean;
  onForkAssistantTurn?: AssistantTurnForkHandler;
}) {
  return (
    <TurnFooterRow>
      <CompletedTurnFooter
        strategy={strategy}
        items={items}
        timing={timing}
        startIndex={startIndex}
        supportsTimelineCursor={supportsTimelineCursor}
        onForkAssistantTurn={onForkAssistantTurn}
      />
    </TurnFooterRow>
  );
});

function formatLiveActivity(t: TFunction, activity: LiveActivity | null): string {
  switch (activity?.kind) {
    case "thinking":
      return t("agentStream.turnFooter.thinking");
    case "running":
      return t("agentStream.turnFooter.running", { command: activity.command });
    case "reading":
      return t("agentStream.turnFooter.reading", { file: activity.file });
    case "editing":
      return t("agentStream.turnFooter.editing", { file: activity.file });
    case "searching":
      return activity.query
        ? t("agentStream.turnFooter.searching", { query: activity.query })
        : t("agentStream.turnFooter.working");
    case "fetching":
      return t("agentStream.turnFooter.fetching", { host: activity.host });
    case "subagent":
      return t("agentStream.turnFooter.subagent");
    case "tool":
      return t("agentStream.turnFooter.tool", { tool: activity.name });
    default:
      return t("agentStream.turnFooter.working");
  }
}

const WorkingIndicator = memo(function WorkingIndicator({
  inFlightTurnStartedAt = null,
  activity,
  onForkInFlightTurn,
}: {
  inFlightTurnStartedAt?: Date | null;
  activity: LiveActivity | null;
  onForkInFlightTurn?: InFlightTurnForkHandler;
}) {
  const { t } = useTranslation();
  const active = useRetainedPanelActive();
  // `RunningTurnFooter` only mounts this while the turn is already running, so the shimmer
  // label itself never waits on `inFlightTurnStartedAt` — only the elapsed-time half does.
  // A brand-new agent's first prompt goes active the instant the user submits it, before the
  // daemon's `turn_started` round trip supplies a real `startedAt` ("keeps submission-only
  // activity untimed", turn-liveness.test.ts); gating the whole row on that timestamp left
  // the footer painted-but-empty for the frames in between (the "footer-ownership race").
  // Showing the label right away and fading in "· <elapsed>" once the timestamp lands keeps
  // both invariants: the running indicator appears atomically, and the clock stays untimed
  // until the server confirms when the turn actually started.
  return (
    <View style={stylesheet.turnFooterContent}>
      {/* Match the completed-turn footer: actions precede timing metadata. The shimmer text
          itself is the running indicator — no separate spinner (docs/design.md §4/§16's
          "Codex parity" live-footer shape). */}
      {onForkInFlightTurn ? <AssistantForkMenu onFork={onForkInFlightTurn} /> : null}
      <View style={stylesheet.workingStatus}>
        <WorkingShimmerText style={stylesheet.workingLabel}>
          {formatLiveActivity(t, activity)}
        </WorkingShimmerText>
        {inFlightTurnStartedAt ? (
          <>
            <Text style={stylesheet.workingDot}>·</Text>
            <LiveElapsed
              startedAt={inFlightTurnStartedAt}
              active={active}
              style={stylesheet.workingElapsed}
              testID="turn-working-elapsed"
            />
          </>
        ) : null}
      </View>
    </View>
  );
});

function RunningTurnFooter({
  inFlightTurnStartedAt,
  activity,
  onForkInFlightTurn,
}: {
  inFlightTurnStartedAt: Date | null;
  activity: LiveActivity | null;
  onForkInFlightTurn?: InFlightTurnForkHandler;
}) {
  return (
    <View style={stylesheet.turnFooterSlot} testID="turn-working-indicator">
      <WorkingIndicator
        inFlightTurnStartedAt={inFlightTurnStartedAt}
        activity={activity}
        onForkInFlightTurn={onForkInFlightTurn}
      />
    </View>
  );
}

function CompletedTurnFooter({
  strategy,
  items,
  timing,
  startIndex,
  supportsTimelineCursor,
  onForkAssistantTurn,
}: {
  strategy: TurnContentStrategy;
  items: StreamItem[];
  timing?: TurnTiming;
  startIndex: number;
  supportsTimelineCursor: boolean;
  onForkAssistantTurn?: AssistantTurnForkHandler;
}) {
  const getContent = useCallback(
    () =>
      collectAssistantResponseContentForStreamRenderStrategy({
        strategy,
        items,
        startIndex,
      }),
    [strategy, items, startIndex],
  );
  const boundary = resolveAssistantTurnForkBoundary({
    items,
    startIndex,
    supportsTimelineCursor,
  });
  const handleFork = useCallback(
    (target: AssistantForkTarget) => {
      if (!boundary) {
        return;
      }
      return onForkAssistantTurn?.({ target, boundary });
    },
    [boundary, onForkAssistantTurn],
  );
  return (
    <View style={stylesheet.turnFooterSlot}>
      <AssistantTurnFooter
        getContent={getContent}
        completedAt={timing?.completedAt}
        durationMs={timing?.durationMs}
        onFork={boundary && onForkAssistantTurn ? handleFork : undefined}
      />
    </View>
  );
}

function TurnFooterRow({ children }: { children: ReactNode }) {
  const rowStyle = useMemo(() => [stylesheet.streamItemWrapper, stylesheet.turnFooterRow], []);
  return <View style={rowStyle}>{children}</View>;
}

const stylesheet = StyleSheet.create((theme) => ({
  streamItemWrapper: {
    width: "100%",
    maxWidth: theme.contentMaxWidth,
    alignSelf: "center",
    paddingHorizontal: theme.spacing[2],
  },
  turnFooterRow: {
    marginTop: theme.spacing[2] + 5,
  },
  turnFooterSlot: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    minHeight: 24,
    paddingBottom: TURN_FOOTER_BOTTOM_SPACING,
  },
  turnFooterContent: {
    height: 24,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-start",
    gap: theme.spacing[3],
  },
  workingStatus: {
    flexDirection: "row",
    alignItems: "center",
    flexShrink: 1,
    minWidth: 0,
    gap: theme.spacing[1.5],
  },
  // 13px, pinned literal matching the Codex reference live footer (docs/design.md §16).
  workingElapsed: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: 13,
    fontVariant: ["tabular-nums"],
  },
  workingDot: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: 13,
  },
  workingLabel: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: 13,
  },
}));
