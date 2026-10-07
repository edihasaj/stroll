import { z } from "zod";

/**
 * Whether the agent's harness will run a hook. Codex keeps a trusted hash per hook slot; a hook
 * that is new or changed since it was trusted does not run until the user reviews it.
 */
export const AgentHookTrustStatusSchema = z.enum(["trusted", "untrusted", "modified", "managed"]);
export type AgentHookTrustStatus = z.infer<typeof AgentHookTrustStatusSchema>;

/** One hook the agent's harness knows about, as shown in the review sheet. */
export const AgentHookSummarySchema = z
  .object({
    /** The harness's own slot key; the trust RPC takes these back. */
    key: z.string(),
    /** Lifecycle event, for example `stop` or `preToolUse`. */
    event: z.string(),
    /** Where the hook is configured: user, project, plugin, admin, and so on. */
    source: z.string(),
    sourcePath: z.string(),
    command: z.string().nullable().optional(),
    matcher: z.string().nullable().optional(),
    trustStatus: AgentHookTrustStatusSchema,
    enabled: z.boolean(),
  })
  .passthrough();
export type AgentHookSummary = z.infer<typeof AgentHookSummarySchema>;

/** Hooks the user still has to review before the harness runs them. */
export function hooksNeedingReview(hooks: readonly AgentHookSummary[]): AgentHookSummary[] {
  return hooks.filter(
    (hook) => hook.enabled && (hook.trustStatus === "untrusted" || hook.trustStatus === "modified"),
  );
}
