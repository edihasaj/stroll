import { isProviderAuthError } from "../providers/auth-error.js";
import type { AgentStreamEvent } from "../agent-sdk-types.js";
import type { AgentRouteFailureReason } from "@getpaseo/protocol/agent-route";

export type TurnFailedStreamEvent = Extract<AgentStreamEvent, { type: "turn_failed" }>;

/*
 * Matched against a turn failure's own error/code/diagnostic text. Bare HTTP status codes and
 * single ambiguous words (quota, billing) are gated behind a nearby keyword so ordinary tool
 * output quoted in an error — a byte count, a port number, a passing test's own log line — is
 * not misread as a provider failure. Multi-word phrases are specific enough to match directly.
 */
const QUOTA_PATTERNS: readonly RegExp[] = [
  /\brate[ _-]?limit(?:ed|ing)?\b/i,
  /\busage[ _-]?limit\b/i,
  /\btoo many requests\b/i,
  /\binsufficient[ _-]?(?:credits?|quota)\b/i,
  /\bcredit[ _-]?balance\b/i,
  /\bexceeded your current\b/i,
  /\bhttp\/?\s*429\b/i,
  /\bquota\b[^\n]{0,80}\b(?:exceeded|exhausted|remaining|reached|limit)\b/i,
  /\b(?:exceeded|exhausted|remaining|reached|limit)\b[^\n]{0,80}\bquota\b/i,
  /\bbilling\b[^\n]{0,80}\b(?:error|issue|problem|failed|suspended|past due|limit)\b/i,
  /\b(?:error|issue|problem|failed|suspended|past due|limit)\b[^\n]{0,80}\bbilling\b/i,
];

const UNREACHABLE_PATTERNS: readonly RegExp[] = [
  /\bECONNREFUSED\b/,
  /\bENOTFOUND\b/,
  /\bETIMEDOUT\b/,
  /\bECONNRESET\b/,
  /\bfetch failed\b/i,
  /\bsocket hang up\b/i,
  /\bnetwork error\b/i,
  /\bconnection error\b/i,
  /\bbad gateway\b/i,
  /\bservice unavailable\b/i,
  /\bgateway timeout\b/i,
  /\bhttp\/?\s*50[234]\b/i,
  // Bun's fetch (OMP, Pi) reports a refused or unroutable endpoint as "Unable to connect. Is the
  // computer able to access the url?" with no errno in the text.
  /\bunable to connect\b/i,
  /\bis the computer able to access the url\b/i,
  /\b(?:could not|failed to) connect\b/i,
  /\bconnection refused\b/i,
  /\b(?:EHOSTUNREACH|ENETUNREACH|EAI_AGAIN)\b/,
  /\bno route to host\b/i,
];

/**
 * Classifies a routed agent's turn failure per docs/agent-routes.md ("Failover"). Any other
 * failure is an ordinary failure and stays visible as one — failover never hides a real error.
 */
export function classifyRouteFailure(event: TurnFailedStreamEvent): AgentRouteFailureReason | null {
  if (event.authState === "expired" || isProviderAuthError(event.error)) {
    return "auth";
  }
  const haystack = [event.error, event.code, event.diagnostic]
    .filter((value): value is string => typeof value === "string" && value.length > 0)
    .join("\n");
  if (QUOTA_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return "quota";
  }
  if (UNREACHABLE_PATTERNS.some((pattern) => pattern.test(haystack))) {
    return "unreachable";
  }
  return null;
}
