import { useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text } from "react-native";
import Animated from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { Button } from "@/components/ui/button";
import { isWeb } from "@/constants/platform";
import { useAppReducedMotion, withMotion } from "@/hooks/use-app-reduced-motion";
import { appearEntering, appearExiting, webAppearStyle } from "@/styles/motion";
import { resolveChatGreetingPeriod } from "./chat-hero-greeting";
import {
  CHAT_SUGGESTIONS,
  resolveSuggestionComposerText,
  type ChatSuggestion,
} from "./chat-hero-suggestions";

const styles = StyleSheet.create((theme) => ({
  greetingContainer: {
    marginBottom: theme.spacing[8],
    paddingHorizontal: theme.spacing[4],
  },
  greetingText: {
    fontSize: theme.fontSize["2xl"],
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foreground,
    textAlign: "center",
  },
  chipsContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "center",
    gap: theme.spacing[2],
    marginTop: theme.spacing[6],
    paddingHorizontal: theme.spacing[4],
  },
}));

/** Resolves the greeting shown above the composer, keyed off the current local hour. */
function useChatGreeting(): string {
  const { t } = useTranslation();
  return useMemo(() => {
    const period = resolveChatGreetingPeriod(new Date().getHours());
    return t(`newWorkspace.chat.greeting.${period}`);
  }, [t]);
}

interface ChatHeroGreetingProps {
  testID?: string;
}

/** The centred greeting above the composer on a blank chat. Fades out on first send. */
export function ChatHeroGreeting({ testID }: ChatHeroGreetingProps) {
  const greeting = useChatGreeting();
  const reducedMotion = useAppReducedMotion();
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
      <Text style={styles.greetingText}>{greeting}</Text>
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
      variant="outline"
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
