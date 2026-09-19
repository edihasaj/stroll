import { useCallback, useMemo } from "react";
import { Pressable, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { LucideIcon } from "lucide-react-native";
import { HEADER_INNER_HEIGHT, HEADER_INNER_HEIGHT_MOBILE } from "@/constants/layout";
import { ICON_SIZE } from "@/styles/theme";
import type { Theme } from "@/styles/theme";
import { Shortcut } from "@/components/ui/shortcut";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import type { ShortcutKey } from "@/utils/format-shortcut";

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

type SidebarHeaderRowVariant = "header" | "compact";

interface SidebarHeaderRowProps {
  icon: LucideIcon;
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
   */
  variant?: SidebarHeaderRowVariant;
  shortcutKeys?: ShortcutKey[][] | null;
  /**
   * SB1's icon-only rail: renders the icon alone, centered in a fixed square, with
   * the label (and shortcut) moved into a tooltip since there is no room to show
   * them inline.
   */
  rail?: boolean;
}

export function SidebarHeaderRow({
  icon: Icon,
  label,
  onPress,
  isActive = false,
  testID,
  nativeID,
  accessibilityLabel,
  variant = "header",
  shortcutKeys = null,
  rail = false,
}: SidebarHeaderRowProps) {
  const ThemedIcon = useMemo(() => withUnistyles(Icon), [Icon]);

  const containerStyle = useMemo(() => {
    if (rail) return styles.containerRail;
    return variant === "compact" ? styles.containerCompact : styles.container;
  }, [rail, variant]);

  const buttonStyle = useCallback(
    ({ hovered }: PressableStateCallbackType & { hovered?: boolean }) => [
      rail ? styles.buttonRail : styles.button,
      !rail && variant === "compact" && styles.buttonCompact,
      Boolean(hovered) && !isActive && styles.buttonHovered,
      isActive && styles.buttonSelected,
    ],
    [isActive, rail, variant],
  );

  const renderChildren = useCallback(
    (state: PressableStateCallbackType & { hovered?: boolean }) => {
      const isHighlighted = Boolean(state.hovered) || isActive;
      const icon = (
        <ThemedIcon
          size={ICON_SIZE.sm}
          uniProps={isHighlighted ? foregroundColorMapping : foregroundMutedColorMapping}
        />
      );
      if (rail) {
        return icon;
      }
      return (
        <>
          {icon}
          <SidebarHeaderRowLabel label={label} isHighlighted={isHighlighted} />
          {shortcutKeys && Boolean(state.hovered) ? (
            <Shortcut chord={shortcutKeys} style={styles.shortcut} />
          ) : null}
        </>
      );
    },
    [ThemedIcon, isActive, label, rail, shortcutKeys],
  );

  const pressable = (
    <Pressable
      onPress={onPress}
      testID={testID}
      nativeID={nativeID}
      accessible
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={buttonStyle}
    >
      {renderChildren}
    </Pressable>
  );

  if (rail) {
    return (
      <View style={containerStyle}>
        <Tooltip delayDuration={300}>
          <TooltipTrigger asChild>{pressable}</TooltipTrigger>
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

  return <View style={containerStyle}>{pressable}</View>;
}

function SidebarHeaderRowLabel({
  label,
  isHighlighted,
}: {
  label: string;
  isHighlighted: boolean;
}) {
  const labelStyle = useMemo(
    () => [styles.label, isHighlighted && styles.labelHighlighted],
    [isHighlighted],
  );
  return <Text style={labelStyle}>{label}</Text>;
}

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
  button: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    // Match the sidebar workspace-row shape (height, padding, radius) so the
    // compact header entries sit tight against the workspace list below.
    minHeight: 36,
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderRadius: theme.borderRadius.lg,
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
  // Matches the footer's icon-only buttons (left-sidebar.tsx `footerIconButton`)
  // so rail icons read as one consistent icon-button size top to bottom.
  buttonRail: {
    width: 28,
    height: 28,
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
  tooltipRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  tooltipText: {
    fontSize: theme.fontSize.base,
    color: theme.colors.popoverForeground,
  },
  label: {
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foregroundMuted,
  },
  labelHighlighted: {
    color: theme.colors.foreground,
  },
  shortcut: {
    marginLeft: "auto",
  },
}));
