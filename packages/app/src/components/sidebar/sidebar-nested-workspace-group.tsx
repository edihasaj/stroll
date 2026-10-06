import { Fragment, useCallback, useMemo, type ReactElement } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { isWeb } from "@/constants/platform";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";
import {
  useSidebarProjectStatusBucket,
  type SidebarWorkspacePlacement,
} from "@/hooks/use-sidebar-workspaces-list";
import { collectDescendantWorkspaces } from "@/components/sidebar/workspace-nesting";
import { sidebarWorkspaceRowStyles } from "@/components/sidebar/sidebar-workspace-row-content";
import { getStatusDotColor } from "@/utils/status-dot-color";
import { STATUS_INDICATOR_FILLED_DOT_SIZE } from "@/utils/status-indicator-geometry";
import type { Theme } from "@/styles/theme";
import type { SidebarStateBucket } from "@/utils/sidebar-agent-state";

const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);

const EMPTY_PLACEMENTS: SidebarWorkspacePlacement[] = [];

export type RenderNestedWorkspaceRow = (
  workspace: SidebarWorkspacePlacement,
  depth: number,
) => ReactElement;

/**
 * Wraps a row `depth` indent levels deep, stacking the workspace row's own single-level indent
 * unit (`rowIndented`) rather than deriving a new per-depth amount — a grandchild is two of the
 * same step, not a bespoke wider one.
 */
export function IndentedWorkspaceRow({
  depth,
  children,
}: {
  depth: number;
  children: ReactElement;
}): ReactElement {
  let node = children;
  for (let level = 0; level < depth; level += 1) {
    node = <View style={sidebarWorkspaceRowStyles.rowIndented}>{node}</View>;
  }
  return node;
}

function statusDotStyle(bucket: SidebarStateBucket) {
  switch (bucket) {
    case "needs_input":
      return styles.dotNeedsInput;
    case "failed":
      return styles.dotFailed;
    case "running":
      return styles.dotRunning;
    case "attention":
      return styles.dotAttention;
    case "done":
      return null;
  }
}

function NestedStatusDot({ bucket }: { bucket: SidebarStateBucket }): ReactElement | null {
  const dotStyle = statusDotStyle(bucket);
  if (!dotStyle) {
    return null;
  }
  return <View testID="sidebar-nested-workspace-status-dot" style={dotStyle} />;
}

/**
 * The disclosure for a collapsed-by-default group of nested child workspaces: a chevron, the
 * direct child count, and — only while collapsed — a status dot so a running or needs-input
 * descendant several levels down still surfaces instead of hiding behind the collapse.
 */
function SidebarNestedWorkspaceToggle({
  childCount,
  expanded,
  onToggle,
  statusBucket,
  depth,
  testID,
}: {
  childCount: number;
  expanded: boolean;
  onToggle: () => void;
  statusBucket: SidebarStateBucket | null;
  depth: number;
  testID: string;
}): ReactElement {
  const { t } = useTranslation();
  const label = t("sidebar.workspace.nested.count", { count: childCount });
  const showStatusDot = !expanded && statusBucket !== null && statusBucket !== "done";
  const accessibilityState = useMemo(() => ({ expanded }), [expanded]);

  const rowStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.row,
      hovered && !pressed && styles.rowHovered,
      pressed && styles.rowPressed,
    ],
    [],
  );

  return (
    <IndentedWorkspaceRow depth={depth}>
      <Pressable
        accessibilityRole={isWeb ? undefined : "button"}
        accessibilityLabel={label}
        accessibilityState={accessibilityState}
        onPress={onToggle}
        style={rowStyle}
        testID={testID}
      >
        {({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => (
          <>
            <View style={styles.iconSlot}>
              {expanded ? (
                <ThemedChevronDown
                  size={14}
                  uniProps={
                    hovered || pressed ? foregroundColorMapping : foregroundMutedColorMapping
                  }
                />
              ) : (
                <ThemedChevronRight
                  size={14}
                  uniProps={
                    hovered || pressed ? foregroundColorMapping : foregroundMutedColorMapping
                  }
                />
              )}
            </View>
            <Text style={hovered || pressed ? styles.textHovered : styles.text} numberOfLines={1}>
              {label}
            </Text>
            {showStatusDot ? <NestedStatusDot bucket={statusBucket} /> : null}
          </>
        )}
      </Pressable>
    </IndentedWorkspaceRow>
  );
}

/**
 * Recursively renders one parent's group of nested child workspaces: the disclosure row, then —
 * while expanded — each child's own row (via `renderWorkspaceRow`, the same renderer the
 * top-level list uses) followed by that child's own nested group one level deeper. Returns
 * nothing for a workspace with no children, so a plain workspace never grows a disclosure it
 * doesn't need.
 */
export function SidebarNestedWorkspaceGroup({
  parentKey,
  depth,
  childrenByParentKey,
  renderWorkspaceRow,
}: {
  parentKey: string;
  depth: number;
  childrenByParentKey: ReadonlyMap<string, readonly SidebarWorkspacePlacement[]>;
  renderWorkspaceRow: RenderNestedWorkspaceRow;
}): ReactElement | null {
  const children = childrenByParentKey.get(parentKey);
  const expandedKeys = useSidebarCollapsedSectionsStore(
    (state) => state.expandedNestedWorkspaceKeys,
  );
  const toggleExpanded = useSidebarCollapsedSectionsStore(
    (state) => state.toggleNestedWorkspaceExpanded,
  );
  const expanded = expandedKeys.has(parentKey);
  const hasChildren = Boolean(children && children.length > 0);

  // Collected only while collapsed — the aggregate stands in for descendant rows that aren't on
  // screen; once they render directly, their own dots carry the signal.
  const descendantsForStatus = useMemo(
    () =>
      !expanded && hasChildren
        ? collectDescendantWorkspaces({ rootKey: parentKey, childrenByParentKey })
        : EMPTY_PLACEMENTS,
    [expanded, hasChildren, parentKey, childrenByParentKey],
  );
  const aggregateStatusBucket = useSidebarProjectStatusBucket({
    workspaces: descendantsForStatus,
    enabled: descendantsForStatus.length > 0,
  });

  const handleToggle = useCallback(() => toggleExpanded(parentKey), [toggleExpanded, parentKey]);

  if (!children || children.length === 0) {
    return null;
  }

  return (
    <>
      <SidebarNestedWorkspaceToggle
        childCount={children.length}
        expanded={expanded}
        onToggle={handleToggle}
        statusBucket={aggregateStatusBucket}
        depth={depth}
        testID={`sidebar-nested-workspace-toggle-${parentKey}`}
      />
      {expanded
        ? children.map((child) => (
            <Fragment key={child.workspaceKey}>
              {renderWorkspaceRow(child, depth)}
              <SidebarNestedWorkspaceGroup
                parentKey={child.workspaceKey}
                depth={depth + 1}
                childrenByParentKey={childrenByParentKey}
                renderWorkspaceRow={renderWorkspaceRow}
              />
            </Fragment>
          ))
        : null}
    </>
  );
}

const styles = StyleSheet.create((theme) => ({
  // Kept in step with `SidebarGroupToggleRow` — this is the same "ends a group of rows" shape,
  // just disclosing nested children instead of a truncated list.
  row: {
    minHeight: 36,
    marginBottom: theme.spacing[0.5],
    paddingVertical: theme.spacing[2],
    paddingLeft: theme.spacing[2],
    paddingRight: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    userSelect: "none",
  },
  rowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  rowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  iconSlot: {
    width: theme.iconSize.md,
    height: theme.iconSize.md,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  text: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    minWidth: 0,
    flexShrink: 1,
  },
  textHovered: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    minWidth: 0,
    flexShrink: 1,
  },
  dotNeedsInput: {
    width: STATUS_INDICATOR_FILLED_DOT_SIZE,
    height: STATUS_INDICATOR_FILLED_DOT_SIZE,
    borderRadius: theme.borderRadius.full,
    backgroundColor: getStatusDotColor({ theme, bucket: "needs_input" }) ?? undefined,
  },
  dotFailed: {
    width: STATUS_INDICATOR_FILLED_DOT_SIZE,
    height: STATUS_INDICATOR_FILLED_DOT_SIZE,
    borderRadius: theme.borderRadius.full,
    backgroundColor: getStatusDotColor({ theme, bucket: "failed" }) ?? undefined,
  },
  dotRunning: {
    width: STATUS_INDICATOR_FILLED_DOT_SIZE,
    height: STATUS_INDICATOR_FILLED_DOT_SIZE,
    borderRadius: theme.borderRadius.full,
    backgroundColor: getStatusDotColor({ theme, bucket: "running" }) ?? undefined,
  },
  dotAttention: {
    width: STATUS_INDICATOR_FILLED_DOT_SIZE,
    height: STATUS_INDICATOR_FILLED_DOT_SIZE,
    borderRadius: theme.borderRadius.full,
    backgroundColor: getStatusDotColor({ theme, bucket: "attention" }) ?? undefined,
  },
}));
