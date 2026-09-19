import { describe, expect, it } from "vitest";
import { CHAT_SUGGESTIONS, resolveSuggestionComposerText } from "./chat-hero-suggestions";

describe("resolveSuggestionComposerText", () => {
  it("uses the explicit prompt when the chip provides one", () => {
    expect(
      resolveSuggestionComposerText({ label: "Write a plan for…", prompt: "Write a plan for " }),
    ).toBe("Write a plan for ");
  });

  it("falls back to the chip label when no prompt is provided", () => {
    expect(resolveSuggestionComposerText({ label: "Explain this repository" })).toBe(
      "Explain this repository",
    );
  });
});

describe("CHAT_SUGGESTIONS", () => {
  it("has between 3 and 4 static suggestions with unique keys", () => {
    expect(CHAT_SUGGESTIONS.length).toBeGreaterThanOrEqual(3);
    expect(CHAT_SUGGESTIONS.length).toBeLessThanOrEqual(4);
    expect(new Set(CHAT_SUGGESTIONS.map((s) => s.key)).size).toBe(CHAT_SUGGESTIONS.length);
  });
});
