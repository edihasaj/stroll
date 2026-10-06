import { describe, expect, it } from "vitest";
import { classifyRouteFailure, type TurnFailedStreamEvent } from "./classify-failure.js";

function turnFailed(overrides: Partial<TurnFailedStreamEvent> = {}): TurnFailedStreamEvent {
  return {
    type: "turn_failed",
    provider: "codex",
    error: "Something went wrong",
    ...overrides,
  };
}

describe("classifyRouteFailure", () => {
  it("classifies an expired auth state as auth", () => {
    expect(classifyRouteFailure(turnFailed({ authState: "expired" }))).toBe("auth");
  });

  it("classifies a provider auth error message as auth", () => {
    expect(classifyRouteFailure(turnFailed({ error: "Failed to authenticate with Claude" }))).toBe(
      "auth",
    );
  });

  it("classifies a rate limit message as quota", () => {
    expect(classifyRouteFailure(turnFailed({ error: "Rate limit exceeded, slow down" }))).toBe(
      "quota",
    );
  });

  it("classifies insufficient credits as quota", () => {
    expect(
      classifyRouteFailure(turnFailed({ error: "Error: insufficient credits on account" })),
    ).toBe("quota");
  });

  it("classifies a credit balance message as quota", () => {
    expect(
      classifyRouteFailure(turnFailed({ error: "Your credit balance is too low to continue" })),
    ).toBe("quota");
  });

  it("classifies HTTP 429 as quota", () => {
    expect(classifyRouteFailure(turnFailed({ error: "Request failed with HTTP 429" }))).toBe(
      "quota",
    );
  });

  it("classifies a billing failure as quota", () => {
    expect(classifyRouteFailure(turnFailed({ error: "Billing issue: payment required" }))).toBe(
      "quota",
    );
  });

  it("classifies ECONNREFUSED as unreachable", () => {
    expect(classifyRouteFailure(turnFailed({ error: "connect ECONNREFUSED 127.0.0.1:8000" }))).toBe(
      "unreachable",
    );
  });

  it("classifies a socket hang up as unreachable", () => {
    expect(classifyRouteFailure(turnFailed({ error: "socket hang up" }))).toBe("unreachable");
  });

  it("classifies HTTP 503 as unreachable", () => {
    expect(classifyRouteFailure(turnFailed({ error: "upstream returned HTTP 503" }))).toBe(
      "unreachable",
    );
  });

  it("classifies bad gateway as unreachable", () => {
    expect(classifyRouteFailure(turnFailed({ error: "502 Bad Gateway from upstream" }))).toBe(
      "unreachable",
    );
  });

  it("returns null for an ordinary failure", () => {
    expect(
      classifyRouteFailure(turnFailed({ error: "The model declined to continue" })),
    ).toBeNull();
  });

  it("does not misread a bare status-shaped number with no HTTP context as quota", () => {
    // A test asserting a line count ("expected 429 lines") must not be misread as HTTP 429.
    expect(
      classifyRouteFailure(turnFailed({ error: "assertion failed: expected 429 lines, got 430" })),
    ).toBeNull();
  });

  it("does not misread a port number near the word rate as quota", () => {
    // Adversarial case for the brief's "ordinary tool output quoted in an error" warning: the
    // word "rate" appears near "429" but neither the rate-limit phrase nor the HTTP-429 phrase
    // is actually present.
    expect(
      classifyRouteFailure(
        turnFailed({ error: "Logged 429 responses from the rate limiter during the load test" }),
      ),
    ).toBeNull();
  });

  it("does not misread an unrelated disk quota message with no exceed/limit keyword as quota", () => {
    expect(
      classifyRouteFailure(turnFailed({ error: "quota settings updated for this volume" })),
    ).toBeNull();
  });

  it("checks the code and diagnostic fields in addition to the error message", () => {
    expect(
      classifyRouteFailure(
        turnFailed({
          error: "Request failed",
          code: undefined,
          diagnostic: "ETIMEDOUT while dialing",
        }),
      ),
    ).toBe("unreachable");
  });

  it("prefers auth over quota/unreachable wording when authState is expired", () => {
    expect(
      classifyRouteFailure(turnFailed({ authState: "expired", error: "rate limit also hit" })),
    ).toBe("auth");
  });
});
