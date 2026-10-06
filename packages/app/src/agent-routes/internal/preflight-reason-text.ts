import type { TFunction } from "i18next";
import type { AgentRoutePreflightResult } from "@getpaseo/protocol/agent-route";

export type AgentRoutePreflightReason = NonNullable<AgentRoutePreflightResult["reason"]>;

/** Why a route entry failed preflight (docs/agent-routes.md "Preflight"), in the app's own words. */
export function agentRoutePreflightReasonText(
  reason: AgentRoutePreflightReason,
  t: TFunction,
): string {
  switch (reason) {
    case "profile_missing":
      return t("agentRoutes.preflightReason.profileMissing");
    case "privacy":
      return t("agentRoutes.preflightReason.privacy");
    case "provider_unavailable":
      return t("agentRoutes.preflightReason.providerUnavailable");
    case "signed_out":
      return t("agentRoutes.preflightReason.signedOut");
    case "quota":
      return t("agentRoutes.preflightReason.quota");
    case "unreachable":
      return t("agentRoutes.preflightReason.unreachable");
  }
}
