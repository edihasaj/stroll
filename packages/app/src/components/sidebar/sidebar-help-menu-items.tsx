import { useCallback } from "react";
import { View } from "react-native";
import { Activity, Gift, Keyboard } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { GitHubIcon } from "@/components/icons/github-icon";
import {
  DropdownMenuHint,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { useAppDiagnosticStore } from "@/diagnostics/store";
import { useKeyboardShortcutsAvailable } from "@/keyboard/availability";
import { useHostRuntimeIsConnected, useHosts } from "@/runtime/host-runtime";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { useSessionStore } from "@/stores/session-store";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import type { HostProfile } from "@/types/host-connection";
import { formatVersionWithPrefix } from "@/desktop/updates/desktop-updates";
import { resolveAppVersion } from "@/utils/app-version";
import { openChangelog } from "@/changelog";
import { openExternalUrl } from "@/utils/open-external-url";

const GITHUB_ISSUE_URL = "https://github.com/edihasaj/stroll/issues/new";

const ThemedActivity = withUnistyles(Activity);
const ThemedGift = withUnistyles(Gift);
const ThemedKeyboard = withUnistyles(Keyboard);
const ThemedGitHubIcon = withUnistyles(GitHubIcon);
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const diagnosticLeadingIcon = (
  <ThemedActivity size={ICON_SIZE.sm} uniProps={foregroundMutedColorMapping} />
);
const shortcutsLeadingIcon = (
  <ThemedKeyboard size={ICON_SIZE.sm} uniProps={foregroundMutedColorMapping} />
);
const githubLeadingIcon = (
  <ThemedGitHubIcon size={ICON_SIZE.sm} uniProps={foregroundMutedColorMapping} />
);
const changelogLeadingIcon = (
  <ThemedGift size={ICON_SIZE.sm} uniProps={foregroundMutedColorMapping} />
);

function HostVersionHint({ host }: { host: HostProfile }) {
  const { t } = useTranslation();
  const isConnected = useHostRuntimeIsConnected(host.serverId);
  const daemonVersion = useSessionStore(
    (state) => state.sessions[host.serverId]?.serverInfo?.version ?? null,
  );
  const version = isConnected
    ? formatVersionWithPrefix(daemonVersion)
    : t("settings.about.offline");

  return (
    <DropdownMenuHint
      style={styles.versionHint}
      trailing={version}
      testID={`sidebar-help-host-version-${host.serverId}`}
    >
      {host.label}
    </DropdownMenuHint>
  );
}

/**
 * The Help section's items: shortcuts, what's new, diagnostics, report an issue, and each
 * connected host's version. Shared by the mobile sidebar's standalone `SidebarHelpMenu` trigger
 * (`sidebar-help-menu.tsx`) and the desktop rail's `•••` overflow (`sidebar-more-menu.tsx`),
 * which folds Help in alongside History and Import session. One set of `sidebar-help-*` ids
 * regardless of which menu contains them — the two triggers never render at once, the same
 * "visible one carries the id" rule `sidebar-settings` already follows across breakpoints.
 */
export function SidebarHelpMenuItems() {
  const { t } = useTranslation();
  const shortcutsAvailable = useKeyboardShortcutsAvailable();
  const openAppDiagnostic = useAppDiagnosticStore((state) => state.open);
  const setShortcutsDialogOpen = useKeyboardShortcutsStore((state) => state.setShortcutsDialogOpen);
  const version = formatVersionWithPrefix(resolveAppVersion());
  const hosts = useHosts();

  const openKeyboardShortcuts = useCallback(() => {
    setShortcutsDialogOpen(true);
  }, [setShortcutsDialogOpen]);

  const openGitHubIssue = useCallback(() => {
    void openExternalUrl(GITHUB_ISSUE_URL);
  }, []);

  return (
    <>
      <DropdownMenuLabel>{t("sidebar.help.sectionHelp")}</DropdownMenuLabel>
      {shortcutsAvailable ? (
        <DropdownMenuItem
          testID="sidebar-help-shortcuts"
          leading={shortcutsLeadingIcon}
          onSelect={openKeyboardShortcuts}
        >
          {t("sidebar.help.shortcuts")}
        </DropdownMenuItem>
      ) : null}
      <DropdownMenuItem
        testID="sidebar-help-changelog"
        leading={changelogLeadingIcon}
        onSelect={openChangelog}
      >
        {t("sidebar.help.whatsNew")}
      </DropdownMenuItem>
      <DropdownMenuItem
        testID="sidebar-help-diagnostics"
        leading={diagnosticLeadingIcon}
        onSelect={openAppDiagnostic}
      >
        {t("sidebar.help.diagnostics")}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>{t("sidebar.help.reportIssue")}</DropdownMenuLabel>
      <DropdownMenuItem
        testID="sidebar-help-github"
        leading={githubLeadingIcon}
        onSelect={openGitHubIssue}
      >
        {t("sidebar.help.github")}
      </DropdownMenuItem>
      <DropdownMenuSeparator />
      <View style={styles.versionList}>
        <DropdownMenuHint
          style={styles.versionHint}
          trailing={version}
          testID="sidebar-help-version"
        >
          {t("sidebar.help.appName")}
        </DropdownMenuHint>
        {hosts.map((host) => (
          <HostVersionHint key={host.serverId} host={host} />
        ))}
      </View>
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  versionList: {
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[2],
  },
  versionHint: {
    paddingVertical: 0,
  },
}));
