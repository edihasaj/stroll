import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown } from "lucide-react-native";
import { Text, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  useSidebarDisplayPreferences,
  type SidebarDisplayPreferences,
} from "@/components/sidebar/display-preferences/model";
import { useHosts } from "@/runtime/host-runtime";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import type { HostProfile } from "@/types/host-connection";

const ThemedChevronDown = withUnistyles(ChevronDown);
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/**
 * The panel header's "Stroll" label doubles as the trigger for the existing host filter —
 * `sidebar.display.hostFilter` under a dedicated chevron instead of buried inside the full
 * display-preferences menu. Renders nothing interactive when there is only one host: a filter
 * over a single machine has nothing to do, and `showHostFilter` is the same gate
 * `SidebarDisplayPreferencesMenu` already uses for the same reason.
 */
export function SidebarHostFilterMenu() {
  const { t } = useTranslation();
  const hosts = useHosts();
  const preferences = useSidebarDisplayPreferences();

  if (hosts.length <= 1) {
    return <Text style={styles.headerLabelStatic}>{t("sidebar.help.appName")}</Text>;
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        style={triggerStyle}
        testID="sidebar-panel-host-filter"
        accessibilityRole="button"
        accessibilityLabel={t("sidebar.panel.machineFilter")}
      >
        <Text style={styles.headerLabel}>{t("sidebar.help.appName")}</Text>
        <ThemedChevronDown size={ICON_SIZE.xs} uniProps={foregroundMutedColorMapping} />
      </DropdownMenuTrigger>
      <DropdownMenuContent
        side="bottom"
        align="start"
        offset={6}
        width={200}
        testID="sidebar-panel-host-filter-menu"
      >
        <DropdownMenuItem
          selected={preferences.hostFilters.length === 0}
          closeOnSelect={false}
          onSelect={preferences.clearHostFilters}
          testID="sidebar-panel-host-filter-all"
        >
          {t("sidebar.display.hostFilter.all")}
        </DropdownMenuItem>
        {hosts.map((host) => (
          <HostFilterRow key={host.serverId} host={host} preferences={preferences} />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// Exported only so Pressable's render-prop style callback keeps a stable identity.
function triggerStyle({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.trigger, hovered && styles.triggerHovered];
}

function HostFilterRow({
  host,
  preferences,
}: {
  host: HostProfile;
  preferences: SidebarDisplayPreferences;
}) {
  const { toggleHostFilter } = preferences;
  const handleSelect = useCallback(
    () => toggleHostFilter(host.serverId),
    [toggleHostFilter, host.serverId],
  );
  return (
    <DropdownMenuItem
      selected={preferences.hostFilters.includes(host.serverId)}
      closeOnSelect={false}
      onSelect={handleSelect}
      testID={`sidebar-panel-host-filter-${host.serverId}`}
    >
      {host.label?.trim() || host.serverId}
    </DropdownMenuItem>
  );
}

const styles = StyleSheet.create((theme) => ({
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    minWidth: 0,
    flexShrink: 1,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
  },
  triggerHovered: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  headerLabel: {
    fontSize: 17,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: theme.textTracking.tightXl,
    color: theme.colors.foreground,
  },
  headerLabelStatic: {
    fontSize: 17,
    fontWeight: theme.fontWeight.semibold,
    letterSpacing: theme.textTracking.tightXl,
    color: theme.colors.foreground,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
  },
}));
