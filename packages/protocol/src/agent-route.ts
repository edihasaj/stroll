import { z } from "zod";

/**
 * Agent routes: an ordered list of agent profiles a thread runs on, with failover to the next
 * profile when one is unavailable. See docs/agent-routes.md.
 *
 * A route is local-only unless it says otherwise, and an entry counts as local only when it says
 * so: a local route never runs on an entry that is not explicitly marked local.
 */
export const AgentRoutePrivacySchema = z.enum(["local", "cloud"]);
export type AgentRoutePrivacy = z.infer<typeof AgentRoutePrivacySchema>;

export const AgentRouteFailoverModeSchema = z.enum(["auto", "ask"]);
export type AgentRouteFailoverMode = z.infer<typeof AgentRouteFailoverModeSchema>;

export const AgentRouteEntrySchema = z
  .object({
    /** An `AgentProfile.id` from the daemon's `agentProfiles`. */
    profileId: z.string(),
    /** Defaults to "cloud". */
    privacy: AgentRoutePrivacySchema.optional(),
    /**
     * An OpenAI-compatible base URL (ending in /v1) checked before the entry is used: preflight
     * requests `{probeUrl}/models` and requires a 2xx answer. For self-hosted models.
     */
    probeUrl: z.string().optional(),
  })
  .passthrough();
export type AgentRouteEntry = z.infer<typeof AgentRouteEntrySchema>;

export const AgentRouteSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    /** Defaults to "local". */
    privacy: AgentRoutePrivacySchema.optional(),
    /** Defaults to "auto". */
    failover: AgentRouteFailoverModeSchema.optional(),
    entries: z.array(AgentRouteEntrySchema),
  })
  .passthrough();
export type AgentRoute = z.infer<typeof AgentRouteSchema>;

export function resolveRoutePrivacy(route: Pick<AgentRoute, "privacy">): AgentRoutePrivacy {
  return route.privacy ?? "local";
}

export function resolveEntryPrivacy(entry: Pick<AgentRouteEntry, "privacy">): AgentRoutePrivacy {
  return entry.privacy ?? "cloud";
}

export function resolveRouteFailoverMode(
  route: Pick<AgentRoute, "failover">,
): AgentRouteFailoverMode {
  return route.failover ?? "auto";
}

/** Why a routed agent stopped being usable. `manual` is a user-requested switch. */
export const AgentRouteFailureReasonSchema = z.enum(["auth", "quota", "unreachable", "manual"]);
export type AgentRouteFailureReason = z.infer<typeof AgentRouteFailureReasonSchema>;

export const AgentRoutePreflightResultSchema = z.object({
  profileId: z.string(),
  profileName: z.string().nullable(),
  ok: z.boolean(),
  /** Set when `ok` is false: why the entry was skipped. */
  reason: z
    .enum([
      "profile_missing",
      "privacy",
      "provider_unavailable",
      "signed_out",
      "quota",
      "unreachable",
    ])
    .nullable(),
  detail: z.string().nullable(),
});
export type AgentRoutePreflightResult = z.infer<typeof AgentRoutePreflightResultSchema>;

/**
 * The thread's running summary, kept current after every completed turn and handed to the next
 * profile on failover. A user edit is kept and wins over the next regeneration's fields only
 * until the agent produces new work.
 */
export const AgentBriefSchema = z.object({
  threadId: z.string(),
  goal: z.string(),
  state: z.string(),
  decisions: z.array(z.string()),
  openItems: z.array(z.string()),
  files: z.array(z.string()),
  updatedAt: z.string(),
  editedByUser: z.boolean().optional(),
});
export type AgentBrief = z.infer<typeof AgentBriefSchema>;

export const AgentBriefEditSchema = AgentBriefSchema.pick({
  goal: true,
  state: true,
  decisions: true,
  openItems: true,
  files: true,
});
export type AgentBriefEdit = z.infer<typeof AgentBriefEditSchema>;

export const AgentRouteEventSchema = z.object({
  at: z.string(),
  kind: z.enum(["failover", "awaiting_choice", "switch_back", "paused", "resumed"]),
  fromAgentId: z.string().nullable(),
  toAgentId: z.string().nullable(),
  fromProfileId: z.string().nullable(),
  toProfileId: z.string().nullable(),
  reason: AgentRouteFailureReasonSchema.nullable(),
  detail: z.string().nullable(),
});
export type AgentRouteEvent = z.infer<typeof AgentRouteEventSchema>;

/*
 * Route state travels on agent labels, so every client already receives it with the agent
 * snapshot. Values are strings; absent labels mean "not routed".
 */
export const ROUTE_ID_LABEL = "stroll.route";
/** Index of the route entry this agent runs on. */
export const ROUTE_ENTRY_LABEL = "stroll.route.entry";
/** Id of the first agent of the thread; the brief and route history are keyed by it. */
export const ROUTE_THREAD_LABEL = "stroll.route.thread";
/** On a continuation agent: the agent it continues. */
export const ROUTE_CONTINUES_LABEL = "stroll.route.continues";
/** On an agent that handed off: the agent that took over. */
export const ROUTE_CONTINUED_BY_LABEL = "stroll.route.continued-by";
export const ROUTE_STATE_LABEL = "stroll.route.state";
/** With state `awaiting_choice`: the profile failover would continue on. */
export const ROUTE_NEXT_PROFILE_LABEL = "stroll.route.next-profile";
/** The failure reason behind the current state, when there is one. */
export const ROUTE_REASON_LABEL = "stroll.route.reason";

export const AgentRouteStateSchema = z.enum([
  /** Running on its entry. */
  "active",
  /** Its entry failed and the route asks before switching (`failover: "ask"`). */
  "awaiting_choice",
  /** Another agent took over; see `stroll.route.continued-by`. */
  "continued",
  /** No entry of the route is usable. The context is kept; resume tries the route again. */
  "paused",
]);
export type AgentRouteState = z.infer<typeof AgentRouteStateSchema>;

export interface AgentRouteLabels {
  routeId: string;
  entryIndex: number | null;
  threadId: string | null;
  continuesAgentId: string | null;
  continuedByAgentId: string | null;
  state: AgentRouteState;
  nextProfileId: string | null;
  reason: AgentRouteFailureReason | null;
}

function readLabel(labels: Record<string, unknown> | null | undefined, key: string): string | null {
  const value = labels?.[key];
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

/** Reads route state from an agent's labels, or null when the agent is not routed. */
export function readAgentRouteLabels(
  labels: Record<string, unknown> | null | undefined,
): AgentRouteLabels | null {
  const routeId = readLabel(labels, ROUTE_ID_LABEL);
  if (!routeId) return null;
  const entry = readLabel(labels, ROUTE_ENTRY_LABEL);
  const entryIndex = entry !== null && /^\d+$/.test(entry) ? Number(entry) : null;
  const state = AgentRouteStateSchema.safeParse(readLabel(labels, ROUTE_STATE_LABEL));
  const reason = AgentRouteFailureReasonSchema.safeParse(readLabel(labels, ROUTE_REASON_LABEL));
  return {
    routeId,
    entryIndex,
    threadId: readLabel(labels, ROUTE_THREAD_LABEL),
    continuesAgentId: readLabel(labels, ROUTE_CONTINUES_LABEL),
    continuedByAgentId: readLabel(labels, ROUTE_CONTINUED_BY_LABEL),
    state: state.success ? state.data : "active",
    nextProfileId: readLabel(labels, ROUTE_NEXT_PROFILE_LABEL),
    reason: reason.success ? reason.data : null,
  };
}
