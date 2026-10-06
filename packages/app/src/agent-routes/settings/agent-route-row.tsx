import { useCallback, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import {
  resolveEntryPrivacy,
  resolveRouteFailoverMode,
  resolveRoutePrivacy,
  type AgentRoute,
  type AgentRoutePreflightResult,
} from "@getpaseo/protocol/agent-route";
import type { AgentProfile } from "@getpaseo/protocol/messages";
import { Button } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";
import { settingsStyles } from "@/styles/settings";
import { toAgentRoutePreflightResultView } from "../internal/preflight-result-view";

function resolveProfileName(profiles: readonly AgentProfile[] | null, profileId: string): string {
  return profiles?.find((profile) => profile.id === profileId)?.name ?? profileId;
}

function EntryRow({
  profileLabel,
  privacyLabel,
  probeUrl,
  result,
}: {
  profileLabel: string;
  privacyLabel: string;
  probeUrl: string | undefined;
  result: AgentRoutePreflightResult | undefined;
}): ReactElement {
  const { t } = useTranslation();
  const view = result ? toAgentRoutePreflightResultView(result, t) : null;
  return (
    <View style={styles.entryRow}>
      <View style={styles.entryText}>
        <Text style={settingsStyles.rowTitle}>{profileLabel}</Text>
        <Text style={styles.entryMeta} numberOfLines={1}>
          {probeUrl ? `${privacyLabel} · ${probeUrl}` : privacyLabel}
        </Text>
      </View>
      {view ? (
        <StatusBadge
          size="xs"
          variant={view.ok ? "success" : "error"}
          label={view.ok ? t("agentRoutes.preflight.ready") : (view.detail ?? "")}
        />
      ) : null}
    </View>
  );
}

export function AgentRouteRow({
  route,
  profiles,
  isFirst,
  onTest,
}: {
  route: AgentRoute;
  profiles: readonly AgentProfile[] | null;
  isFirst: boolean;
  onTest: (routeId: string) => Promise<AgentRoutePreflightResult[]>;
}): ReactElement {
  const { t } = useTranslation();
  const [isTesting, setIsTesting] = useState(false);
  const [results, setResults] = useState<AgentRoutePreflightResult[] | null>(null);
  const [testError, setTestError] = useState<string | null>(null);

  const handleTest = useCallback(async () => {
    setIsTesting(true);
    setTestError(null);
    try {
      setResults(await onTest(route.id));
    } catch (error) {
      setTestError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsTesting(false);
    }
  }, [onTest, route.id]);

  const privacyLabel =
    resolveRoutePrivacy(route) === "local"
      ? t("agentRoutes.privacy.local")
      : t("agentRoutes.privacy.cloud");
  const failoverLabel =
    resolveRouteFailoverMode(route) === "auto"
      ? t("agentRoutes.failover.auto")
      : t("agentRoutes.failover.ask");

  return (
    <View
      style={!isFirst ? settingsStyles.rowBorder : undefined}
      testID={`agent-route-${route.id}`}
    >
      <View style={styles.header}>
        <View style={styles.headerText}>
          <Text style={settingsStyles.rowTitle}>{route.name}</Text>
          <View style={styles.badgeRow}>
            <StatusBadge size="xs" label={privacyLabel} />
            <StatusBadge size="xs" label={failoverLabel} />
          </View>
        </View>
        <Button
          size="sm"
          variant="outline"
          onPress={handleTest}
          loading={isTesting}
          testID={`agent-route-test-${route.id}`}
        >
          {isTesting ? t("agentRoutes.preflight.testing") : t("agentRoutes.preflight.test")}
        </Button>
      </View>
      {testError ? <Text style={settingsStyles.rowError}>{testError}</Text> : null}
      <View style={styles.entries}>
        {route.entries.map((entry) => (
          <EntryRow
            key={entry.profileId}
            profileLabel={resolveProfileName(profiles, entry.profileId)}
            privacyLabel={
              resolveEntryPrivacy(entry) === "local"
                ? t("agentRoutes.privacy.local")
                : t("agentRoutes.privacy.cloud")
            }
            probeUrl={entry.probeUrl}
            result={results?.find((result) => result.profileId === entry.profileId)}
          />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingTop: theme.spacing[4],
  },
  headerText: {
    flex: 1,
    minWidth: 0,
    gap: theme.spacing[1],
  },
  badgeRow: {
    flexDirection: "row",
    gap: theme.spacing[2],
  },
  entries: {
    paddingBottom: theme.spacing[2],
  },
  entryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[2],
  },
  entryText: {
    flex: 1,
    minWidth: 0,
  },
  entryMeta: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    marginTop: theme.spacing[1],
  },
}));
