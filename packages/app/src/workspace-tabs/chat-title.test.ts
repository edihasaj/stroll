import { describe, expect, it } from "vitest";
import { resolveChatTitle } from "./chat-title";

describe("resolveChatTitle", () => {
  it("returns a real title trimmed", () => {
    expect(resolveChatTitle("  Fix the login redirect ")).toBe("Fix the login redirect");
  });

  it("has no title for a blank, missing, or placeholder one", () => {
    expect(resolveChatTitle("   ")).toBeNull();
    expect(resolveChatTitle(null)).toBeNull();
    expect(resolveChatTitle(undefined)).toBeNull();
    expect(resolveChatTitle("New Agent")).toBeNull();
  });
});
