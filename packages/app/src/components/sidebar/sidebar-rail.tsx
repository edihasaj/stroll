import { router, usePathname } from "expo-router";
import { CalendarClock, Folder, PanelLeft, Settings as SettingsIcon } from "lucide-react-native";
import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  Pressable,
  Text,
  View,
  type PressableStateCallbackType,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { StrollLogo } from "@/components/icons/stroll-logo";
import { SidebarHeaderRow } from "@/components/sidebar/sidebar-header-row";
import { SidebarMoreMenu } from "@/components/sidebar/sidebar-more-menu";
import { useActiveHostSummary } from "@/components/sidebar/use-active-host-summary";
import { SIDEBAR_RAIL_WIDTH } from "@/components/desktop-sidebar-layout";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { LegacyPluginSidebarRow } from "@/plugins/sidebar-items/legacy";
import { builtinSidebarNavLabelKey, builtinSidebarNavShortcutAction } from "@/sidebar-nav/model";
import { useSidebarNavItems } from "@/sidebar-nav/use-sidebar-nav-items";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { usePanelStore } from "@/stores/panel-store";
import type { Theme } from "@/styles/theme";
import { buildProjectsSettingsRoute, buildSchedulesRoute } from "@/utils/host-routes";
import { deriveSidebarRailItems } from "./sidebar-rail-model";

const ThemedStrollLogo = withUnistyles(StrollLogo);
const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/**
 * The desktop sidebar's 52px icon rail (Codex parity). Fixed, always-real routes — Chats,
 * Projects, Schedules — plus legacy `addSidebarItem` plugin rows (the only plugin sidebar item
 * shape with a single icon), a `•••` overflow for History/Import/Help, and Settings pinned to
 * the bottom. A current-shape `addSidebarHeaderItem`/`addSidebarFooterItem` plugin item renders
 * an arbitrary full-width component and has no rail icon; `sidebar-rail-model.ts` filters those
 * out. Visibility for the configurable builtins (Schedules in the rail, History inside the
 * overflow) comes from the same `sidebarNavItems` preference the old top-of-sidebar nav rows
 * read — see `sidebar-rail-model.ts`.
 */
export function SidebarRail({
  style,
  handleSettings,
  handleImportSession,
}: {
  style?: StyleProp<ViewStyle>;
  handleSettings: () => void;
  handleImportSession: () => void;
}) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { items } = useSidebarNavItems("header");
  const derived = useMemo(() => deriveSidebarRailItems(items), [items]);
  const { serverId: activeServerId } = useActiveHostSummary();
  const settingsShortcut = useShortcutKeys("toggle-settings");
  const scheduleShortcut = useShortcutKeys(builtinSidebarNavShortcutAction("schedules"));
  const isRail = usePanelStore((state) => state.desktop.sidebarRailMode);
  const toggleRailMode = usePanelStore((state) => state.toggleDesktopSidebarRailMode);

  const isProjectsRoute = pathname.includes("/projects");
  const isSessionsRoute = pathname.startsWith("/sessions");
  const isSchedulesRoute = pathname.startsWith("/schedules");
  const isSettingsRoute = pathname.startsWith("/settings") && !isProjectsRoute;
  const isChatsRoute =
    !isSettingsRoute && !isSessionsRoute && !isSchedulesRoute && !isProjectsRoute;

  const handleChats = useCallback(() => {
    router.push("/");
  }, []);

  const handleProjects = useCallback(() => {
    if (!activeServerId) return;
    router.push(buildProjectsSettingsRoute(activeServerId));
  }, [activeServerId]);

  const handleSchedules = useCallback(() => {
    router.push(buildSchedulesRoute());
  }, []);

  return (
    <View style={[styles.rail, style]} testID="sidebar-rail">
      <RailMarkButton
        label={t("sidebar.sections.chats")}
        onPress={handleChats}
        isActive={isChatsRoute}
        testID="sidebar-rail-chats"
      />

      {activeServerId ? (
        <SidebarHeaderRow
          icon={Folder}
          label={t("settings.projects")}
          onPress={handleProjects}
          isActive={isProjectsRoute}
          testID="sidebar-rail-projects"
          rail
        />
      ) : null}

      {derived.showSchedules ? (
        <SidebarHeaderRow
          icon={CalendarClock}
          label={t(builtinSidebarNavLabelKey("schedules"))}
          onPress={handleSchedules}
          isActive={isSchedulesRoute}
          testID="sidebar-rail-schedules"
          shortcutKeys={scheduleShortcut}
          rail
        />
      ) : null}

      {derived.pluginItems.map((group) => (
        <LegacyPluginSidebarRow key={group.key} group={group} rail />
      ))}

      <SidebarMoreMenu
        showHistory={derived.showHistoryInMore}
        handleImportSession={handleImportSession}
      />

      <View style={styles.spacer} />

      <SidebarHeaderRow
        icon={SettingsIcon}
        label={t("sidebar.actions.settings")}
        onPress={handleSettings}
        isActive={isSettingsRoute}
        testID="sidebar-rail-settings"
        shortcutKeys={settingsShortcut}
        rail
      />

      {/* The panel's own collapse-to-rail toggle (`sidebar-panel-header.tsx`) disappears along
          with the rest of the panel in rail mode, so the rail carries the only way back out. */}
      {isRail ? (
        <SidebarHeaderRow
          icon={PanelLeft}
          label={t("sidebar.actions.expandSidebar")}
          onPress={toggleRailMode}
          testID="sidebar-rail-expand"
          rail
        />
      ) : null}
    </View>
  );
}

/**
 * The rail's first icon — the Stroll mark — isn't a lucide glyph, so it can't go through
 * `SidebarHeaderRow`'s `icon: LucideIcon` prop. Same 34px/radius-md chrome and tooltip, built
 * directly against `StrollLogo`.
 */
function RailMarkButton({
  label,
  onPress,
  isActive,
  testID,
}: {
  label: string;
  onPress: () => void;
  isActive: boolean;
  testID: string;
}) {
  const buttonStyle = useCallback(
    ({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.markButton,
      Boolean(hovered) && !isActive && styles.markButtonHovered,
      isActive && styles.markButtonSelected,
    ],
    [isActive],
  );

  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Pressable
          style={buttonStyle}
          onPress={onPress}
          testID={testID}
          accessible
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          {({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => (
            <ThemedStrollLogo
              size={18}
              uniProps={hovered || isActive ? foregroundColorMapping : foregroundMutedColorMapping}
            />
          )}
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="right" align="center" offset={8}>
        <Text style={styles.tooltipText}>{label}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

const styles = StyleSheet.create((theme) => ({
  rail: {
    width: SIDEBAR_RAIL_WIDTH,
    alignItems: "center",
    paddingTop: theme.spacing[1],
    paddingBottom: theme.spacing[2],
    gap: theme.spacing[1],
  },
  spacer: {
    flex: 1,
  },
  markButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  markButtonHovered: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  markButtonSelected: {
    backgroundColor: theme.colors.interactionSelected,
  },
  tooltipText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.popoverForeground,
  },
}));
