import { useCallback, useMemo, type ReactElement } from "react";
import { type StyleProp, type ViewStyle } from "react-native";
import { useTranslation } from "react-i18next";
import { ListChecks } from "lucide-react-native";
import { withUnistyles } from "react-native-unistyles";
import { HeaderToggleButton } from "@/components/headers/header-toggle-button";
import {
  extraMutedIconColorMapping,
  iconButtonChromeGlyphSize,
  mutedIconColorMapping,
} from "@/components/ui/icon-button-chrome";
import { useAppSettings, useSettings } from "@/hooks/use-settings";

const ThemedListChecks = withUnistyles(ListChecks);
const NO_SHORTCUT: never[] = [];

/**
 * Codex's "Toggle summary": shows or hides the floating summary card at the top right of a chat
 * (`subagents/chat-summary-card.tsx`). The choice is a saved setting.
 */
export function WorkspaceSummaryToggle({ style }: { style?: StyleProp<ViewStyle> }): ReactElement {
  const { t } = useTranslation();
  const showChatSummary = useSettings((settings) => settings.showChatSummary);
  const { updateSettings } = useAppSettings();
  const handlePress = useCallback(
    () => void updateSettings({ showChatSummary: !showChatSummary }),
    [showChatSummary, updateSettings],
  );
  const accessibilityState = useMemo(() => ({ expanded: showChatSummary }), [showChatSummary]);
  const label = t("subagents.summary.toggle");
  return (
    <HeaderToggleButton
      testID="workspace-summary-toggle"
      onPress={handlePress}
      tooltipLabel={label}
      tooltipKeys={NO_SHORTCUT}
      tooltipSide="left"
      style={style}
      accessible
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={accessibilityState}
    >
      <ThemedListChecks
        size={iconButtonChromeGlyphSize("large")}
        strokeWidth={1.5}
        uniProps={showChatSummary ? mutedIconColorMapping : extraMutedIconColorMapping}
      />
    </HeaderToggleButton>
  );
}
