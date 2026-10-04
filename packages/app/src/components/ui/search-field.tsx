import { useCallback, useRef, useState, type ReactElement } from "react";
import { Pressable, View, type PressableStateCallbackType } from "react-native";
import { Search, X } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import {
  createControlGeometry,
  resolveControlInteractionStyles,
} from "@/components/ui/control-geometry";
import type { Theme } from "@/styles/theme";
import {
  EditingTextInput as TextInput,
  type EditingTextInputHandle,
} from "@/components/ui/text-input";

const ThemedSearch = withUnistyles(Search);
const ThemedX = withUnistyles(X);
const ThemedTextInput = withUnistyles(TextInput, (theme: Theme) => ({
  // Placeholders sit at foregroundMuted and no dimmer — see docs/design.md §14.
  placeholderTextColor: theme.colors.foregroundMuted,
  selectionColor: theme.colors.foreground,
}));

const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export interface SearchFieldProps {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  /** Falls back to `placeholder`, which already names the field. */
  accessibilityLabel?: string;
  clearAccessibilityLabel: string;
  testID?: string;
  clearTestID?: string;
}

/**
 * The standalone search box that leads a screen's filter rail. It takes the same text-input
 * field chrome as every other field (docs/design.md "Finish") — fill, hairline border, and
 * elevation come from the shared `createControlGeometry`. Hover tracking lives on this outer
 * `View`, not a `Pressable`, because the clear button is a nested `Pressable` (docs/hover.md).
 * It owns its own clear affordance — a caller rendering its own X has been handed the wrong
 * component.
 */
export function SearchField({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  clearAccessibilityLabel,
  testID,
  clearTestID,
}: SearchFieldProps): ReactElement {
  const [isFocused, setIsFocused] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const inputRef = useRef<EditingTextInputHandle>(null);
  const handleFocus = useCallback(() => setIsFocused(true), []);
  const handleBlur = useCallback(() => setIsFocused(false), []);
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const handleClear = useCallback(() => {
    inputRef.current?.replaceText("");
    onChangeText("");
  }, [onChangeText]);
  const clearButtonStyle = useCallback(
    ({ hovered = false }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.clearButton,
      hovered && styles.clearButtonHovered,
    ],
    [],
  );

  const fieldStyle = resolveControlInteractionStyles(
    {
      controlRest: styles.field,
      controlHover: styles.controlHover,
      controlActive: styles.controlActive,
    },
    { hovered: isHovered, focused: isFocused },
  );

  return (
    <View
      style={fieldStyle}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <ThemedSearch size={14} uniProps={mutedColorMapping} />
      <ThemedTextInput
        testID={testID}
        ref={inputRef}
        initialValue={value}
        onChangeText={onChangeText}
        onFocus={handleFocus}
        onBlur={handleBlur}
        placeholder={placeholder}
        accessibilityLabel={accessibilityLabel ?? placeholder}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        style={styles.input}
      />
      {value.length > 0 ? (
        <Pressable
          testID={clearTestID}
          onPress={handleClear}
          accessibilityRole="button"
          accessibilityLabel={clearAccessibilityLabel}
          hitSlop={8}
          style={clearButtonStyle}
        >
          <ThemedX size={14} uniProps={mutedColorMapping} />
        </Pressable>
      ) : null}
    </View>
  );
}

const SEARCH_FIELD_MAX_WIDTH = 420;
const CLEAR_BUTTON_SIZE = 20;

const styles = StyleSheet.create((theme) => {
  const geometry = createControlGeometry(theme);

  return {
    field: {
      flexDirection: "row",
      alignItems: "center",
      gap: theme.spacing[2],
      flex: 1,
      minWidth: 0,
      maxWidth: SEARCH_FIELD_MAX_WIDTH,
      paddingVertical: theme.spacing[1.5],
      paddingHorizontal: theme.spacing[3],
      borderRadius: theme.borderRadius.lg,
      ...geometry.controlRest,
    },
    controlHover: {
      ...geometry.controlHover,
    },
    controlActive: {
      ...geometry.controlActive,
    },
    input: {
      flex: 1,
      minWidth: 0,
      padding: 0,
      height: 20,
      // The browser's focus ring would sit inside the field's own focus border.
      // `outlineWidth` is typed on ViewStyle since RN 0.81 and is a no-op on
      // native, so this needs neither a cast nor a platform branch.
      outlineWidth: 0,
      color: theme.colors.foreground,
      fontSize: theme.fontSize.base,
    },
    clearButton: {
      flexShrink: 0,
      width: CLEAR_BUTTON_SIZE,
      height: CLEAR_BUTTON_SIZE,
      borderRadius: theme.borderRadius.full,
      alignItems: "center",
      justifyContent: "center",
    },
    clearButtonHovered: {
      backgroundColor: theme.colors.interactionHighlight,
    },
  };
});
