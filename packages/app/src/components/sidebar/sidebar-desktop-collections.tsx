import { useCallback, useMemo, useState, type ReactNode, type Ref } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight, Folder, Plus, Settings2 } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { router } from "expo-router";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DraggableList } from "@/components/draggable-list";
import type { DraggableRenderItemInfo } from "@/components/draggable-list.types";
import { SidebarCalloutSlot } from "@/components/sidebar-callout-slot";
import { SidebarAgentListSkeleton } from "@/components/sidebar-agent-list-skeleton";
import { SidebarDisplayPreferencesMenu } from "@/components/sidebar/display-preferences/menu";
import type {
  SidebarProjectEntry,
  SidebarWorkspacePlacement,
} from "@/hooks/use-sidebar-workspaces-list";
import { useOpenAddProject } from "@/hooks/use-open-add-project";
import { usePanelStore } from "@/stores/panel-store";
import {
  useSidebarDesktopStore,
  sidebarProjectMembershipKey,
} from "@/stores/sidebar-desktop-store";
import { useSidebarOrderStore } from "@/stores/sidebar-order-store";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";
import type { Theme } from "@/styles/theme";
import { buildNewWorkspaceRoute } from "@/utils/host-routes";
import { partitionSidebarProjects } from "./desktop-collections";
import { SidebarDesktopChatList } from "./sidebar-desktop-chat-list";

const ThemedFolder = withUnistyles(Folder);
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const ThemedPlus = withUnistyles(Plus);
const ThemedSettings = withUnistyles(Settings2);
const muted = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

function SectionHeader({
  label,
  collapsed,
  onToggle,
  onAdd,
  children,
  testID,
}: {
  label: string;
  collapsed: boolean;
  onToggle: () => void;
  onAdd?: () => void;
  children?: ReactNode;
  testID: string;
}) {
  const [hovered, setHovered] = useState(false);
  const { t } = useTranslation();
  const [focused, setFocused] = useState(false);
  const show = hovered || focused;
  const enter = useCallback(() => setHovered(true), []);
  const leave = useCallback(() => setHovered(false), []);
  const focus = useCallback(() => setFocused(true), []);
  const blur = useCallback(() => setFocused(false), []);
  const accessibilityState = useMemo(() => ({ expanded: !collapsed }), [collapsed]);
  const revealStyle = show ? styles.revealed : styles.hidden;
  const Chevron = collapsed ? ThemedChevronRight : ThemedChevronDown;
  return (
    <View
      style={styles.sectionHeader}
      onPointerEnter={enter}
      onPointerLeave={leave}
      testID={testID}
      onFocus={focus}
      onBlur={blur}
    >
      <Pressable
        style={styles.sectionToggle}
        onPress={onToggle}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityState={accessibilityState}
      >
        <Text style={styles.sectionLabel}>{label}</Text>
        <View style={revealStyle}>
          <Chevron size={12} uniProps={muted} />
        </View>
      </Pressable>
      <View style={[styles.sectionActions, revealStyle]}>
        {children}
        {onAdd ? (
          <Pressable
            style={styles.iconButton}
            onPress={onAdd}
            accessibilityRole="button"
            accessibilityLabel={t("sidebar.actions.addProject")}
            testID={`${testID}-add`}
          >
            <ThemedPlus size={15} uniProps={muted} />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

function OrganizeSidebar({ projects }: { projects: SidebarProjectEntry[] }) {
  const sortOrder = useSidebarDesktopStore((state) => state.sortOrder);
  const setSortOrder = useSidebarDesktopStore((state) => state.setSortOrder);
  const keys = useSidebarDesktopStore((state) => state.projectKeys);
  const add = useSidebarDesktopStore((state) => state.addProject);
  const remove = useSidebarDesktopStore((state) => state.removeProject);
  const updated = useCallback(() => setSortOrder("updated"), [setSortOrder]);
  const manual = useCallback(() => setSortOrder("manual"), [setSortOrder]);
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        style={styles.iconButton}
        accessibilityRole="button"
        accessibilityLabel="Organize sidebar"
        testID="sidebar-organize"
      >
        <ThemedSettings size={15} uniProps={muted} />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" width={240} testID="sidebar-organize-menu">
        <DropdownMenuItem
          selected={sortOrder === "updated"}
          onSelect={updated}
          testID="sidebar-sort-updated"
        >
          Last updated
        </DropdownMenuItem>
        <DropdownMenuItem
          selected={sortOrder === "manual"}
          onSelect={manual}
          testID="sidebar-sort-manual"
        >
          Manual
        </DropdownMenuItem>
        {projects.map((project) => (
          <ManagedProjectOption
            key={project.viewKey}
            project={project}
            keys={keys}
            add={add}
            remove={remove}
          />
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ManagedProjectOption({
  project,
  keys,
  add,
  remove,
}: {
  project: SidebarProjectEntry;
  keys: string[];
  add: (serverId: string, projectId: string) => void;
  remove: (keys: string[]) => void;
}) {
  const membership = useMemo(
    () => project.hosts.map((host) => sidebarProjectMembershipKey(host.serverId, host.projectId)),
    [project],
  );
  const selected = membership.some((key) => keys.includes(key));
  const select = useCallback(() => {
    if (selected) remove(membership);
    else for (const host of project.hosts) add(host.serverId, host.projectId);
  }, [selected, remove, membership, project, add]);
  return (
    <DropdownMenuItem
      selected={selected}
      closeOnSelect={false}
      testID={`sidebar-manage-project-${project.viewKey}`}
      onSelect={select}
    >
      {project.projectName}
    </DropdownMenuItem>
  );
}

function ProjectFolder({
  item: project,
  dragHandleProps,
}: DraggableRenderItemInfo<SidebarProjectEntry>) {
  const {
    role: _role,
    tabIndex: _tabIndex,
    "aria-roledescription": _description,
    ...dragAttributes
  } = dragHandleProps?.attributes ?? {};
  const collapsed = useSidebarCollapsedSectionsStore((state) =>
    state.collapsedProjectKeys.has(project.viewKey),
  );
  const toggle = useSidebarCollapsedSectionsStore((state) => state.toggleProjectCollapsed);
  const remove = useSidebarDesktopStore((state) => state.removeProject);
  const toggleFolder = useCallback(() => toggle(project.viewKey), [toggle, project.viewKey]);
  const accessibilityState = useMemo(() => ({ expanded: !collapsed }), [collapsed]);
  const removeFolder = useCallback(
    () =>
      remove(
        project.hosts.map((host) => sidebarProjectMembershipKey(host.serverId, host.projectId)),
      ),
    [remove, project],
  );
  const addChat = useCallback(() => {
    const host = project.hosts[0];
    if (host)
      router.push(
        buildNewWorkspaceRoute({
          serverId: host.serverId,
          projectId: host.projectId,
          sourceDirectory: host.iconWorkingDir,
        }),
      );
  }, [project]);
  return (
    <View
      {...dragAttributes}
      {...dragHandleProps?.listeners}
      ref={dragHandleProps?.setActivatorNodeRef as Ref<View> | undefined}
      testID={`sidebar-project-folder-${project.viewKey}`}
    >
      <View style={styles.folderRow}>
        <Pressable
          style={styles.folderButton}
          onPress={toggleFolder}
          accessibilityRole="button"
          accessibilityLabel={project.projectName}
          accessibilityState={accessibilityState}
        >
          <ThemedFolder size={16} uniProps={muted} />
          <Text style={styles.folderLabel} numberOfLines={1}>
            {project.projectName}
          </Text>
        </Pressable>
        <DropdownMenu>
          <DropdownMenuTrigger
            style={styles.iconButton}
            accessibilityRole="button"
            accessibilityLabel={`Project actions for ${project.projectName}`}
          >
            <ThemedChevronDown size={12} uniProps={muted} />
          </DropdownMenuTrigger>
          <DropdownMenuContent width={220} align="end">
            <DropdownMenuItem onSelect={addChat}>New chat</DropdownMenuItem>
            <DropdownMenuItem onSelect={removeFolder}>Remove from sidebar</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </View>
      {!collapsed ? (
        <View style={styles.projectChats}>
          <SidebarDesktopChatList
            workspaces={project.workspaces}
            testID={`sidebar-project-chats-${project.viewKey}`}
          />
        </View>
      ) : null}
    </View>
  );
}

const projectKey = (project: SidebarProjectEntry) => project.viewKey;
const renderProject = (info: DraggableRenderItemInfo<SidebarProjectEntry>) => (
  <ProjectFolder {...info} />
);

export function SidebarDesktopCollections({
  projects,
  loading,
  pinned,
}: {
  projects: SidebarProjectEntry[];
  loading: boolean;
  pinned: readonly SidebarWorkspacePlacement[];
}) {
  const { t } = useTranslation();
  const add = useOpenAddProject();
  const keys = useSidebarDesktopStore((state) => state.projectKeys);
  const projectsCollapsed = usePanelStore((state) => state.desktop.projectsSectionCollapsed);
  const toggleProjects = usePanelStore((state) => state.toggleDesktopSidebarProjectsSection);
  const recentsCollapsed = useSidebarDesktopStore((state) => state.recentsCollapsed);
  const toggleRecents = useSidebarDesktopStore((state) => state.toggleRecents);
  const pinnedCollapsed = useSidebarCollapsedSectionsStore((state) => state.collapsedPinned);
  const togglePinned = useSidebarCollapsedSectionsStore((state) => state.togglePinnedCollapsed);
  const order = useSidebarOrderStore((state) => state.projectOrder);
  const setOrder = useSidebarOrderStore((state) => state.setProjectOrder);
  const { managed, recents } = useMemo(() => {
    const collection = partitionSidebarProjects(projects, keys);
    const pinnedKeys = new Set(pinned.map((workspace) => workspace.workspaceKey));
    const folderProjects = [];
    for (const project of collection.managed)
      folderProjects.push({
        ...project,
        workspaces: project.workspaces.filter(
          (workspace) => !pinnedKeys.has(workspace.workspaceKey),
        ),
      });
    return {
      managed: folderProjects,
      recents: collection.recents.filter((workspace) => !pinnedKeys.has(workspace.workspaceKey)),
    };
  }, [projects, keys, pinned]);
  const ordered = useMemo(() => {
    const positions = new Map(order.map((key, index) => [key, index]));
    return [...managed].sort(
      (a, b) =>
        (positions.get(a.viewKey) ?? Infinity) - (positions.get(b.viewKey) ?? Infinity) ||
        a.projectName.localeCompare(b.projectName),
    );
  }, [managed, order]);
  const reorder = useCallback(
    (next: SidebarProjectEntry[]) => {
      const nextKeys = next.map(projectKey);
      setOrder([...nextKeys, ...order.filter((key) => !nextKeys.includes(key))]);
    },
    [setOrder, order],
  );
  let recentsBody = null;
  if (!recentsCollapsed) {
    recentsBody = loading ? (
      <SidebarAgentListSkeleton />
    ) : (
      <SidebarDesktopChatList workspaces={recents} testID="sidebar-recents-list" />
    );
  }
  return (
    <ScrollView
      style={styles.scroll}
      contentContainerStyle={styles.content}
      testID="sidebar-collections"
    >
      {pinned.length > 0 ? (
        <>
          <SectionHeader
            label={t("sidebar.pinned.title")}
            collapsed={pinnedCollapsed}
            onToggle={togglePinned}
            testID="sidebar-pinned-section"
          />
          {!pinnedCollapsed ? (
            <SidebarDesktopChatList workspaces={pinned} testID="sidebar-pinned-list" />
          ) : null}
        </>
      ) : null}
      <SectionHeader
        label={t("sidebar.panel.projectsSection")}
        collapsed={projectsCollapsed}
        onToggle={toggleProjects}
        onAdd={add}
        testID="sidebar-panel-projects-header"
      >
        <OrganizeSidebar projects={projects} />
        <SidebarDisplayPreferencesMenu filtersOnly />
      </SectionHeader>
      {!projectsCollapsed ? (
        <View testID="sidebar-project-list">
          <DraggableList
            data={ordered}
            keyExtractor={projectKey}
            renderItem={renderProject}
            onDragEnd={reorder}
            scrollEnabled={false}
            useDragHandle
          />
        </View>
      ) : null}
      <SectionHeader
        label={t("sidebar.panel.recentsSection")}
        collapsed={recentsCollapsed}
        onToggle={toggleRecents}
        testID="sidebar-recents-header"
      >
        <OrganizeSidebar projects={projects} />
      </SectionHeader>
      {recentsBody}
      <SidebarCalloutSlot />
    </ScrollView>
  );
}

const styles = StyleSheet.create((theme) => ({
  hidden: { opacity: 0 },
  revealed: { opacity: 1 },
  scroll: { flex: 1, minHeight: 0 },
  content: { paddingHorizontal: theme.spacing[2], paddingBottom: theme.spacing[3] },
  sectionHeader: {
    position: "relative",
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    height: 38,
    marginTop: theme.spacing[2],
  },
  sectionToggle: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: theme.spacing[2],
    height: 28,
  },
  sectionLabel: { color: theme.colors.foregroundMuted, fontSize: theme.fontSize.sm },
  sectionActions: { flexDirection: "row", alignItems: "center" },
  iconButton: {
    width: 26,
    height: 26,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  folderRow: { flexDirection: "row", alignItems: "center", minHeight: 32 },
  folderButton: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    height: 32,
  },
  folderLabel: { flexShrink: 1, color: theme.colors.foreground, fontSize: theme.fontSize.base },
  projectChats: { paddingLeft: theme.spacing[3] },
}));
