import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import { usePanelStore } from "@/stores/panel-store";
import { SidebarDisplayPreferencesMenu } from "@/components/sidebar/display-preferences/menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const foregroundExtraMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundExtraMuted,
});

/**
 * The panel's "Projects" section header: a sentence-case, small, muted label with a chevron
 * that collapses the whole project/workspace tree. Deliberately NOT the sidebar's usual
 * uppercase/tracked small-caps group-header treatment (docs/design.md §3) — this is the
 * Codex-parity panel's one carve-out, called out there.
 *
 * The trailing `SidebarDisplayPreferencesMenu` pill is the one piece of chrome the Codex
 * mockup doesn't show: grouping, row items, checks display, and the project/label filters
 * had no other home once the old "Workspaces" header (and its own copy of this trigger) was
 * replaced, and dropping them would have been a real functionality regression, not a
 * cosmetic simplification.
 */
export function SidebarPanelProjectsHeader() {
  const { t } = useTranslation();
  const collapsed = usePanelStore((state) => state.desktop.projectsSectionCollapsed);
  const toggle = usePanelStore((state) => state.toggleDesktopSidebarProjectsSection);
  const Chevron = collapsed ? ThemedChevronRight : ThemedChevronDown;
  const accessibilityState = useMemo(() => ({ expanded: !collapsed }), [collapsed]);

  return (
    <View style={styles.row} testID="sidebar-panel-projects-header">
      <Pressable
        style={toggleRowStyle}
        onPress={toggle}
        testID="sidebar-panel-projects-toggle"
        accessible
        accessibilityRole="button"
        accessibilityLabel={t("sidebar.panel.projectsSection")}
        accessibilityState={accessibilityState}
      >
        <Text style={styles.label}>{t("sidebar.panel.projectsSection")}</Text>
        <Chevron size={11} uniProps={foregroundExtraMutedColorMapping} />
      </Pressable>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <View>
            <SidebarDisplayPreferencesMenu />
          </View>
        </TooltipTrigger>
        <TooltipContent side="bottom" align="center" offset={8}>
          <Text style={styles.tooltipText}>{t("sidebar.display.trigger")}</Text>
        </TooltipContent>
      </Tooltip>
    </View>
  );
}

function toggleRowStyle({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.toggleRow, hovered && styles.toggleRowHovered];
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingTop: theme.spacing[3],
    paddingBottom: theme.spacing[1.5],
  },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    borderRadius: theme.borderRadius.sm,
  },
  toggleRowHovered: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  label: {
    fontSize: 13,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foregroundExtraMuted,
  },
  tooltipText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.popoverForeground,
  },
}));
