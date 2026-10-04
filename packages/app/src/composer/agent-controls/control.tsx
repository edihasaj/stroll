import { forwardRef, useCallback, type ComponentProps, type ReactNode } from "react";
import { Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ChevronDown } from "lucide-react-native";
import { ComboboxTrigger } from "@/components/ui/combobox-trigger";
import { useComposerControlLayout } from "@/composer/agent-controls/layout-context";
import { COMPOSER_TOOLBAR_GEOMETRY } from "@/composer/agent-controls/layout";
import { ComposerToolbarGlyph } from "@/composer/agent-controls/glyph";
import type { AgentControlIcon } from "@/agent-controls/icons";
import { tabularNums, type Theme } from "@/styles/theme";

// Quieter than the combobox's own default 14px chevron (docs/design.md §16's
// 28px ghost pill geometry). components/ui/combobox-trigger.tsx is out of scope
// for this pass, so the toolbar pill overrides its chevron slot directly.
const chevronColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const ThemedChevronDown = withUnistyles(ChevronDown);

type AgentControlTriggerProps = Omit<
  ComponentProps<typeof ComboboxTrigger>,
  "accessibilityLabel" | "block" | "children" | "chevron" | "onPress" | "style"
> & {
  icon: AgentControlIcon;
  iconColor?: string;
  surface: "toolbar" | "sheet";
  label: string;
  value?: string;
  /** Overrides the value/label text colour — the mode pill's unattended-mode warning. */
  valueColor?: string;
  showToolbarLabel?: boolean;
  showCaret?: boolean;
  open?: boolean;
  onPress: () => void;
  accessibilityLabel: string;
};

export const AgentControlTrigger = forwardRef<View, AgentControlTriggerProps>(
  function AgentControlTrigger(
    {
      icon: Icon,
      iconColor,
      surface,
      label,
      value,
      valueColor,
      showToolbarLabel = true,
      showCaret = false,
      open = false,
      disabled = false,
      onPress,
      accessibilityLabel,
      testID,
      ...triggerProps
    },
    ref,
  ) {
    const { glyphSize } = useComposerControlLayout();
    const isSheet = surface === "sheet";
    const resolvedGlyphSize = isSheet ? 16 : glyphSize;
    const resolvedIconColor = iconColor ?? styles.iconColor.color;
    const showValue = isSheet || showToolbarLabel;
    const triggerStyle = useCallback(
      ({
        pressed,
        hovered,
        focused,
      }: PressableStateCallbackType & { hovered?: boolean; focused?: boolean }) => [
        isSheet ? styles.sheetRow : styles.toolbarControl,
        !isSheet && !showToolbarLabel && styles.toolbarIconOnly,
        hovered && (isSheet ? styles.sheetRowInteractive : styles.hovered),
        (pressed || open) && (isSheet ? styles.sheetRowInteractive : styles.open),
        focused && styles.focused,
        disabled && styles.disabled,
      ],
      [disabled, isSheet, open, showToolbarLabel],
    );
    let chevron: ReactNode;
    if (isSheet) {
      chevron = showCaret ? undefined : null;
    } else if (showCaret) {
      chevron = (
        <ThemedChevronDown
          size={COMPOSER_TOOLBAR_GEOMETRY.caretSize}
          uniProps={chevronColorMapping}
        />
      );
    } else {
      chevron = null;
    }

    return (
      <ComboboxTrigger
        {...triggerProps}
        ref={ref}
        collapsable={false}
        disabled={disabled}
        onPress={onPress}
        style={triggerStyle}
        accessibilityRole="button"
        accessibilityLabel={accessibilityLabel}
        testID={testID}
        chevron={chevron}
      >
        {isSheet ? (
          <View style={styles.sheetGlyph}>
            <Icon size={resolvedGlyphSize} color={resolvedIconColor} />
          </View>
        ) : (
          <ComposerToolbarGlyph size={resolvedGlyphSize}>
            <Icon size={resolvedGlyphSize} color={resolvedIconColor} />
          </ComposerToolbarGlyph>
        )}
        {isSheet ? (
          <Text style={styles.sheetLabel} numberOfLines={1}>
            {label}
          </Text>
        ) : null}
        {showValue ? (
          <Text
            style={[
              isSheet ? styles.sheetValue : styles.toolbarValue,
              valueColor ? { color: valueColor } : null,
            ]}
            numberOfLines={1}
          >
            {value ?? label}
          </Text>
        ) : null}
      </ComboboxTrigger>
    );
  },
);

const styles = StyleSheet.create((theme) => ({
  toolbarControl: {
    height: 28,
    minWidth: 0,
    flexShrink: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[1],
    paddingHorizontal: theme.spacing[2],
    borderRadius: theme.borderRadius["2xl"],
    backgroundColor: "transparent",
  },
  toolbarIconOnly: {
    width: 28,
    flexShrink: 0,
    paddingHorizontal: 0,
    justifyContent: "center",
  },
  toolbarValue: {
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
    // Harmless on label text, keeps digits from shifting width the moment a trigger's value
    // carries a count (docs/design.md "Finish").
    ...tabularNums,
  },
  sheetRow: {
    minHeight: 44,
    minWidth: 0,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    marginHorizontal: -theme.spacing[1],
    paddingHorizontal: theme.spacing[4],
    borderRadius: theme.borderRadius["2xl"],
    backgroundColor: theme.colors.surface1,
  },
  sheetRowInteractive: {
    backgroundColor: theme.colors.surface2,
  },
  sheetGlyph: {
    width: 20,
    height: 20,
    flexShrink: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  sheetLabel: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
  },
  sheetValue: {
    maxWidth: "45%",
    minWidth: 0,
    flexShrink: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
    ...tabularNums,
  },
  hovered: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  open: {
    backgroundColor: theme.colors.surface2,
  },
  // `boxShadow` only, never `borderWidth` — these pills have no resting border, and a
  // focus-only border would nudge their fixed-height content by a pixel on tab (docs/hover.md's
  // "don't change the trigger's outer geometry" rule, which applies just as well to focus).
  focused: {
    boxShadow: theme.shadow.focusRing,
  },
  disabled: {
    opacity: 0.5,
  },
  iconColor: {
    color: theme.colors.foregroundMuted,
  },
}));
