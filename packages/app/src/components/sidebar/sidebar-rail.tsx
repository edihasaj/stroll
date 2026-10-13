import { router, usePathname } from "expo-router";
import { Folder, Settings as SettingsIcon } from "lucide-react-native";
import { useCallback, useMemo, type ReactNode } from "react";
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
import { LegacyPluginSidebarRow } from "@/plugins/sidebar-items/legacy";
import { useSidebarNavItems } from "@/sidebar-nav/use-sidebar-nav-items";
import { useActiveHostSummary } from "@/components/sidebar/use-active-host-summary";
import { SIDEBAR_RAIL_WIDTH } from "@/components/desktop-sidebar-layout";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { usePanelStore } from "@/stores/panel-store";
import type { Theme } from "@/styles/theme";
import { buildProjectsSettingsRoute } from "@/utils/host-routes";
import { deriveSidebarRailItems } from "./sidebar-rail-model";

const ThemedStrollLogo = withUnistyles(StrollLogo);
const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/** Home toggles the panel. Project/settings routes and the host avatar stay in the fixed rail. */
export function SidebarRail({
  style,
  handleSettings,
  children,
}: {
  style?: StyleProp<ViewStyle>;
  handleSettings: () => void;
  handleImportSession: () => void;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  const pathname = usePathname();
  const { items } = useSidebarNavItems("header");
  const derived = useMemo(() => deriveSidebarRailItems(items), [items]);
  const { serverId: activeServerId } = useActiveHostSummary();
  const settingsShortcut = useShortcutKeys("toggle-settings");
  const toggleRailMode = usePanelStore((state) => state.toggleDesktopSidebarRailMode);

  const isProjectsRoute = pathname.includes("/projects");
  const isSessionsRoute = pathname.startsWith("/sessions");
  const isSchedulesRoute = pathname.startsWith("/schedules");
  const isUsageRoute = pathname.startsWith("/usage");
  const isSettingsRoute = pathname.startsWith("/settings") && !isProjectsRoute;
  const isChatsRoute =
    !isSettingsRoute && !isSessionsRoute && !isSchedulesRoute && !isProjectsRoute && !isUsageRoute;

  const handleChats = useCallback(() => {
    toggleRailMode();
  }, [toggleRailMode]);

  const handleProjects = useCallback(() => {
    if (!activeServerId) return;
    router.push(buildProjectsSettingsRoute(activeServerId));
  }, [activeServerId]);

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

      {derived.pluginItems.map((group) => (
        <LegacyPluginSidebarRow key={group.key} group={group} rail />
      ))}

      <View style={styles.spacer} />

      <SidebarHeaderRow
        icon={SettingsIcon}
        label={t("sidebar.actions.settings")}
        onPress={handleSettings}
        isActive={isSettingsRoute}
        testID="sidebar-settings"
        shortcutKeys={settingsShortcut}
        rail
      />

      {children}
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
