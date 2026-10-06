import type { TFunction } from "i18next";
import type { AgentRouteFailureReason, AgentRouteLabels } from "@getpaseo/protocol/agent-route";
import { agentRouteFailureReasonText } from "./reason-text";

export interface RouteBannerNone {
  kind: "none";
}

export interface RouteBannerAwaitingChoice {
  kind: "awaiting_choice";
  message: string;
}

export interface RouteBannerPaused {
  kind: "paused";
  message: string;
}

export interface RouteBannerContinued {
  kind: "continued";
  message: string;
  continuedByAgentId: string;
}

export interface RouteBannerContinuedFrom {
  kind: "continued_from";
  message: string;
}

export type RouteBannerViewModel =
  | RouteBannerNone
  | RouteBannerAwaitingChoice
  | RouteBannerPaused
  | RouteBannerContinued
  | RouteBannerContinuedFrom;

export interface ResolveRouteBannerInput {
  /** `readAgentRouteLabels(agent.labels)`; `null` when the agent did not start on a route. */
  labels: AgentRouteLabels | null;
  /** Display name of `labels.nextProfileId`, resolved from the host's `agentProfiles`. */
  nextProfileName: string | null;
  /** Profile name (or title) of the agent named by `labels.continuedByAgentId`. */
  continuedByAgentTitle: string | null;
  /** Profile name (or title) of the agent named by `labels.continuesAgentId`. */
  previousAgentTitle: string | null;
  /**
   * The failure that moved the thread off the previous agent. It is stamped on that agent's
   * labels, not on the continuation's.
   */
  previousReason: AgentRouteFailureReason | null;
}

/** Maps a routed agent's labels to the banner the agent panel shows above its composer. */
export function resolveRouteBannerViewModel(
  input: ResolveRouteBannerInput,
  t: TFunction,
): RouteBannerViewModel {
  const { labels } = input;
  if (!labels) {
    return { kind: "none" };
  }

  if (labels.state === "awaiting_choice") {
    const reasonText = labels.reason
      ? agentRouteFailureReasonText(labels.reason, t)
      : agentRouteFailureReasonText("manual", t);
    const profileName = input.nextProfileName ?? t("agentRoutes.banner.unknownProfile");
    return {
      kind: "awaiting_choice",
      message: t("agentRoutes.banner.awaitingChoice", { reason: reasonText, profile: profileName }),
    };
  }

  if (labels.state === "paused") {
    return { kind: "paused", message: t("agentRoutes.banner.paused") };
  }

  if (labels.state === "continued" && labels.continuedByAgentId) {
    const title = input.continuedByAgentTitle ?? t("agentRoutes.banner.unknownAgent");
    return {
      kind: "continued",
      message: t("agentRoutes.banner.continued", { title }),
      continuedByAgentId: labels.continuedByAgentId,
    };
  }

  if (labels.state === "active" && labels.continuesAgentId) {
    const name = input.previousAgentTitle ?? t("agentRoutes.banner.unknownAgent");
    const reason = labels.reason ?? input.previousReason;
    const message = reason
      ? t("agentRoutes.banner.continuedFromWithReason", {
          name,
          reason: agentRouteFailureReasonText(reason, t),
        })
      : t("agentRoutes.banner.continuedFrom", { name });
    return { kind: "continued_from", message };
  }

  return { kind: "none" };
}
