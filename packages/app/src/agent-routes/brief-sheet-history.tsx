import { useCallback, useMemo, useState, type ReactElement } from "react";
import type { TFunction } from "i18next";
import { useTranslation } from "react-i18next";
import { ChevronRight } from "lucide-react-native";
import { Pressable, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { AgentRouteEvent } from "@getpaseo/protocol/agent-route";
import type { AgentProfile } from "@getpaseo/protocol/messages";
import { mutedIconColorMapping } from "@/components/ui/icon-color";
import { ICON_SIZE } from "@/styles/theme";
import { formatTimeAgo } from "@/utils/time";
import { agentRouteFailureReasonText } from "./internal/reason-text";

const ThemedChevron = withUnistyles(ChevronRight);

function resolveProfileName(profiles: readonly AgentProfile[] | null, profileId: string | null) {
  if (!profileId) return null;
  return profiles?.find((profile) => profile.id === profileId)?.name ?? profileId;
}

function routeEventKindLabel(kind: AgentRouteEvent["kind"], t: TFunction): string {
  switch (kind) {
    case "failover":
      return t("agentRoutes.brief.event.failover");
    case "awaiting_choice":
      return t("agentRoutes.brief.event.awaitingChoice");
    case "switch_back":
      return t("agentRoutes.brief.event.switchBack");
    case "paused":
      return t("agentRoutes.brief.event.paused");
    case "resumed":
      return t("agentRoutes.brief.event.resumed");
  }
}

function HistoryRow({
  event,
  profiles,
}: {
  event: AgentRouteEvent;
  profiles: readonly AgentProfile[] | null;
}): ReactElement {
  const { t } = useTranslation();
  const fromName = resolveProfileName(profiles, event.fromProfileId);
  const toName = resolveProfileName(profiles, event.toProfileId);
  const transition = fromName && toName && fromName !== toName ? `${fromName} → ${toName}` : null;
  const reasonText = event.reason ? agentRouteFailureReasonText(event.reason, t) : null;
  const metaParts = [transition, reasonText, formatTimeAgo(new Date(event.at))].filter(
    (part): part is string => Boolean(part),
  );

  return (
    <View style={styles.historyRow}>
      <Text style={styles.historyTitle}>{routeEventKindLabel(event.kind, t)}</Text>
      <Text style={styles.historyMeta}>{metaParts.join(" · ")}</Text>
    </View>
  );
}

/** The collapsible handoff preview and route-event history inside the Context sheet. */
export function AgentBriefHistorySection({
  handoffPreview,
  events,
  profiles,
}: {
  handoffPreview: string | null;
  events: readonly AgentRouteEvent[];
  profiles: readonly AgentProfile[] | null;
}): ReactElement {
  const { t } = useTranslation();
  const [handoffExpanded, setHandoffExpanded] = useState(false);
  const toggleHandoff = useCallback(() => setHandoffExpanded((value) => !value), []);
  const handoffAccessibilityState = useMemo(
    () => ({ expanded: handoffExpanded }),
    [handoffExpanded],
  );

  return (
    <View style={styles.container}>
      {handoffPreview ? (
        <View>
          <Pressable
            accessibilityRole="button"
            accessibilityState={handoffAccessibilityState}
            onPress={toggleHandoff}
            style={styles.disclosureHeader}
            testID="agent-brief-handoff-toggle"
          >
            <Text style={styles.sectionLabel}>{t("agentRoutes.brief.handoffPreview")}</Text>
            <View style={handoffExpanded ? styles.chevronExpanded : undefined}>
              <ThemedChevron size={ICON_SIZE.sm} uniProps={mutedIconColorMapping} />
            </View>
          </Pressable>
          {handoffExpanded ? (
            <View style={styles.handoffCard} testID="agent-brief-handoff-preview">
              <Text style={styles.handoffText}>{handoffPreview}</Text>
            </View>
          ) : null}
        </View>
      ) : null}
      <View>
        <Text style={styles.sectionLabel}>{t("agentRoutes.brief.historyTitle")}</Text>
        {events.length === 0 ? (
          <Text style={styles.emptyText} testID="agent-brief-history-empty">
            {t("agentRoutes.brief.historyEmpty")}
          </Text>
        ) : (
          <View style={styles.historyCard} testID="agent-brief-history">
            {events.map((event, index) => (
              <View
                key={`${event.at}:${event.kind}`}
                style={index > 0 ? styles.historyRowBorder : undefined}
              >
                <HistoryRow event={event} profiles={profiles} />
              </View>
            ))}
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[4],
  },
  disclosureHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: theme.spacing[2],
  },
  sectionLabel: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  chevronExpanded: {
    transform: [{ rotate: "90deg" }],
  },
  handoffCard: {
    marginTop: theme.spacing[2],
    padding: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface1,
  },
  handoffText: {
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.mono,
    fontSize: theme.fontSize.sm,
    lineHeight: Math.round(theme.fontSize.sm * 1.5),
  },
  emptyText: {
    marginTop: theme.spacing[1],
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  historyCard: {
    marginTop: theme.spacing[1],
    borderRadius: theme.borderRadius.lg,
    borderWidth: 1,
    borderColor: theme.colors.border,
    overflow: "hidden",
  },
  historyRowBorder: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.borderDivider,
  },
  historyRow: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: theme.spacing[3],
    gap: theme.spacing[1],
  },
  historyTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  historyMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
