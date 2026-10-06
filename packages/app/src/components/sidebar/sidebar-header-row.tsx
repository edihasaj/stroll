import {
  useCallback,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
  type Ref,
} from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { HEADER_INNER_HEIGHT, HEADER_INNER_HEIGHT_MOBILE } from "@/constants/layout";
import { ICON_SIZE } from "@/styles/theme";
import type { Theme } from "@/styles/theme";
import { Shortcut } from "@/components/ui/shortcut";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ShortcutKey } from "@/utils/format-shortcut";

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

type SidebarHeaderRowVariant = "header" | "compact" | "inline";

export type SidebarRowIcon = ComponentType<{ size: number; color: string }>;

interface SidebarHeaderRowProps {
  icon: SidebarRowIcon | null;
  label: string;
  onPress: () => void;
  isActive?: boolean;
  testID?: string;
  nativeID?: string;
  accessibilityLabel?: string;
  /**
   * "header" (default): a sidebar-height row with its own bottom separator —
   * the lone header at the top of a sidebar (settings "Back to workspace").
   * "compact": a workspace-row-height row with no separator, for entries that
   * sit in a header group whose wrapper owns the single divider.
   * "inline": a full-width row with no inset, for a row inside a padded container such as the
   * sidebar footer.
   */
  variant?: SidebarHeaderRowVariant;
  /** Shown in the right slot while the row is hovered, when `trailing` is not set. */
  shortcutKeys?: ShortcutKey[][] | null;
  /**
   * SB1's icon-only rail: renders the icon alone, centered in a fixed square, with
   * the label (and shortcut) moved into a tooltip since there is no room to show
   * them inline.
   */
  rail?: boolean;
  /**
   * The right slot. A sibling of the row's button, never inside it (web cannot nest buttons). A
   * press on the slot presses the row; a button inside it presses on its own.
   */
  trailing?: ReactNode;
  rowRef?: Ref<View>;
}

export function SidebarHeaderRow(props: SidebarHeaderRowProps) {
  return props.rail ? <SidebarHeaderRowRail {...props} /> : <SidebarHeaderRowInline {...props} />;
}

/** The icon-only rail cell: icon alone, centered in a fixed square, label (and shortcut)
 * moved into a tooltip since there is no room to show them inline. */
function SidebarHeaderRowRail({
  icon: Icon,
  label,
  onPress,
  isActive = false,
  testID,
  nativeID,
  accessibilityLabel,
  shortcutKeys = null,
}: SidebarHeaderRowProps) {
  const ThemedIcon = useMemo(() => (Icon ? withUnistyles(Icon) : null), [Icon]);
  const buttonStyle = useCallback(
    ({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.buttonRail,
      Boolean(hovered) && !isActive && styles.buttonHovered,
      isActive && styles.buttonRailSelected,
    ],
    [isActive],
  );
  const renderIcon = useCallback(
    (state: PressableStateCallbackType & { hovered?: boolean }) => {
      const highlighted = Boolean(state.hovered) || isActive;
      return ThemedIcon ? (
        <ThemedIcon
          size={ICON_SIZE.sm}
          uniProps={highlighted ? foregroundColorMapping : foregroundMutedColorMapping}
        />
      ) : null;
    },
    [ThemedIcon, isActive],
  );

  return (
    <View style={styles.containerRail}>
      <Tooltip delayDuration={300}>
        <TooltipTrigger asChild>
          <Pressable
            onPress={onPress}
            testID={testID}
            nativeID={nativeID}
            accessible
            accessibilityRole="button"
            accessibilityLabel={accessibilityLabel ?? label}
            style={buttonStyle}
          >
            {renderIcon}
          </Pressable>
        </TooltipTrigger>
        <TooltipContent side="right" align="center" offset={8}>
          <View style={styles.tooltipRow}>
            <Text style={styles.tooltipText}>{label}</Text>
            {shortcutKeys ? <Shortcut chord={shortcutKeys} /> : null}
          </View>
        </TooltipContent>
      </Tooltip>
    </View>
  );
}

/** The header/compact/inline cell: icon + label inline, with an optional trailing slot
 * (sibling of the row's own button — never nested, web cannot nest buttons). */
function SidebarHeaderRowInline({
  icon: Icon,
  label,
  onPress,
  isActive = false,
  testID,
  nativeID,
  accessibilityLabel,
  variant = "header",
  shortcutKeys = null,
  trailing,
  rowRef,
}: SidebarHeaderRowProps) {
  const [isHovered, setIsHovered] = useState(false);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const ThemedIcon = useMemo(() => (Icon ? withUnistyles(Icon) : null), [Icon]);
  const isHighlighted = isHovered || isActive;
  const iconSize = variant === "header" ? ICON_SIZE.md : ICON_SIZE.sm;
  const containerStyle = getContainerStyle(variant);

  let right = trailing ?? null;
  if (right === null && shortcutKeys && isHovered) {
    right = <Shortcut chord={shortcutKeys} />;
  }

  const buttonStyle = useMemo(
    () => [
      styles.button,
      variant === "compact" && styles.buttonCompact,
      variant === "inline" && styles.buttonInline,
      isHighlighted && !isActive && styles.buttonHovered,
      isActive && styles.buttonSelected,
    ],
    [isActive, isHighlighted, variant],
  );

  return (
    <View ref={rowRef} collapsable={false} style={containerStyle}>
      <View
        style={[styles.row, isHighlighted && styles.rowHighlighted]}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        <Pressable
          onPress={onPress}
          testID={testID}
          nativeID={nativeID}
          accessible
          accessibilityRole="button"
          accessibilityLabel={accessibilityLabel ?? label}
          accessibilityState={isActive ? SELECTED_STATE : undefined}
          aria-selected={isActive}
          style={buttonStyle}
        >
          {ThemedIcon ? (
            <ThemedIcon
              size={iconSize}
              uniProps={isHighlighted ? foregroundColorMapping : foregroundMutedColorMapping}
            />
          ) : (
            <View style={variant === "header" ? styles.iconSpacer : styles.iconSpacerCompact} />
          )}
          <Text style={[styles.label, isHighlighted && styles.labelHighlighted]}>{label}</Text>
        </Pressable>
        {right === null ? null : (
          <Pressable onPress={onPress} accessible={false} focusable={false} style={styles.trailing}>
            {right}
          </Pressable>
        )}
      </View>
    </View>
  );
}

const SELECTED_STATE = { selected: true } as const;

const styles = StyleSheet.create((theme) => ({
  container: {
    height: {
      xs: HEADER_INNER_HEIGHT_MOBILE,
      md: HEADER_INNER_HEIGHT,
    },
    paddingHorizontal: theme.spacing[2],
    justifyContent: "center",
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    userSelect: "none",
  },
  containerCompact: {
    paddingHorizontal: theme.spacing[2],
    justifyContent: "center",
    userSelect: "none",
  },
  containerRail: {
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: theme.spacing[0.5],
    userSelect: "none",
  },
  containerInline: {
    width: "100%",
    justifyContent: "center",
    userSelect: "none",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    // Same row geometry as the settings sidebar items. Shorter than the header
    // strip so the hover highlight clears the strip's bottom separator.
    minHeight: 28,
    borderRadius: theme.borderRadius.lg,
  },
  rowHighlighted: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  button: {
    flex: 1,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    // Match the sidebar workspace-row shape (height, padding, radius) so the
    // compact header entries sit tight against the workspace list below.
    minHeight: 36,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.md,
  },
  // Compact header entries (New workspace / History) sit tighter than the
  // workspace-row shape the base button mirrors.
  buttonCompact: {
    minHeight: 32,
    paddingVertical: theme.spacing[1.5],
    // Match the project rows' inner padding so the icons align on one vertical
    // edge with the workspace list below (base button uses a wider spacing[3]).
    paddingHorizontal: theme.spacing[2],
  },
  // Footer/inline plugin rows (Usage, Hosts) sit tighter still, matching the
  // settings sidebar items' row geometry — see docs/design.md "Finish".
  buttonInline: {
    minHeight: 28,
    paddingVertical: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius.lg,
  },
  // SB2 (Codex-style rail): 34px square, one radius step under `lg` — the design spec calls
  // for a 9px radius; `borderRadius.md` (8) is the nearest token on the scale and reads the
  // same at this size, so it stays on-scale rather than introducing a one-off literal.
  buttonRail: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  buttonHovered: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  buttonSelected: {
    backgroundColor: theme.colors.surface2,
  },
  // SB2 rail: `interactionSelected` per the Codex-parity spec, distinct from the
  // non-rail compact/header/inline rows above which keep `surface2`.
  buttonRailSelected: {
    backgroundColor: theme.colors.interactionSelected,
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
  iconSpacer: { width: ICON_SIZE.md, height: ICON_SIZE.md },
  iconSpacerCompact: { width: ICON_SIZE.sm, height: ICON_SIZE.sm },
  label: {
    flexShrink: 1,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foregroundMuted,
  },
  labelHighlighted: {
    color: theme.colors.foreground,
  },
  trailing: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingRight: theme.spacing[2],
  },
}));

function getContainerStyle(variant: SidebarHeaderRowVariant) {
  switch (variant) {
    case "header":
      return styles.container;
    case "compact":
      return styles.containerCompact;
    case "inline":
      return styles.containerInline;
  }
}
