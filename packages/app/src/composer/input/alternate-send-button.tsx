import { useCallback } from "react";
import { Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { CornerDownRight, ListEnd } from "lucide-react-native";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Shortcut } from "@/components/ui/shortcut";
import type { ShortcutKey } from "@/utils/format-shortcut";
import type { Theme } from "@/styles/theme";
import type { AlternateSendAction } from "./state";

const ALTERNATE_SEND_KEYS: ShortcutKey[][] = [["Tab"]];

interface AlternateSendButtonProps {
  visible: boolean;
  action: AlternateSendAction;
  label: string;
  disabled: boolean;
  buttonIconSize: number;
  onPress: () => void;
}

/**
 * The touch path to Tab: queues while Enter steers, or steers while Enter queues. Same 28px ghost
 * geometry as the mic button, shown only while a turn runs and there is something to send.
 */
export function AlternateSendButton({
  visible,
  action,
  label,
  disabled,
  buttonIconSize,
  onPress,
}: AlternateSendButtonProps) {
  const buttonStyle = useCallback(
    ({ hovered }: { hovered?: boolean }) => [
      styles.button,
      Boolean(hovered) && styles.buttonHovered,
      disabled && styles.buttonDisabled,
    ],
    [disabled],
  );
  const renderIcon = useCallback(
    ({ hovered }: { hovered?: boolean }) => {
      const colorMapping = hovered ? iconForegroundMapping : iconForegroundMutedMapping;
      if (action === "steer") {
        return <ThemedCornerDownRight size={buttonIconSize} uniProps={colorMapping} />;
      }
      return <ThemedListEnd size={buttonIconSize} uniProps={colorMapping} />;
    },
    [action, buttonIconSize],
  );
  if (!visible) return null;
  return (
    <Tooltip delayDuration={0} enabledOnDesktop enabledOnMobile={false}>
      <TooltipTrigger
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        testID="message-input-alternate-send-button"
        style={buttonStyle}
      >
        {renderIcon}
      </TooltipTrigger>
      <TooltipContent side="top" align="center" offset={8}>
        <View style={styles.tooltipRow}>
          <Text style={styles.tooltipText}>{label}</Text>
          <Shortcut chord={ALTERNATE_SEND_KEYS} />
        </View>
      </TooltipContent>
    </Tooltip>
  );
}

const styles = StyleSheet.create((theme: Theme) => ({
  button: {
    width: 28,
    height: 28,
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  buttonHovered: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  buttonDisabled: {
    opacity: 0.5,
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

const ThemedListEnd = withUnistyles(ListEnd);
const ThemedCornerDownRight = withUnistyles(CornerDownRight);
const iconForegroundMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const iconForegroundMutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
