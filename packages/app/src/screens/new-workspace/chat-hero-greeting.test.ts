import { describe, expect, it } from "vitest";
import { resolveChatGreetingPeriod } from "./chat-hero-greeting";

describe("resolveChatGreetingPeriod", () => {
  it("returns morning for the early-day hours", () => {
    expect(resolveChatGreetingPeriod(5)).toBe("morning");
    expect(resolveChatGreetingPeriod(11)).toBe("morning");
  });

  it("returns afternoon for the midday hours", () => {
    expect(resolveChatGreetingPeriod(12)).toBe("afternoon");
    expect(resolveChatGreetingPeriod(17)).toBe("afternoon");
  });

  it("returns evening for night and late-night hours", () => {
    expect(resolveChatGreetingPeriod(18)).toBe("evening");
    expect(resolveChatGreetingPeriod(23)).toBe("evening");
    expect(resolveChatGreetingPeriod(0)).toBe("evening");
    expect(resolveChatGreetingPeriod(4)).toBe("evening");
  });
});
