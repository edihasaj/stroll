import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ArrowUpRight, Check, Terminal } from "lucide-react-native";
import { Button } from "@/components/ui/button";
import { useCliInstall } from "@/desktop/hooks/use-install-status";
import { settingsStyles } from "@/styles/settings";
import { openExternalUrl } from "@/utils/open-external-url";

const CLI_DOCS_URL = "https://paseo.sh/docs/cli";

const ThemedArrowUpRight = withUnistyles(ArrowUpRight, (theme) => ({
  size: theme.iconSize.sm,
  color: theme.colors.foregroundMuted,
}));
const ThemedCheck = withUnistyles(Check, (theme) => ({
  size: 14,
  color: theme.colors.foregroundMuted,
}));
const ThemedTerminal = withUnistyles(Terminal, (theme) => ({
  size: theme.iconSize.md,
  color: theme.colors.foreground,
}));

const docsIcon = <ThemedArrowUpRight />;

function CliDocsLink() {
  const { t } = useTranslation();
  const handleOpenDocs = useCallback(() => {
    void openExternalUrl(CLI_DOCS_URL);
  }, []);
  return (
    <Button
      variant="ghost"
      size="sm"
      leftIcon={docsIcon}
      textStyle={settingsStyles.sectionHeaderLinkText}
      style={settingsStyles.sectionHeaderLink}
      onPress={handleOpenDocs}
      accessibilityLabel={t("settings.integrations.docs.openCli")}
    >
      {t("settings.integrations.docs.cli")}
    </Button>
  );
}

/** The install-the-CLI row. Desktop only; lives in the About card next to version and updates. */
export function CliInstallRow() {
  const { t } = useTranslation();
  const { status, isInstalling, install, refresh } = useCliInstall();
  useFocusEffect(
    useCallback(() => {
      refresh();
      return undefined;
    }, [refresh]),
  );
  return (
    <View style={[settingsStyles.row, settingsStyles.rowBorder]} testID="settings-cli-install-row">
      <View style={settingsStyles.rowContent}>
        <View style={styles.rowTitleRow}>
          <ThemedTerminal />
          <Text style={settingsStyles.rowTitle}>
            {t("settings.integrations.commandLine.title")}
          </Text>
        </View>
        <Text style={settingsStyles.rowHint}>
          {t("settings.integrations.commandLine.description")}
        </Text>
      </View>
      <View style={styles.trailing}>
        <CliDocsLink />
        {status?.installed ? (
          <View style={styles.installedLabel}>
            <ThemedCheck />
            <Text style={styles.mutedText}>{t("settings.integrations.actions.installed")}</Text>
          </View>
        ) : (
          <Button variant="outline" size="sm" onPress={install} disabled={isInstalling}>
            {isInstalling
              ? t("settings.integrations.actions.installing")
              : t("settings.integrations.actions.install")}
          </Button>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  rowTitleRow: { flexDirection: "row", alignItems: "center", gap: theme.spacing[2] },
  trailing: { flexDirection: "row", alignItems: "center", gap: theme.spacing[2] },
  installedLabel: { flexDirection: "row", alignItems: "center", gap: 4 },
  mutedText: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.base },
}));
