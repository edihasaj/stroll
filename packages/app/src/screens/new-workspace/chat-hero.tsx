import { useCallback, useMemo, type ReactElement, type RefObject } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { HostPicker } from "@/components/hosts/host-picker";
import { StrollLogo } from "@/components/icons/stroll-logo";
import { Button } from "@/components/ui/button";
import { isWeb } from "@/constants/platform";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useAppReducedMotion, withMotion } from "@/hooks/use-app-reduced-motion";
import { appearEntering, appearExiting, webAppearStyle } from "@/styles/motion";
import type { Theme } from "@/styles/theme";
import {
  CHAT_SUGGESTIONS,
  resolveSuggestionComposerText,
  type ChatSuggestion,
} from "./chat-hero-suggestions";

// A unique split token for pulling the host name out of the translated greeting
// string regardless of word order per-language — every locale keeps `{{host}}`
// in place (enforced by i18n/resources.test.ts's interpolation check), so
// splitting the interpolated result on this token yields the correct
// before/after text in every language without per-locale sentence parsing.
const HOST_SPLIT_TOKEN = "@@HOST@@";

const styles = StyleSheet.create((theme) => ({
  greetingContainer: {
    marginBottom: theme.spacing[8],
    paddingHorizontal: theme.spacing[4],
    alignItems: "center",
    gap: theme.spacing[6],
  },
  greetingRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    alignItems: "baseline",
  },
  // 28px / -0.015em is a pinned literal, not a ramp step — it matches the Codex
  // reference hero exactly and sits between fontSize.2xl (20) and the next step
  // up; see docs/design.md §16 "Finish" for the pinned-literal convention.
  greetingText: {
    fontSize: 28,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foreground,
    textAlign: "center",
    letterSpacing: -0.42,
  },
  // Compact/mobile: same hero, smaller title (item 6 of the Codex parity brief).
  greetingTextCompact: {
    fontSize: 22,
    letterSpacing: -0.33,
  },
  // Single host: plain text, no picker affordance (docs/design.md §16).
  greetingHostStatic: {},
  greetingHostTrigger: {
    textDecorationLine: "underline",
    textDecorationStyle: "dotted",
    textDecorationColor: theme.colors.foregroundExtraMuted,
  },
  chipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: theme.spacing[1.5],
    marginTop: theme.spacing[6],
    paddingHorizontal: theme.spacing[4],
  },
}));

const ThemedStrollMark = withUnistyles(StrollLogo, (theme: Theme) => ({
  color: theme.colors.foregroundExtraMuted,
}));

export interface ChatHeroHostPickerConfig {
  allHosts: { serverId: string; label: string }[];
  selectedServerId: string;
  onSelect: (id: string) => void;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPressTrigger: () => void;
  anchorRef: RefObject<View | null>;
}

interface ChatHeroGreetingProps {
  testID?: string;
  hostLabel: string;
  /** Omitted when only one host is configured — the host name then renders plain,
   * with no picker affordance (see docs/design.md §16 and the Codex parity brief). */
  hostPicker?: ChatHeroHostPickerConfig;
}

/** The centred greeting above the composer on a blank chat: the Stroll mark, then
 * "What should we work on in <host>?" with the host name as a real picker when more
 * than one host is configured. Fades out on first send. */
export function ChatHeroGreeting({
  testID,
  hostLabel,
  hostPicker,
}: ChatHeroGreetingProps): ReactElement {
  const { t } = useTranslation();
  const reducedMotion = useAppReducedMotion();
  const isCompact = useIsCompactFormFactor();
  const greetingTextStyle = [styles.greetingText, isCompact && styles.greetingTextCompact];
  const [prefix, suffix] = useMemo(() => {
    const full = t("newWorkspace.chat.greeting", { host: HOST_SPLIT_TOKEN });
    const [before, after = ""] = full.split(HOST_SPLIT_TOKEN);
    return [before, after];
  }, [t]);

  return (
    <Animated.View
      // This sits above the composer in a content-sized (not flex:1) scroll area — the same
      // in-flow shape that made the M1 message entrance collapse on web. Entering is CSS on
      // web (`webAppearStyle`, `@/styles/motion`) instead of a Reanimated Keyframe.
      entering={isWeb ? undefined : withMotion(reducedMotion, appearEntering)}
      exiting={withMotion(reducedMotion, appearExiting)}
      style={[styles.greetingContainer, webAppearStyle(reducedMotion)]}
      testID={testID}
    >
      <ThemedStrollMark size={isCompact ? 36 : 46} />
      <View style={styles.greetingRow}>
        <Text style={greetingTextStyle}>{prefix}</Text>
        {hostPicker ? (
          <HostPicker
            hosts={hostPicker.allHosts}
            value={hostPicker.selectedServerId}
            onSelect={hostPicker.onSelect}
            open={hostPicker.open}
            onOpenChange={hostPicker.onOpenChange}
            anchorRef={hostPicker.anchorRef}
            searchable={false}
            title="Host"
            desktopPlacement="bottom-start"
            desktopMinWidth={200}
          >
            <Pressable
              ref={hostPicker.anchorRef}
              onPress={hostPicker.onPressTrigger}
              accessibilityRole="button"
              accessibilityLabel={`New chat host: ${hostLabel}`}
              testID="new-chat-hero-host-trigger"
            >
              <Text style={[...greetingTextStyle, styles.greetingHostTrigger]}>{hostLabel}</Text>
            </Pressable>
          </HostPicker>
        ) : (
          <Text style={[...greetingTextStyle, styles.greetingHostStatic]}>{hostLabel}</Text>
        )}
        <Text style={greetingTextStyle}>{suffix}</Text>
      </View>
    </Animated.View>
  );
}

interface ChatHeroSuggestionsProps {
  disabled?: boolean;
  onSelect: (promptText: string) => void;
  testID?: string;
}

/** The suggestion chip row below the composer on a blank chat. Fades out on first send. */
export function ChatHeroSuggestions({ disabled, onSelect, testID }: ChatHeroSuggestionsProps) {
  const reducedMotion = useAppReducedMotion();
  return (
    <Animated.View
      entering={isWeb ? undefined : withMotion(reducedMotion, appearEntering)}
      exiting={withMotion(reducedMotion, appearExiting)}
      style={[styles.chipsContainer, webAppearStyle(reducedMotion)]}
      testID={testID}
    >
      {CHAT_SUGGESTIONS.map((suggestion) => (
        <ChatHeroSuggestionChip
          key={suggestion.key}
          suggestion={suggestion}
          disabled={disabled}
          onSelect={onSelect}
        />
      ))}
    </Animated.View>
  );
}

function ChatHeroSuggestionChip({
  suggestion,
  disabled,
  onSelect,
}: {
  suggestion: ChatSuggestion;
  disabled?: boolean;
  onSelect: (promptText: string) => void;
}) {
  const { t } = useTranslation();
  const label = t(suggestion.labelKey);
  const prompt = suggestion.promptKey ? t(suggestion.promptKey) : undefined;
  const handlePress = useCallback(() => {
    onSelect(resolveSuggestionComposerText({ label, prompt }));
  }, [label, onSelect, prompt]);
  return (
    <Button
      variant="ghost"
      size="sm"
      leftIcon={suggestion.icon}
      onPress={handlePress}
      disabled={disabled}
      testID={`new-chat-suggestion-${suggestion.key}`}
    >
      {label}
    </Button>
  );
}
