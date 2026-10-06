import { useCallback, useMemo, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import type { AgentRoutePreflightResult } from "@getpaseo/protocol/agent-route";
import { SettingsSection } from "@/components/settings/headings/settings-section";
import {
  SelectField,
  type SelectFieldDisplay,
  type SelectFieldOption,
} from "@/components/ui/select-field";
import { useHostRuntimeClient, useHostRuntimeIsConnected } from "@/runtime/host-runtime";
import { settingsStyles } from "@/styles/settings";
import { useAgentRoutesConfig } from "../internal/use-agent-routes-config";
import { AgentRouteRow } from "./agent-route-row";

const NO_DEFAULT_ROUTE_VALUE = "__none__";

export function AgentRoutesSection({ serverId }: { serverId: string }): ReactElement {
  const { t } = useTranslation();
  const isConnected = useHostRuntimeIsConnected(serverId);
  const client = useHostRuntimeClient(serverId);
  const { routes, profiles, defaultRouteId, isSupported, setDefaultRoute, updateRouteDescription } =
    useAgentRoutesConfig(serverId);

  const handleTest = useCallback(
    async (routeId: string): Promise<AgentRoutePreflightResult[]> => {
      if (!client) {
        throw new Error(t("common.errors.daemonClientUnavailable"));
      }
      const payload = await client.preflightAgentRoute(routeId);
      return payload.results;
    },
    [client, t],
  );

  const defaultRouteOptions = useMemo<SelectFieldOption<string>[]>(
    () => [
      {
        id: NO_DEFAULT_ROUTE_VALUE,
        value: NO_DEFAULT_ROUTE_VALUE,
        label: t("agentRoutes.default.none"),
      },
      ...(routes ?? []).map((route) => ({ id: route.id, value: route.id, label: route.name })),
    ],
    [routes, t],
  );
  const defaultRouteValue = defaultRouteId ?? NO_DEFAULT_ROUTE_VALUE;
  const defaultRouteDisplay = useMemo<SelectFieldDisplay | null>(() => {
    const option = defaultRouteOptions.find((entry) => entry.value === defaultRouteValue);
    return option ? { label: option.label } : null;
  }, [defaultRouteOptions, defaultRouteValue]);
  const handleChangeDefaultRoute = useCallback(
    (value: string) => {
      void setDefaultRoute(value === NO_DEFAULT_ROUTE_VALUE ? null : value);
    },
    [setDefaultRoute],
  );

  if (!isConnected || !isSupported) {
    return (
      <SettingsSection title={t("agentRoutes.sectionTitle")} testID="agent-routes-section">
        <View style={settingsStyles.card} testID="agent-routes-unavailable">
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>
              {isConnected ? t("agentRoutes.unsupported") : t("agentRoutes.unavailable")}
            </Text>
          </View>
        </View>
      </SettingsSection>
    );
  }

  return (
    <SettingsSection title={t("agentRoutes.sectionTitle")} testID="agent-routes-section">
      <View style={[settingsStyles.card, styles.defaultCard]} testID="agent-routes-default-card">
        <SelectField
          label={t("agentRoutes.default.label")}
          value={defaultRouteValue}
          selectedDisplay={defaultRouteDisplay}
          options={defaultRouteOptions}
          onChange={handleChangeDefaultRoute}
          placeholder={t("agentRoutes.default.none")}
          emptyText={t("agentRoutes.default.none")}
          testID="agent-routes-default-select"
        />
      </View>
      {routes && routes.length > 0 ? (
        <View style={[settingsStyles.card, styles.routesCard]} testID="agent-routes-card">
          {routes.map((route, index) => (
            <AgentRouteRow
              key={route.id}
              route={route}
              profiles={profiles}
              isFirst={index === 0}
              onTest={handleTest}
              onUpdateDescription={updateRouteDescription}
            />
          ))}
        </View>
      ) : (
        <View style={settingsStyles.card} testID="agent-routes-empty">
          <View style={styles.emptyCard}>
            <Text style={styles.emptyText}>{t("agentRoutes.emptyState")}</Text>
          </View>
        </View>
      )}
      <Text style={styles.configNote}>{t("agentRoutes.configNote")}</Text>
    </SettingsSection>
  );
}

const styles = StyleSheet.create((theme) => ({
  defaultCard: {
    padding: theme.spacing[3],
  },
  routesCard: {
    marginTop: theme.spacing[3],
  },
  emptyCard: {
    paddingVertical: theme.spacing[6],
    paddingHorizontal: theme.spacing[4],
    alignItems: "center",
    gap: theme.spacing[3],
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    textAlign: "center",
  },
  configNote: {
    marginTop: theme.spacing[3],
    marginLeft: theme.spacing[1],
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
}));
