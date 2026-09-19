import { router } from "expo-router";
import { FolderPlus, GitBranch, Import, Settings, X } from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { memo, useCallback, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  Pressable,
  StyleSheet as RNStyleSheet,
  Text,
  useWindowDimensions,
  View,
  type PressableStateCallbackType,
} from "react-native";
import { Gesture } from "react-native-gesture-handler";
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";
import { scheduleOnRN } from "react-native-worklets";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { StyleSheet, useUnistyles } from "react-native-unistyles";
import { TitlebarDragRegion } from "@/components/desktop/titlebar-drag-region";
import {
  resolveDesktopSidebarWidth,
  SIDEBAR_RAIL_WIDTH,
} from "@/components/desktop-sidebar-layout";
import { useAppReducedMotion, withMotion } from "@/hooks/use-app-reduced-motion";
import { appearEntering, appearExiting, webAppearStyle } from "@/styles/motion";
import { isWeb } from "@/constants/platform";
import { MOTION_DURATION, MOTION_EASING } from "@/styles/theme";
import {
  SIDEBAR_RESIZE_ACTIVATION_OFFSET,
  SIDEBAR_RESIZE_FAIL_OFFSET,
} from "@/components/sidebar-resize-handle-layout";
import { HostPicker } from "@/components/hosts/host-picker";
import { SidebarDisplayPreferencesMenu } from "@/components/sidebar/display-preferences/menu";
import { SidebarBrandRow } from "@/components/sidebar/sidebar-brand-row";
import { SidebarNavRows } from "@/components/sidebar/sidebar-nav-rows";
import { SidebarSeparator } from "@/components/sidebar/sidebar-separator";
import { SidebarHelpMenu } from "@/components/sidebar/sidebar-help-menu";
import { SidebarResizeHandle } from "@/components/sidebar-resize-handle";
import { Shortcut } from "@/components/ui/shortcut";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { HEADER_INNER_HEIGHT, useIsCompactFormFactor } from "@/constants/layout";
import { useOpenAddProject } from "@/hooks/use-open-add-project";
import { useImportSession } from "@/hooks/use-import-session";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import {
  type SidebarProjectEntry,
  type SidebarWorkspaceEntry,
} from "@/hooks/use-sidebar-workspaces-list";
import { useSidebarModel } from "@/components/sidebar/sidebar-model";
import type { PinnedSidebarGroups } from "@/hooks/use-sidebar-pins";
import { RetainedPanelActivity } from "@/components/retained-panel";
import type { SidebarWorkspaceGroup } from "@/components/sidebar/sidebar-labels";
import type { SidebarProjectIconTarget } from "@/utils/sidebar-project-row-model";
import { type SidebarGroupMode, useSidebarViewStore } from "@/stores/sidebar-view-store";
import { usePanelStore } from "@/stores/panel-store";
import { deriveIdentityColorName, identityColor } from "@/styles/identity-colors";
import { useOwnsWindowChromeCorner, WindowChromeSafeArea } from "@/utils/desktop-window";
import { useCloseAgentListGesture } from "@/mobile-panels/gestures";
import { MobilePanelOverlay } from "@/mobile-panels/presentation";
import { buildSettingsAddHostRoute, buildSettingsRoute } from "@/utils/host-routes";
import { openHostOverview } from "@/navigation/settings-navigation";
import { SidebarAgentListSkeleton } from "./sidebar-agent-list-skeleton";
import { SidebarCalloutSlot } from "./sidebar-callout-slot";
import { useActiveHostSummary } from "./sidebar/use-active-host-summary";
import { SidebarWorkspaceList } from "./sidebar-workspace-list";

type SidebarTheme = ReturnType<typeof useUnistyles>["theme"];

const DEV_BUILD_LABEL = process.env.EXPO_PUBLIC_PASEO_DEV_BUILD_LABEL?.trim() || null;

interface SidebarSharedProps {
  theme: SidebarTheme;
  workspaceGroups: SidebarWorkspaceGroup[];
  projectIconTargets: SidebarProjectIconTarget[];
  pinnedGroups: PinnedSidebarGroups;
  projects: SidebarProjectEntry[];
  hasProjectsBeforeFilter: boolean;
  hasActiveProjectFilter: boolean;
  workspaceEntriesByKey: ReadonlyMap<string, SidebarWorkspaceEntry>;
  isInitialLoad: boolean;
  isRevalidating: boolean;
  isManualRefresh: boolean;
  groupMode: SidebarGroupMode;
  collapsedProjectKeys: ReadonlySet<string>;
  shortcutIndexByWorkspaceKey: Map<string, number>;
  toggleProjectCollapsed: (projectViewKey: string) => void;
  handleRefresh: () => void;
  handleOpenProject: () => void;
  handleImportSession: () => void;
  handleSettings: () => void;
  labels: SidebarLabels;
  handleAddHost: () => void;
  handleOpenHostSettings: (serverId: string) => void;
}

interface SidebarLabels {
  addProject: string;
  hosts: string;
  importSession: string;
  settings: string;
  searchHosts: string;
  closeSidebar: string;
}

interface MobileSidebarProps extends SidebarSharedProps {
  active: boolean;
  insetsTop: number;
  insetsBottom: number;
  closeSidebar: () => void;
}

interface DesktopSidebarProps extends SidebarSharedProps {
  insetsTop: number;
  active: boolean;
}

export const LeftSidebar = memo(function LeftSidebar({ active }: { active: boolean }) {
  const { theme } = useUnistyles();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const isCompactLayout = useIsCompactFormFactor();
  const showMobileAgent = usePanelStore((state) => state.showMobileAgent);

  const {
    projects,
    hasProjectsBeforeFilter,
    resolvedProjectFilters,
    workspaceEntriesByKey,
    isInitialLoad,
    isRevalidating,
    refreshAll,
    workspaceGroups,
    projectIconTargets,
    pinnedGroups,
    collapsedProjectKeys,
    toggleProjectCollapsed,
    groupMode,
    shortcutModel,
  } = useSidebarModel();
  const { shortcutIndexByWorkspaceKey } = shortcutModel;

  const [isManualRefresh, setIsManualRefresh] = useState(false);

  const handleRefresh = useCallback(() => {
    setIsManualRefresh(true);
    refreshAll();
  }, [refreshAll]);

  useEffect(() => {
    if (!isRevalidating && isManualRefresh) {
      setIsManualRefresh(false);
    }
  }, [isRevalidating, isManualRefresh]);

  const openProjectPicker = useOpenAddProject();
  const { open: openImportSession, sheet: importSessionSheet } = useImportSession();

  const handleOpenProjectMobile = useCallback(() => {
    showMobileAgent();
    void openProjectPicker();
  }, [showMobileAgent, openProjectPicker]);

  const handleOpenProjectDesktop = useCallback(() => {
    void openProjectPicker();
  }, [openProjectPicker]);

  const handleSettingsMobile = useCallback(() => {
    showMobileAgent();
    router.push(buildSettingsRoute());
  }, [showMobileAgent]);

  const handleSettingsDesktop = useCallback(() => {
    router.push(buildSettingsRoute());
  }, []);

  const handleAddHostMobile = useCallback(() => {
    showMobileAgent();
    router.push(buildSettingsAddHostRoute(Date.now()));
  }, [showMobileAgent]);

  const handleAddHostDesktop = useCallback(() => {
    router.push(buildSettingsAddHostRoute(Date.now()));
  }, []);

  const handleOpenHostSettingsMobile = useCallback(
    (serverId: string) => {
      showMobileAgent();
      openHostOverview(serverId);
    },
    [showMobileAgent],
  );

  const handleOpenHostSettingsDesktop = useCallback((serverId: string) => {
    openHostOverview(serverId);
  }, []);

  const handleImportSessionMobile = useCallback(() => {
    showMobileAgent();
    openImportSession();
  }, [openImportSession, showMobileAgent]);

  const labels = useMemo(
    (): SidebarLabels => ({
      addProject: t("sidebar.actions.addProject"),
      hosts: t("sidebar.actions.hosts"),
      importSession: t("importSession.title"),
      settings: t("sidebar.actions.settings"),
      searchHosts: t("sidebar.host.searchPlaceholder"),
      closeSidebar: t("sidebar.actions.closeSidebar"),
    }),
    [t],
  );

  const sharedProps = {
    theme,
    workspaceGroups,
    projectIconTargets,
    pinnedGroups,
    projects,
    hasProjectsBeforeFilter,
    hasActiveProjectFilter: resolvedProjectFilters.length > 0,
    workspaceEntriesByKey,
    isInitialLoad,
    isRevalidating,
    isManualRefresh,
    groupMode,
    collapsedProjectKeys,
    shortcutIndexByWorkspaceKey,
    toggleProjectCollapsed,
    handleRefresh,
    labels,
  };

  if (isCompactLayout) {
    return (
      <>
        <RetainedPanelActivity active={active}>
          <MobileSidebar
            {...sharedProps}
            active={active}
            insetsTop={insets.top}
            insetsBottom={insets.bottom}
            closeSidebar={showMobileAgent}
            handleOpenProject={handleOpenProjectMobile}
            handleImportSession={handleImportSessionMobile}
            handleSettings={handleSettingsMobile}
            handleAddHost={handleAddHostMobile}
            handleOpenHostSettings={handleOpenHostSettingsMobile}
          />
        </RetainedPanelActivity>
        {importSessionSheet}
      </>
    );
  }

  return (
    <>
      <RetainedPanelActivity active={active}>
        <DesktopSidebar
          {...sharedProps}
          insetsTop={insets.top}
          active={active}
          handleOpenProject={handleOpenProjectDesktop}
          handleImportSession={openImportSession}
          handleSettings={handleSettingsDesktop}
          handleAddHost={handleAddHostDesktop}
          handleOpenHostSettings={handleOpenHostSettingsDesktop}
        />
      </RetainedPanelActivity>
      {importSessionSheet}
    </>
  );
});

function sidebarHostOptionTestID(serverId: string): string {
  return `sidebar-host-row-${serverId}`;
}

function FooterIconButton({
  buttonRef,
  onPress,
  testID,
  label,
  icon: Icon,
  iconSize,
  shortcutKeys,
  theme,
}: {
  onPress: () => void;
  testID: string;
  label: string;
  icon: typeof FolderPlus;
  iconSize?: number;
  shortcutKeys?: ReturnType<typeof useShortcutKeys>;
  theme: SidebarTheme;
  buttonRef?: RefObject<View | null>;
}) {
  return (
    <Tooltip delayDuration={300}>
      <TooltipTrigger asChild>
        <Pressable
          ref={buttonRef}
          style={styles.footerIconButton}
          testID={testID}
          nativeID={testID}
          collapsable={false}
          accessible
          accessibilityLabel={label}
          accessibilityRole="button"
          onPress={onPress}
        >
          {({ hovered }) => (
            <Icon
              size={iconSize ?? theme.iconSize.md}
              color={hovered ? theme.colors.foreground : theme.colors.foregroundMuted}
            />
          )}
        </Pressable>
      </TooltipTrigger>
      <TooltipContent side="top" align="center" offset={8}>
        <IconTooltipContent label={label} shortcutKeys={shortcutKeys} />
      </TooltipContent>
    </Tooltip>
  );
}

/**
 * The footer's leading identity: a 24px identity-color circle carrying the active host's
 * initial, its name, and the same host picker the brand row opens — a different trigger for
 * the same menu, not a second implementation of host switching.
 */
function SidebarFooterIdentity({
  onAddHost,
  onOpenHostSettings,
  rail = false,
}: {
  onAddHost: () => void;
  onOpenHostSettings: (serverId: string) => void;
  rail?: boolean;
}) {
  const { hosts, serverId, label } = useActiveHostSummary();
  const triggerRef = useRef<View | null>(null);
  const [isOpen, setIsOpen] = useState(false);

  const handleSelect = useCallback(
    (id: string) => {
      onOpenHostSettings(id);
    },
    [onOpenHostSettings],
  );

  const handleOpen = useCallback(() => setIsOpen(true), []);
  const triggerStyle = useCallback(
    ({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) => [
      rail ? styles.footerIdentityTriggerRail : styles.footerIdentityTrigger,
      hovered && styles.footerIdentityTriggerHovered,
    ],
    [rail],
  );

  const trigger = (
    <Pressable
      ref={triggerRef}
      style={triggerStyle}
      onPress={handleOpen}
      testID="sidebar-hosts-trigger"
      nativeID="sidebar-hosts-trigger"
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <View
        style={[
          styles.footerIdentityAvatar,
          { backgroundColor: identityColor(deriveIdentityColorName(serverId ?? label)) },
        ]}
      >
        <Text style={styles.footerIdentityInitial}>{label.charAt(0).toUpperCase()}</Text>
      </View>
      {rail ? null : (
        <Text style={styles.footerIdentityLabel} numberOfLines={1}>
          {label}
        </Text>
      )}
    </Pressable>
  );

  return (
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
      desktopPlacement="top-start"
      desktopMinWidth={240}
      addHostTestID="sidebar-host-add"
      hostOptionTestID={sidebarHostOptionTestID}
    >
      {rail ? (
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>{trigger}</TooltipTrigger>
          <TooltipContent side="right" align="center" offset={8}>
            <Text style={styles.tooltipText}>{label}</Text>
          </TooltipContent>
        </Tooltip>
      ) : (
        trigger
      )}
    </HostPicker>
  );
}

function IconTooltipContent({
  label,
  shortcutKeys,
}: {
  label: string;
  shortcutKeys?: ReturnType<typeof useShortcutKeys>;
}) {
  return (
    <View style={styles.tooltipRow}>
      <Text style={styles.tooltipText}>{label}</Text>
      {shortcutKeys ? <Shortcut chord={shortcutKeys} /> : null}
    </View>
  );
}

function SidebarFooter({
  theme,
  handleImportSession,
  handleSettings,
  labels,
  handleAddHost,
  handleOpenHostSettings,
  rail = false,
}: {
  theme: SidebarTheme;
  handleImportSession: () => void;
  handleSettings: () => void;
  labels: {
    addProject: string;
    hosts: string;
    importSession: string;
    settings: string;
    searchHosts: string;
  };
  handleAddHost: () => void;
  handleOpenHostSettings: (serverId: string) => void;
  rail?: boolean;
}) {
  const settingsKeys = useShortcutKeys("toggle-settings");

  // The footer's Import/Help/Settings buttons are already icon-only with a
  // tooltip in every mode, so only the layout direction and the identity
  // trigger (avatar + host name) need to change for rail.
  return (
    <View style={rail ? styles.sidebarFooterRail : styles.sidebarFooter}>
      <SidebarFooterIdentity
        onAddHost={handleAddHost}
        onOpenHostSettings={handleOpenHostSettings}
        rail={rail}
      />
      <View style={rail ? styles.footerIconRowRail : styles.footerIconRow}>
        <FooterIconButton
          onPress={handleImportSession}
          testID="sidebar-import-session"
          label={labels.importSession}
          icon={Import}
          theme={theme}
        />
        <SidebarHelpMenu />
        <FooterIconButton
          onPress={handleSettings}
          testID="sidebar-settings"
          label={labels.settings}
          icon={Settings}
          shortcutKeys={settingsKeys}
          theme={theme}
        />
      </View>
    </View>
  );
}

function MobileSidebar({
  active,
  theme,
  workspaceGroups,
  projectIconTargets,
  pinnedGroups,
  projects,
  hasProjectsBeforeFilter,
  hasActiveProjectFilter,
  workspaceEntriesByKey,
  isInitialLoad,
  isRevalidating,
  isManualRefresh,
  groupMode,
  collapsedProjectKeys,
  shortcutIndexByWorkspaceKey,
  toggleProjectCollapsed,
  handleRefresh,
  handleOpenProject,
  handleImportSession,
  handleSettings,
  labels,
  handleAddHost,
  handleOpenHostSettings,
  insetsTop,
  insetsBottom,
  closeSidebar,
}: MobileSidebarProps) {
  const hasActiveHostFilter = useSidebarViewStore((state) => state.hostFilters.length > 0);
  const { gesture: closeGesture, gestureRef: closeGestureRef } = useCloseAgentListGesture();

  const handleWorkspacePress = useCallback(() => {
    closeSidebar();
  }, [closeSidebar]);

  const mobileSidebarInsetStyle = useMemo(
    () => ({
      paddingTop: insetsTop,
      paddingBottom: insetsBottom,
      backgroundColor: theme.colors.surfaceSidebar,
    }),
    [insetsTop, insetsBottom, theme.colors.surfaceSidebar],
  );

  return (
    <MobilePanelOverlay
      panel="agent-list"
      closeGesture={closeGesture}
      panelStyle={mobileSidebarInsetStyle}
    >
      <View style={styles.sidebarContent} pointerEvents="auto">
        <WindowChromeSafeArea placement="below" />
        <SidebarNavRows style={styles.sidebarHeaderGroup} onBeforeNavigate={closeSidebar} />
        <SidebarSeparator />
        <WindowChromeSafeArea placement="inline" style={styles.mobileCloseButtonRow}>
          <Pressable
            style={styles.mobileCloseButton}
            onPress={closeSidebar}
            testID="sidebar-close"
            nativeID="sidebar-close"
            accessible
            accessibilityRole="button"
            accessibilityLabel={labels.closeSidebar}
            hitSlop={8}
          >
            {({ hovered, pressed }) => (
              <X
                size={theme.iconSize.md}
                color={hovered || pressed ? theme.colors.foreground : theme.colors.foregroundMuted}
              />
            )}
          </Pressable>
        </WindowChromeSafeArea>

        {isInitialLoad && !hasActiveHostFilter ? (
          <SidebarAgentListSkeleton />
        ) : (
          <SidebarWorkspaceList
            collapsedProjectKeys={collapsedProjectKeys}
            onToggleProjectCollapsed={toggleProjectCollapsed}
            shortcutIndexByWorkspaceKey={shortcutIndexByWorkspaceKey}
            groupMode={groupMode}
            workspaceGroups={workspaceGroups}
            projectIconTargets={projectIconTargets}
            pinnedGroups={pinnedGroups}
            projects={projects}
            hasProjectsBeforeFilter={hasProjectsBeforeFilter}
            hasActiveProjectFilter={hasActiveProjectFilter}
            workspaceEntriesByKey={workspaceEntriesByKey}
            isRefreshing={isManualRefresh && isRevalidating}
            onRefresh={handleRefresh}
            onWorkspacePress={handleWorkspacePress}
            onAddProject={handleOpenProject}
            onImportSession={handleImportSession}
            parentGestureRef={closeGestureRef}
            dragGestureHostActive={active}
            listHeaderComponent={workspacesSectionHeaderElement}
          />
        )}

        <SidebarFooter
          theme={theme}
          handleImportSession={handleImportSession}
          handleSettings={handleSettings}
          labels={labels}
          handleAddHost={handleAddHost}
          handleOpenHostSettings={handleOpenHostSettings}
        />
      </View>
    </MobilePanelOverlay>
  );
}

function DesktopSidebar({
  theme,
  workspaceGroups,
  projectIconTargets,
  pinnedGroups,
  projects,
  hasProjectsBeforeFilter,
  hasActiveProjectFilter,
  workspaceEntriesByKey,
  isInitialLoad,
  isRevalidating,
  isManualRefresh,
  groupMode,
  collapsedProjectKeys,
  shortcutIndexByWorkspaceKey,
  toggleProjectCollapsed,
  handleRefresh,
  handleOpenProject,
  handleImportSession,
  handleSettings,
  labels,
  handleAddHost,
  handleOpenHostSettings,
  insetsTop,
  active,
}: DesktopSidebarProps) {
  const ownsTopLeft = useOwnsWindowChromeCorner("top-left");
  const hasActiveHostFilter = useSidebarViewStore((state) => state.hostFilters.length > 0);
  const sidebarWidth = usePanelStore((state) => state.sidebarWidth);
  const setSidebarWidth = usePanelStore((state) => state.setSidebarWidth);
  // SB1: the sidebar's own inline collapse toggle. Independent of `active` — rail
  // stays open, it just narrows to icons.
  const isRail = usePanelStore((state) => state.desktop.sidebarRailMode);
  const reducedMotion = useAppReducedMotion();
  const { width: viewportWidth } = useWindowDimensions();
  const expandedWidth = resolveDesktopSidebarWidth({
    requestedWidth: sidebarWidth,
    viewportWidth,
  });
  const visibleSidebarWidth = isRail ? SIDEBAR_RAIL_WIDTH : expandedWidth;

  const startWidthRef = useRef(visibleSidebarWidth);
  const resizeWidth = useSharedValue(visibleSidebarWidth);
  const [resizePressed, setResizePressed] = useState(false);
  const showResizeGrip = useCallback(() => setResizePressed(true), []);
  const hideResizeGrip = useCallback(() => setResizePressed(false), []);

  // M3: expanded <-> rail eases the container width over `duration.slow`. Any
  // other width change (drag-resize, a narrower viewport clamping the persisted
  // width) tracks live instead of animating, so dragging never fights a tween.
  const previousIsRailRef = useRef(isRail);
  useEffect(() => {
    const modeChanged = previousIsRailRef.current !== isRail;
    previousIsRailRef.current = isRail;
    if (modeChanged && !reducedMotion) {
      resizeWidth.value = withTiming(visibleSidebarWidth, {
        duration: MOTION_DURATION.slow,
        easing: MOTION_EASING.standard,
      });
      return;
    }
    resizeWidth.value = visibleSidebarWidth;
  }, [isRail, reducedMotion, resizeWidth, visibleSidebarWidth]);

  const resizeGesture = useMemo(
    () =>
      Gesture.Pan()
        .hitSlop({ left: 8, right: 8, top: 0, bottom: 0 })
        .onBegin(() => {
          scheduleOnRN(showResizeGrip);
        })
        // Horizontal intent only, so a finger dragging down the touch grip scrolls
        // the workspace list instead of resizing. Anchoring the start width to the
        // activation translation keeps the extra threshold from jumping the edge.
        .activeOffsetX([-SIDEBAR_RESIZE_ACTIVATION_OFFSET, SIDEBAR_RESIZE_ACTIVATION_OFFSET])
        .failOffsetY([-SIDEBAR_RESIZE_FAIL_OFFSET, SIDEBAR_RESIZE_FAIL_OFFSET])
        .onStart((event) => {
          startWidthRef.current = visibleSidebarWidth - event.translationX;
          resizeWidth.value = visibleSidebarWidth;
        })
        .onUpdate((event) => {
          // Dragging right (positive translationX) increases width
          const newWidth = startWidthRef.current + event.translationX;
          resizeWidth.value = resolveDesktopSidebarWidth({
            requestedWidth: newWidth,
            viewportWidth,
          });
        })
        .onEnd(() => {
          runOnJS(setSidebarWidth)(resizeWidth.value);
        })
        .onFinalize(() => {
          scheduleOnRN(hideResizeGrip);
        }),
    [
      hideResizeGrip,
      resizeWidth,
      setSidebarWidth,
      showResizeGrip,
      viewportWidth,
      visibleSidebarWidth,
    ],
  );

  const resizeAnimatedStyle = useAnimatedStyle(() => ({
    width: resizeWidth.value,
  }));

  const desktopSidebarStyle = useMemo(
    () => [
      staticStyles.desktopSidebar,
      !active && staticStyles.desktopSidebarHidden,
      resizeAnimatedStyle,
    ],
    [active, resizeAnimatedStyle],
  );
  const desktopSidebarBorderStyle = useMemo(
    () => [styles.desktopSidebarBorder, { flex: 1, paddingTop: insetsTop }],
    [insetsTop],
  );
  const sidebarHeaderGroupStyle = useMemo(
    () => [styles.sidebarHeaderGroup, ownsTopLeft && styles.sidebarHeaderGroupBelowChrome],
    [ownsTopLeft],
  );
  // SB1's expanded content is `flex: 1` next to `SidebarFooter` below it — the same in-flow,
  // parent-sized-by-content shape that made the M1 message entrance collapse on web (see
  // `webAppearStyle`'s doc comment in `@/styles/motion`). The workspace list's height can change
  // while it enters (skeleton -> loaded, filtered project count), so it gets the same web CSS
  // treatment; entering stays a Reanimated Keyframe on native.
  const expandedContentStyle = useMemo(
    () => [staticStyles.expandedContent, webAppearStyle(reducedMotion)],
    [reducedMotion],
  );
  return (
    <Animated.View
      accessibilityElementsHidden={!active}
      importantForAccessibility={active ? "auto" : "no-hide-descendants"}
      pointerEvents={active ? "auto" : "none"}
      style={desktopSidebarStyle}
    >
      <View style={desktopSidebarBorderStyle}>
        <View style={styles.sidebarDragArea}>
          {ownsTopLeft || DEV_BUILD_LABEL ? (
            <View style={styles.desktopChromeRow}>
              <TitlebarDragRegion />
              {DEV_BUILD_LABEL ? (
                <View
                  pointerEvents="none"
                  style={styles.devBuildBadge}
                  testID="dev-build-label"
                  accessibilityLabel={`Development build: ${DEV_BUILD_LABEL}`}
                >
                  <GitBranch size={12} color={theme.colors.accentForeground} />
                  <Text numberOfLines={1} ellipsizeMode="tail" style={styles.devBuildBadgeText}>
                    {DEV_BUILD_LABEL}
                  </Text>
                </View>
              ) : null}
            </View>
          ) : (
            <TitlebarDragRegion />
          )}
          <SidebarBrandRow
            onAddHost={handleAddHost}
            onOpenHostSettings={handleOpenHostSettings}
            rail={isRail}
          />
          <SidebarNavRows style={sidebarHeaderGroupStyle} rail={isRail} />
          <SidebarSeparator />
        </View>

        {/* SB1: workspace rows are hidden in rail mode. Cross-fades out on
            collapse and back in on expand (M3) instead of a hard cut. */}
        {!isRail ? (
          <Animated.View
            style={expandedContentStyle}
            entering={isWeb ? undefined : withMotion(reducedMotion, appearEntering)}
            exiting={withMotion(reducedMotion, appearExiting)}
          >
            {isInitialLoad && !hasActiveHostFilter ? (
              <SidebarAgentListSkeleton />
            ) : (
              <SidebarWorkspaceList
                collapsedProjectKeys={collapsedProjectKeys}
                onToggleProjectCollapsed={toggleProjectCollapsed}
                shortcutIndexByWorkspaceKey={shortcutIndexByWorkspaceKey}
                groupMode={groupMode}
                workspaceGroups={workspaceGroups}
                projectIconTargets={projectIconTargets}
                pinnedGroups={pinnedGroups}
                projects={projects}
                hasProjectsBeforeFilter={hasProjectsBeforeFilter}
                hasActiveProjectFilter={hasActiveProjectFilter}
                workspaceEntriesByKey={workspaceEntriesByKey}
                isRefreshing={isManualRefresh && isRevalidating}
                onRefresh={handleRefresh}
                onAddProject={handleOpenProject}
                onImportSession={handleImportSession}
                listHeaderComponent={workspacesSectionHeaderElement}
              />
            )}

            <SidebarCalloutSlot />
          </Animated.View>
        ) : null}

        <SidebarFooter
          theme={theme}
          handleImportSession={handleImportSession}
          handleSettings={handleSettings}
          labels={labels}
          handleAddHost={handleAddHost}
          handleOpenHostSettings={handleOpenHostSettings}
          rail={isRail}
        />

        {!isRail ? (
          <SidebarResizeHandle
            edge="right"
            gesture={resizeGesture}
            pressed={resizePressed}
            testID="left-sidebar-resize-handle"
          />
        ) : null}
      </View>
    </Animated.View>
  );
}

function WorkspacesSectionHeader() {
  return (
    <View style={styles.workspacesSectionHeader}>
      <Text style={styles.workspacesSectionTitle}>Workspaces</Text>
      <View style={styles.workspacesSectionActions}>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>
            <View>
              <SidebarDisplayPreferencesMenu />
            </View>
          </TooltipTrigger>
          <TooltipContent side="bottom" align="center" offset={8}>
            <IconTooltipContent label="Display preferences" />
          </TooltipContent>
        </Tooltip>
      </View>
    </View>
  );
}

// Stable element so the sidebar list's listHeaderComponent prop keeps identity across
// renders (WorkspacesSectionHeader takes no props).
const workspacesSectionHeaderElement = <WorkspacesSectionHeader />;

// Static styles for Animated.Views — must NOT use Unistyles dynamic theme to
// avoid the "Unable to find node on an unmounted component" crash when Unistyles
// tries to patch the native node that Reanimated also manages.
const staticStyles = RNStyleSheet.create({
  desktopSidebar: {
    position: "relative" as const,
  },
  desktopSidebarHidden: {
    display: "none",
  },
  expandedContent: {
    flex: 1,
    minHeight: 0,
  },
});

const styles = StyleSheet.create((theme) => ({
  sidebarHeaderGroup: {
    paddingTop: theme.spacing[2],
    gap: 2,
    paddingBottom: theme.spacing[1.5],
  },
  sidebarHeaderGroupBelowChrome: {
    paddingTop: 0,
  },
  workspacesSectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    // Rendered inside the scroll's listContent (paddingHorizontal spacing[2]). The title
    // lands at spacing[2] left to align with project icons. Settings2's painted path stops
    // inside its 14px SVG, so 4px aligns the ink rather than the SVG box to the row rail.
    paddingLeft: theme.spacing[2],
    paddingRight: 4,
    paddingTop: theme.spacing[1],
    paddingBottom: theme.spacing[1],
  },
  workspacesSectionTitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
    textTransform: "uppercase",
    letterSpacing: theme.letterSpacing.wide,
  },
  workspacesSectionActions: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
  },
  sidebarContent: {
    flex: 1,
    minHeight: 0,
  },
  mobileCloseButtonRow: {
    position: "absolute",
    top: theme.spacing[3],
    left: 0,
    right: 0,
    zIndex: 2,
    alignItems: "flex-end",
    pointerEvents: "box-none",
  },
  mobileCloseButton: {
    // The 16px X paints farther inside its 32px hit target than the 14px Settings2 glyph.
    // This optical inset puts their painted right edges on the same sidebar rail.
    marginRight: theme.spacing[2] + 1.5,
    width: 32,
    height: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.lg,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  desktopSidebarBorder: {
    borderRightWidth: 1,
    borderRightColor: theme.colors.border,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  sidebarDragArea: {
    position: "relative",
  },
  desktopChromeRow: {
    position: "relative",
    height: HEADER_INNER_HEIGHT,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    paddingHorizontal: theme.spacing[3],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: "transparent",
  },
  devBuildBadge: {
    maxWidth: "60%",
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: 2,
    borderRadius: theme.borderRadius.full,
    backgroundColor: theme.colors.accent,
  },
  devBuildBadgeText: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.accentForeground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  sidebarFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  // Rail (SB1): the identity avatar and the icon row no longer fit side by
  // side at 56px, so the footer stacks them instead.
  sidebarFooterRail: {
    flexDirection: "column",
    alignItems: "center",
    gap: theme.spacing[1.5],
    paddingVertical: theme.spacing[2],
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  footerIconRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    flexShrink: 0,
  },
  footerIconRowRail: {
    flexDirection: "column",
    alignItems: "center",
    gap: theme.spacing[1],
    flexShrink: 0,
  },
  footerIdentityTrigger: {
    minWidth: 0,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
    borderRadius: theme.borderRadius.lg,
  },
  footerIdentityTriggerRail: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.lg,
  },
  footerIdentityTriggerHovered: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  footerIdentityAvatar: {
    width: 24,
    height: 24,
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  footerIdentityInitial: {
    color: "#ffffff",
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  footerIdentityLabel: {
    minWidth: 0,
    flexShrink: 1,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foreground,
  },
  footerIconButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[1],
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
