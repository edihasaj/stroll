import { router } from "expo-router";
import { useCallback, useRef, useState, type ComponentType, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { ChevronDown, MessageSquarePlus, PanelLeft, Search } from "lucide-react-native";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { HostPicker } from "@/components/hosts/host-picker";
import { StrollLogo } from "@/components/icons/stroll-logo";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useAppReducedMotion, withMotion } from "@/hooks/use-app-reduced-motion";
import { builtinSidebarNavLabelKey } from "@/sidebar-nav/model";
import { appearEntering, appearExiting } from "@/styles/motion";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";
import { usePanelStore } from "@/stores/panel-store";
import type { Theme } from "@/styles/theme";
import { buildNewWorkspaceRoute } from "@/utils/host-routes";
import { useActiveHostSummary } from "./use-active-host-summary";

const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedSearch = withUnistyles(Search);
const ThemedMessageSquarePlus = withUnistyles(MessageSquarePlus);
const ThemedPanelLeft = withUnistyles(PanelLeft);

const BRAND_MARK_SIZE = 22;
const GHOST_ICON_SIZE = 16;

/**
 * The sidebar's top row: the Stroll mark, the active host's name behind the same host picker
 * the footer uses, and a row of ghost icon buttons for the actions a new session starts with
 * most often. Converges on `<HostPicker>` rather than a second switcher implementation — this
 * is a different trigger for the same menu the footer's host button opens, and the ghost icons
 * call the same navigation and store actions the nav rows and footer already use.
 *
 * `rail` (SB1) swaps the horizontal row for a vertical icon-only column: brand mark on top,
 * the collapse toggle underneath (now pointed the other way, expanding back out). The search
 * and new-workspace ghost icons drop out in rail — they duplicate nav rows entries already
 * shown there — so the toggle stays the sole idle affordance besides the mark itself.
 */
export function SidebarBrandRow({
  onAddHost,
  onOpenHostSettings,
  rail = false,
}: {
  onAddHost: () => void;
  onOpenHostSettings: (serverId: string) => void;
  rail?: boolean;
}) {
  const { t } = useTranslation();
  const { hosts, label: hostLabel } = useActiveHostSummary();
  const reducedMotion = useAppReducedMotion();

  const triggerRef = useRef<View | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const handleOpen = useCallback(() => setIsOpen(true), []);
  const handleSelect = useCallback((id: string) => onOpenHostSettings(id), [onOpenHostSettings]);

  const toggleSidebarRailMode = usePanelStore((state) => state.toggleDesktopSidebarRailMode);
  const handleToggleRail = useCallback(() => toggleSidebarRailMode(), [toggleSidebarRailMode]);

  const setCommandCenterOpen = useKeyboardShortcutsStore((state) => state.setCommandCenterOpen);
  const handleSearch = useCallback(() => setCommandCenterOpen(true), [setCommandCenterOpen]);

  const handleNewWorkspace = useCallback(() => {
    router.push(buildNewWorkspaceRoute());
  }, []);

  const toggleLabel = rail
    ? t("sidebar.actions.expandSidebar")
    : t("sidebar.actions.collapseToRail");

  const hostPicker = (
    <HostPicker
      hosts={hosts}
      value=""
      onSelect={handleSelect}
      open={isOpen}
      onOpenChange={setIsOpen}
      anchorRef={triggerRef}
      includeAddHost
      onAddHost={onAddHost}
      showActiveConnection
      onOpenHostSettings={onOpenHostSettings}
      searchable
      desktopPlacement="bottom-start"
      desktopMinWidth={240}
    >
      {rail ? (
        <RailIconButton triggerRef={triggerRef} onPress={handleOpen} label={hostLabel}>
          <StrollLogo size={BRAND_MARK_SIZE} />
        </RailIconButton>
      ) : (
        <BrandTrigger triggerRef={triggerRef} onPress={handleOpen} label={hostLabel} />
      )}
    </HostPicker>
  );

  if (rail) {
    return (
      <Animated.View
        style={styles.railColumn}
        entering={withMotion(reducedMotion, appearEntering)}
        exiting={withMotion(reducedMotion, appearExiting)}
      >
        {hostPicker}
        <GhostIconButton
          icon={ThemedPanelLeft}
          label={toggleLabel}
          testID="sidebar-brand-collapse"
          onPress={handleToggleRail}
          side="right"
        />
      </Animated.View>
    );
  }

  return (
    <Animated.View
      style={styles.row}
      entering={withMotion(reducedMotion, appearEntering)}
      exiting={withMotion(reducedMotion, appearExiting)}
    >
      {hostPicker}
      <View style={styles.ghostGroup}>
        <GhostIconButton
          icon={ThemedSearch}
          label={t(builtinSidebarNavLabelKey("search"))}
          testID="sidebar-brand-search"
          onPress={handleSearch}
        />
        <GhostIconButton
          icon={ThemedMessageSquarePlus}
          label={t(builtinSidebarNavLabelKey("new-workspace"))}
          testID="sidebar-brand-new"
          onPress={handleNewWorkspace}
        />
        <GhostIconButton
          icon={ThemedPanelLeft}
          label={toggleLabel}
          testID="sidebar-brand-collapse"
          onPress={handleToggleRail}
        />
      </View>
    </Animated.View>
  );
}

function BrandTrigger({
  triggerRef,
  onPress,
  label,
}: {
  triggerRef: RefObject<View | null>;
  onPress: () => void;
  label: string;
}) {
  const triggerStyle = useCallback(
    ({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.trigger,
      hovered && styles.triggerHovered,
    ],
    [],
  );
  return (
    <Pressable
      ref={triggerRef}
      style={triggerStyle}
      onPress={onPress}
      testID="sidebar-brand-trigger"
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <StrollLogo size={BRAND_MARK_SIZE} />
      <Text style={styles.triggerLabel} numberOfLines={1}>
        {label}
      </Text>
      <ThemedChevronDown size={14} uniProps={foregroundMutedColorMapping} />
    </Pressable>
  );
}

/** Rail-mode brand mark: icon-only trigger, tooltip carries the host name. */
function RailIconButton({
  triggerRef,
  onPress,
  label,
  children,
}: {
  triggerRef: RefObject<View | null>;
  onPress: () => void;
  label: string;
  children: React.ReactNode;
}) {
  const triggerStyle = useCallback(
    ({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.railBrandButton,
      hovered && styles.railBrandButtonHovered,
    ],
    [],
  );
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Pressable
          ref={triggerRef}
          style={triggerStyle}
          onPress={onPress}
          testID="sidebar-brand-trigger"
          accessible
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          {children}
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="right" align="center" offset={8}>
        <Text style={styles.tooltipText}>{label}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

type ThemedIcon = ComponentType<{
  size: number;
  uniProps: (theme: Theme) => { color: string };
}>;

function GhostIconButton({
  icon: Icon,
  label,
  testID,
  onPress,
  side = "bottom",
}: {
  icon: ThemedIcon;
  label: string;
  testID: string;
  onPress: () => void;
  side?: "bottom" | "right";
}) {
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Pressable
          style={styles.ghostButton}
          onPress={onPress}
          testID={testID}
          accessible
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          {({ hovered }) => (
            <Icon
              size={GHOST_ICON_SIZE}
              uniProps={hovered ? foregroundColorMapping : foregroundMutedColorMapping}
            />
          )}
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side={side} align="center" offset={8}>
        <Text style={styles.tooltipText}>{label}</Text>
      </TooltipContent>
    </Tooltip>
  );
}

const styles = StyleSheet.create((theme) => ({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1.5],
  },
  railColumn: {
    flexDirection: "column",
    alignItems: "center",
    gap: theme.spacing[1.5],
    paddingVertical: theme.spacing[1.5],
  },
  trigger: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1.5],
    minWidth: 0,
    flexShrink: 1,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.lg,
  },
  triggerHovered: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  triggerLabel: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
  },
  railBrandButton: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.lg,
  },
  railBrandButtonHovered: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  ghostGroup: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[0.5],
    flexShrink: 0,
  },
  ghostButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  tooltipText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.popoverForeground,
  },
}));
