import { PanelLeft, Search } from "lucide-react-native";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { SidebarHostFilterMenu } from "@/components/sidebar/sidebar-host-filter-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { usePanelStore } from "@/stores/panel-store";
import type { Theme } from "@/styles/theme";
import { builtinSidebarNavLabelKey, builtinSidebarNavShortcutAction } from "@/sidebar-nav/model";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import { Shortcut } from "@/components/ui/shortcut";

const ThemedSearch = withUnistyles(Search);
const ThemedPanelLeft = withUnistyles(PanelLeft);
const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/**
 * The panel's top row: "Stroll" behind the host-filter chevron (`SidebarHostFilterMenu`) on the
 * left, then a collapse-to-rail toggle and a Search button (opens the existing Command Center,
 * ⌘K) on the right. The collapse toggle is the rail/expanded state's only remaining affordance
 * now that the old `SidebarBrandRow` (and its `sidebar-brand-collapse` button) is gone — without
 * it, `desktop.sidebarRailMode` would have no UI trigger left at all.
 */
export function SidebarPanelHeader({ showSearch }: { showSearch: boolean }) {
  const { t } = useTranslation();
  const setCommandCenterOpen = useKeyboardShortcutsStore((state) => state.setCommandCenterOpen);
  const searchShortcut = useShortcutKeys(builtinSidebarNavShortcutAction("search"));
  const toggleRailMode = usePanelStore((state) => state.toggleDesktopSidebarRailMode);

  const handleSearch = useCallback(() => {
    setCommandCenterOpen(true);
  }, [setCommandCenterOpen]);

  return (
    <View style={styles.row} testID="sidebar-panel-header">
      <SidebarHostFilterMenu />
      <View style={styles.trailingGroup}>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <Pressable
              style={searchButtonStyle}
              onPress={toggleRailMode}
              testID="sidebar-panel-collapse"
              accessible
              accessibilityRole="button"
              accessibilityLabel={t("sidebar.actions.collapseToRail")}
            >
              {({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => (
                <ThemedPanelLeft
                  size={16}
                  uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
                />
              )}
            </Pressable>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" offset={8}>
            <Text style={styles.tooltipText}>{t("sidebar.actions.collapseToRail")}</Text>
          </TooltipContent>
        </Tooltip>
        {showSearch ? (
          <Tooltip delayDuration={300}>
            <TooltipTrigger asChild>
              <Pressable
                style={searchButtonStyle}
                onPress={handleSearch}
                testID="sidebar-search"
                accessible
                accessibilityRole="button"
                accessibilityLabel={t(builtinSidebarNavLabelKey("search"))}
              >
                {({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => (
                  <ThemedSearch
                    size={17}
                    uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
                  />
                )}
              </Pressable>
            </TooltipTrigger>
            <TooltipContent side="bottom" align="center" offset={8}>
              <View style={styles.tooltipRow}>
                <Text style={styles.tooltipText}>{t(builtinSidebarNavLabelKey("search"))}</Text>
                {searchShortcut ? <Shortcut chord={searchShortcut} /> : null}
              </View>
            </TooltipContent>
          </Tooltip>
        ) : null}
      </View>
    </View>
  );
}

function searchButtonStyle({
  hovered = false,
}: PressableStateCallbackType & { hovered?: boolean }) {
  return [styles.searchButton, hovered && styles.searchButtonHovered];
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
  },
  trailingGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[0.5],
    flexShrink: 0,
  },
  searchButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  searchButtonHovered: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  tooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  tooltipText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.popoverForeground,
  },
}));
