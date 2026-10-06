import type { TFunction } from "i18next";
import type { AgentRouteFailureReason } from "@getpaseo/protocol/agent-route";

/** Why a routed thread moved off its entry, in the app's own words (docs/agent-routes.md). */
export function agentRouteFailureReasonText(reason: AgentRouteFailureReason, t: TFunction): string {
  switch (reason) {
    case "auth":
      return t("agentRoutes.reason.auth");
    case "quota":
      return t("agentRoutes.reason.quota");
    case "unreachable":
      return t("agentRoutes.reason.unreachable");
    case "manual":
      return t("agentRoutes.reason.manual");
  }
}
