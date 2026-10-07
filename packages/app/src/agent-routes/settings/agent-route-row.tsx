import { useCallback, useEffect, useMemo, useState, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Text, View, type TextStyle } from "react-native";
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
import { createControlGeometry } from "@/components/ui/control-geometry";
import { EditingTextInput } from "@/components/ui/text-input";
import { isWeb } from "@/constants/platform";
import { useToast } from "@/contexts/toast-context";
import { settingsStyles } from "@/styles/settings";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import { toAgentRoutePreflightResultView } from "../internal/preflight-result-view";

// A multiline input is a textarea on web, which keeps a fixed number of rows. `field-sizing` lets it
// grow with its text in Chromium (the desktop app); other browsers keep two rows and scroll. Native
// multiline inputs grow on their own.
const GROW_WITH_TEXT_ON_WEB: TextStyle | null = isWeb
  ? inlineUnistylesStyle({ fieldSizing: "content" } as unknown as TextStyle)
  : null;

// Enter saves the description through blur instead of starting a new line. On web the input only
// holds the newline back when it has a submit handler, so this one exists for that.
function keepDescriptionOnOneLine(): void {}

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

/**
 * The route's `description` (docs/agent-routes.md): one sentence agents read when choosing a
 * role for a subagent. Commits on blur rather than per keystroke — a patch per character would
 * spam the daemon for a field nothing downstream reads mid-edit. An empty save removes the field
 * (`useAgentRoutesConfig.updateRouteDescription`) rather than persisting an empty string.
 */
function RouteDescriptionField({
  route,
  onUpdateDescription,
}: {
  route: AgentRoute;
  onUpdateDescription: (routeId: string, description: string) => Promise<void>;
}): ReactElement {
  const { t } = useTranslation();
  const toast = useToast();
  const [draft, setDraft] = useState(route.description ?? "");

  useEffect(() => {
    setDraft(route.description ?? "");
  }, [route.description]);

  const handleBlur = useCallback(() => {
    const trimmed = draft.trim();
    if (trimmed === (route.description ?? "")) {
      return;
    }
    void onUpdateDescription(route.id, trimmed).catch((error) => {
      toast.error(error instanceof Error ? error.message : t("errors.unableToSave"));
    });
  }, [draft, onUpdateDescription, route.description, route.id, t, toast]);
  const inputStyle = useMemo(() => [styles.descriptionInput, GROW_WITH_TEXT_ON_WEB], []);

  return (
    <View style={styles.descriptionField}>
      <Text style={styles.descriptionLabel}>{t("agentRoutes.description.label")}</Text>
      {/* Multiline so a long description wraps on a narrow screen instead of running off the edge. */}
      <EditingTextInput
        testID={`agent-route-description-${route.id}`}
        accessibilityLabel={t("agentRoutes.description.label")}
        initialValue={route.description ?? ""}
        onChangeText={setDraft}
        onBlur={handleBlur}
        multiline
        blurOnSubmit
        onSubmitEditing={keepDescriptionOnOneLine}
        placeholder={t("agentRoutes.description.placeholder")}
        placeholderTextColor={styles.descriptionPlaceholder.color}
        style={inputStyle}
      />
    </View>
  );
}

export function AgentRouteRow({
  route,
  profiles,
  isFirst,
  onTest,
  onUpdateDescription,
}: {
  route: AgentRoute;
  profiles: readonly AgentProfile[] | null;
  isFirst: boolean;
  onTest: (routeId: string) => Promise<AgentRoutePreflightResult[]>;
  onUpdateDescription: (routeId: string, description: string) => Promise<void>;
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
      <RouteDescriptionField route={route} onUpdateDescription={onUpdateDescription} />
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

const styles = StyleSheet.create((theme) => {
  const geometry = createControlGeometry(theme);
  return {
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
    descriptionField: {
      paddingHorizontal: theme.spacing[4],
      paddingTop: theme.spacing[2],
      gap: theme.spacing[1],
    },
    descriptionLabel: {
      color: theme.colors.foregroundMuted,
      fontSize: theme.fontSize.sm,
    },
    // The shared field geometry gives the input its fill and hairline border, so it reads as editable.
    descriptionInput: {
      ...geometry.controlRest,
      minHeight: 36,
      paddingVertical: theme.spacing[2],
      paddingHorizontal: theme.spacing[3],
      borderRadius: theme.borderRadius.lg,
      color: theme.colors.foreground,
      fontSize: theme.fontSize.base,
      textAlignVertical: "top",
    },
    descriptionPlaceholder: {
      color: theme.colors.foregroundMuted,
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
  };
});
