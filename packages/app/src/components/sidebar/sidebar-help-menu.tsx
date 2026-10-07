import { useState } from "react";
import { Text, View } from "react-native";
import { CircleHelp } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { buttonControlHeight } from "@/components/ui/control-geometry";
import { useIsCompactFormFactor } from "@/constants/layout";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { SidebarHelpMenuItems } from "./sidebar-help-menu-items";

const ThemedCircleHelp = withUnistyles(CircleHelp);
const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});

/**
 * The mobile sidebar's standalone Help trigger. The desktop rail folds the same
 * `SidebarHelpMenuItems` into its `•••` overflow instead (`sidebar-more-menu.tsx`) — see that
 * file's doc comment for why there is no second icon for it on desktop.
 */
export function SidebarHelpMenu() {
  const isCompact = useIsCompactFormFactor();
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <Tooltip delayDuration={300} enabledOnDesktop={!open}>
        <TooltipTrigger asChild>
          <View>
            <DropdownMenuTrigger
              style={styles.trigger(isCompact)}
              testID="sidebar-help"
              accessibilityRole="button"
              accessibilityLabel={t("sidebar.help.trigger")}
            >
              {({ hovered }) => (
                <ThemedCircleHelp
                  size={isCompact ? ICON_SIZE.lg : ICON_SIZE.md}
                  uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
                />
              )}
            </DropdownMenuTrigger>
          </View>
        </TooltipTrigger>
        <TooltipContent side="top" align="center" offset={8}>
          <Text style={styles.tooltipText}>{t("sidebar.help.trigger")}</Text>
        </TooltipContent>
      </Tooltip>
      <DropdownMenuContent side="top" align="end" offset={8} width={280} testID="sidebar-help-menu">
        <SidebarHelpMenuItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const styles = StyleSheet.create((theme) => ({
  trigger: (isCompact: boolean) => ({
    width: isCompact ? buttonControlHeight.md : buttonControlHeight.xs,
    height: isCompact ? buttonControlHeight.md : buttonControlHeight.xs,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
  }),
  tooltipText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.popoverForeground,
  },
}));
