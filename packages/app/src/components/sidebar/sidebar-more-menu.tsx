import { router } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { Activity, Gift, History, Import, Keyboard, MoreHorizontal } from "lucide-react-native";
import { Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { GitHubIcon } from "@/components/icons/github-icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuHint,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { buildSessionsRoute } from "@/utils/host-routes";

const GITHUB_ISSUE_URL = "https://github.com/edihasaj/stroll/issues/new";

const ThemedMoreHorizontal = withUnistyles(MoreHorizontal);
const ThemedHistory = withUnistyles(History);
const ThemedImport = withUnistyles(Import);
const ThemedActivity = withUnistyles(Activity);
const ThemedGift = withUnistyles(Gift);
const ThemedKeyboard = withUnistyles(Keyboard);
const ThemedGitHubIcon = withUnistyles(GitHubIcon);

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const historyLeadingIcon = (
  <ThemedHistory size={ICON_SIZE.sm} uniProps={foregroundMutedColorMapping} />
);
const importLeadingIcon = (
  <ThemedImport size={ICON_SIZE.sm} uniProps={foregroundMutedColorMapping} />
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
const diagnosticLeadingIcon = (
  <ThemedActivity size={ICON_SIZE.sm} uniProps={foregroundMutedColorMapping} />
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
      testID={`sidebar-more-host-version-${host.serverId}`}
    >
      {host.label}
    </DropdownMenuHint>
  );
}

/**
 * The rail's `•••` menu: History and Import session (real navigation/flows that used to be
 * top-level nav rows) plus every item `SidebarHelpMenu` already carried. Folding Help in here
 * means the rail does not need a second icon for it — the mockup has one overflow menu, not two.
 */
export function SidebarMoreMenu({
  showHistory,
  handleImportSession,
}: {
  showHistory: boolean;
  handleImportSession: () => void;
}) {
  const { t } = useTranslation();
  const shortcutsAvailable = useKeyboardShortcutsAvailable();
  const openAppDiagnostic = useAppDiagnosticStore((state) => state.open);
  const setShortcutsDialogOpen = useKeyboardShortcutsStore((state) => state.setShortcutsDialogOpen);
  const [open, setOpen] = useState(false);
  const version = formatVersionWithPrefix(resolveAppVersion());
  const hosts = useHosts();

  const handleHistory = useCallback(() => {
    router.push(buildSessionsRoute());
  }, []);

  const openKeyboardShortcuts = useCallback(() => {
    setShortcutsDialogOpen(true);
  }, [setShortcutsDialogOpen]);

  const openGitHubIssue = useCallback(() => {
    void openExternalUrl(GITHUB_ISSUE_URL);
  }, []);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip delayDuration={300} enabledOnDesktop={!open}>
        <TooltipTrigger asChild>
          <View>
            <DropdownMenuTrigger
              style={triggerStyle}
              testID="sidebar-rail-more"
              accessibilityRole="button"
              accessibilityLabel={t("sidebar.rail.more")}
            >
              {({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => (
                <ThemedMoreHorizontal
                  size={ICON_SIZE.md}
                  uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
                />
              )}
            </DropdownMenuTrigger>
          </View>
        </TooltipTrigger>
        <TooltipContent side="right" align="center" offset={8}>
          <Text style={styles.tooltipText}>{t("sidebar.rail.more")}</Text>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent
        side="right"
        align="start"
        offset={8}
        width={280}
        testID="sidebar-rail-more-menu"
      >
        {showHistory ? (
          <DropdownMenuItem
            testID="sidebar-more-history"
            leading={historyLeadingIcon}
            onSelect={handleHistory}
          >
            {t("sidebar.sections.sessions")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          testID="sidebar-more-import-session"
          leading={importLeadingIcon}
          onSelect={handleImportSession}
        >
          {t("importSession.title")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("sidebar.help.sectionHelp")}</DropdownMenuLabel>
        {shortcutsAvailable ? (
          <DropdownMenuItem
            testID="sidebar-more-shortcuts"
            leading={shortcutsLeadingIcon}
            onSelect={openKeyboardShortcuts}
          >
            {t("sidebar.help.shortcuts")}
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuItem
          testID="sidebar-more-changelog"
          leading={changelogLeadingIcon}
          onSelect={openChangelog}
        >
          {t("sidebar.help.whatsNew")}
        </DropdownMenuItem>
        <DropdownMenuItem
          testID="sidebar-more-diagnostics"
          leading={diagnosticLeadingIcon}
          onSelect={openAppDiagnostic}
        >
          {t("sidebar.help.diagnostics")}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel>{t("sidebar.help.reportIssue")}</DropdownMenuLabel>
        <DropdownMenuItem
          testID="sidebar-more-github"
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
            testID="sidebar-more-version"
          >
            {t("sidebar.help.appName")}
          </DropdownMenuHint>
          {hosts.map((host) => (
            <HostVersionHint key={host.serverId} host={host} />
          ))}
        </View>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const triggerStyle = ({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) => [
  styles.trigger,
  hovered && styles.triggerHovered,
];

const styles = StyleSheet.create((theme) => ({
  trigger: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  triggerHovered: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  tooltipText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.popoverForeground,
  },
  versionList: {
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[2],
  },
  versionHint: {
    paddingVertical: 0,
  },
}));
