import type { TFunction } from "i18next";
import type { AgentRoutePreflightResult } from "@getpaseo/protocol/agent-route";
import { agentRoutePreflightReasonText } from "./preflight-reason-text";

export interface AgentRoutePreflightResultView {
  profileId: string;
  label: string;
  ok: boolean;
  /** Set when `ok` is false: the reason text, plus the server's detail when it added one. */
  detail: string | null;
}

/** Renders one `agent.route.preflight.response` entry for Settings → Host → Routes → Test. */
export function toAgentRoutePreflightResultView(
  result: AgentRoutePreflightResult,
  t: TFunction,
): AgentRoutePreflightResultView {
  const label = result.profileName ?? result.profileId;
  if (result.ok) {
    return { profileId: result.profileId, label, ok: true, detail: null };
  }
  const reasonText = result.reason ? agentRoutePreflightReasonText(result.reason, t) : null;
  const detail = result.detail?.trim();
  const parts = [reasonText, detail].filter(
    (part): part is string => typeof part === "string" && part.length > 0,
  );
  return {
    profileId: result.profileId,
    label,
    ok: false,
    detail: parts.length > 0 ? parts.join(": ") : t("agentRoutes.preflightReason.unknown"),
  };
}
