import type { ComponentType } from "react";
import { BookOpenText, Bug, GitCommitVertical, ListTodo } from "lucide-react-native";

export type ChatSuggestionKey = "explainRepo" | "fixTests" | "reviewCommit" | "writePlan";

export interface ChatSuggestion {
  key: ChatSuggestionKey;
  icon: ComponentType<{ color: string; size: number }>;
  /** i18n key for the chip's visible label. */
  labelKey: string;
  /** i18n key for the text inserted into the composer. Falls back to the label when absent. */
  promptKey?: string;
}

/**
 * Static suggestions for the blank chat hero, useful starting points for a coding agent.
 * "Write a plan for…" is the one chip whose chip label (ellipsis, inviting completion) differs
 * from what it inserts into the composer (a trailing space, ready for the user to finish typing).
 */
export const CHAT_SUGGESTIONS: readonly ChatSuggestion[] = [
  {
    key: "explainRepo",
    icon: BookOpenText,
    labelKey: "newWorkspace.chat.suggestions.explainRepo.label",
  },
  {
    key: "fixTests",
    icon: Bug,
    labelKey: "newWorkspace.chat.suggestions.fixTests.label",
  },
  {
    key: "reviewCommit",
    icon: GitCommitVertical,
    labelKey: "newWorkspace.chat.suggestions.reviewCommit.label",
  },
  {
    key: "writePlan",
    icon: ListTodo,
    labelKey: "newWorkspace.chat.suggestions.writePlan.label",
    promptKey: "newWorkspace.chat.suggestions.writePlan.prompt",
  },
];

/**
 * Resolves the text a suggestion chip fills into the composer. Most chips insert the same text
 * they display; a chip with a distinct `prompt` (its resolved `promptKey`) inserts that instead.
 */
export function resolveSuggestionComposerText(input: { label: string; prompt?: string }): string {
  return input.prompt ?? input.label;
}
