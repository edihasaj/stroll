import { memo, useCallback, useMemo, type ReactElement } from "react";
import { Pressable, Text, View } from "react-native";
import { useTranslation } from "react-i18next";
import { ChevronDown, ChevronRight } from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import type { Theme } from "@/styles/theme";
import type { TurnFoldItem } from "@/types/stream";
import { formatDuration } from "@/utils/time";

const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const CHEVRON_SIZE = 14;
const mutedColorMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

/**
 * The divider between a finished turn's work and its final answer: "Worked for 1m 50s ›".
 * Pressing it shows or hides the tool calls, thoughts, and in-between messages it stands for
 * (see `turn-fold.ts`).
 */
export const TurnFoldRow = memo(function TurnFoldRow({
  item,
  onExpandedChange,
}: {
  item: TurnFoldItem;
  onExpandedChange: (foldId: string, expanded: boolean) => void;
}): ReactElement {
  const { t } = useTranslation();
  const label =
    item.durationMs !== null
      ? t("agentStream.turnFold.workedFor", { duration: formatDuration(item.durationMs) })
      : t("agentStream.turnFold.steps", { count: item.foldedCount });
  const accessibilityState = useMemo(() => ({ expanded: item.expanded }), [item.expanded]);
  const handlePress = useCallback(
    () => onExpandedChange(item.id, !item.expanded),
    [item.expanded, item.id, onExpandedChange],
  );
  return (
    <View style={styles.container} testID="turn-fold-row">
      <Pressable
        accessibilityRole="button"
        accessibilityState={accessibilityState}
        accessibilityLabel={`${label}, ${t(
          item.expanded ? "agentStream.turnFold.hide" : "agentStream.turnFold.show",
        )}`}
        onPress={handlePress}
        style={styles.row}
      >
        {({ hovered }) => (
          <>
            <Text style={[styles.label, hovered && styles.labelHovered]}>{label}</Text>
            {item.expanded ? (
              <ThemedChevronDown size={CHEVRON_SIZE} uniProps={mutedColorMapping} />
            ) : (
              <ThemedChevronRight size={CHEVRON_SIZE} uniProps={mutedColorMapping} />
            )}
          </>
        )}
      </Pressable>
      <View style={styles.divider} />
    </View>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    gap: theme.spacing[2],
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: theme.spacing[1],
    paddingVertical: theme.spacing[1],
  },
  label: {
    fontSize: theme.fontSize.sm,
    color: theme.colors.foregroundMuted,
  },
  labelHovered: {
    color: theme.colors.foreground,
  },
  divider: {
    height: theme.borderWidth[1],
    backgroundColor: theme.colors.border,
  },
}));
