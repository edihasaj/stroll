import { beforeAll, describe, expect, it } from "vitest";
import { i18n } from "@/i18n/i18next";
import { agentRouteFailureReasonText } from "./reason-text";

describe("agentRouteFailureReasonText", () => {
  beforeAll(async () => {
    await i18n.changeLanguage("en");
  });

  it("maps every failure reason to its own words", () => {
    expect(agentRouteFailureReasonText("auth", i18n.t)).toBe("Signed out");
    expect(agentRouteFailureReasonText("quota", i18n.t)).toBe("Out of usage or credits");
    expect(agentRouteFailureReasonText("unreachable", i18n.t)).toBe("Not reachable");
    expect(agentRouteFailureReasonText("manual", i18n.t)).toBe("Switched manually");
  });
});
