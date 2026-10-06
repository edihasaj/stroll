import { beforeAll, describe, expect, it } from "vitest";
import { i18n } from "@/i18n/i18next";
import { agentRoutePreflightReasonText } from "./preflight-reason-text";

describe("agentRoutePreflightReasonText", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("maps every preflight reason to its own words", () => {
    expect(agentRoutePreflightReasonText("profile_missing", i18n.t)).toBe("Profile not found");
    expect(agentRoutePreflightReasonText("privacy", i18n.t)).toBe("Not marked local");
    expect(agentRoutePreflightReasonText("provider_unavailable", i18n.t)).toBe(
      "Provider unavailable",
    );
    expect(agentRoutePreflightReasonText("signed_out", i18n.t)).toBe("Signed out");
    expect(agentRoutePreflightReasonText("quota", i18n.t)).toBe("Out of usage or credits");
    expect(agentRoutePreflightReasonText("unreachable", i18n.t)).toBe("Not reachable");
  });
});
