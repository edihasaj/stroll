import { router } from "expo-router";
import { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import { History, Import, MoreHorizontal } from "lucide-react-native";
import { Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ICON_SIZE, type Theme } from "@/styles/theme";
import { buildSessionsRoute } from "@/utils/host-routes";
import { SidebarHelpMenuItems } from "./sidebar-help-menu-items";

const ThemedMoreHorizontal = withUnistyles(MoreHorizontal);
const ThemedHistory = withUnistyles(History);
const ThemedImport = withUnistyles(Import);

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const historyLeadingIcon = (
  <ThemedHistory size={ICON_SIZE.sm} uniProps={foregroundMutedColorMapping} />
);
const importLeadingIcon = (
  <ThemedImport size={ICON_SIZE.sm} uniProps={foregroundMutedColorMapping} />
);

/**
 * The rail's `•••` menu: History and Import session (real navigation/flows that used to be
 * top-level nav rows) plus every item `SidebarHelpMenuItems` carries — the same Help section the
 * mobile sidebar's standalone `SidebarHelpMenu` shows. Folding Help in here means the rail does
 * not need a second icon for it — the mockup has one overflow menu, not two.
 */
export function SidebarMoreMenu({
  showHistory,
  handleImportSession,
}: {
  showHistory: boolean;
  handleImportSession: () => void;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const handleHistory = useCallback(() => {
    router.push(buildSessionsRoute());
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
        <SidebarHelpMenuItems />
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
}));
