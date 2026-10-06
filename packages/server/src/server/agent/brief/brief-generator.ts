import { z } from "zod";
import {
  AgentBriefEditSchema,
  readAgentRouteLabels,
  resolveRoutePrivacy,
} from "@getpaseo/protocol/agent-route";
import type { AgentBrief } from "@getpaseo/protocol/agent-route";
import type { MutableDaemonConfig } from "@getpaseo/protocol/messages";
import type { AgentManager, ManagedAgent } from "../agent-manager.js";
import type { AgentTimelineRow } from "../agent-timeline-store-types.js";
import type { AgentProvider } from "../agent-sdk-types.js";
import {
  generateStructuredAgentResponseWithFallback,
  type StructuredGenerationProvider,
} from "../agent-response-loop.js";
import { resolveStructuredGenerationProviders } from "../structured-generation-providers.js";
import type { ProviderSnapshotManager } from "../provider-snapshot-manager.js";
import { curateAgentActivity } from "../activity-curator.js";

/** Keeps the regeneration prompt bounded regardless of how much happened since the last brief. */
const MAX_ACTIVITY_CHARS = 20_000;

export type AgentBriefDaemonConfig = Pick<
  MutableDaemonConfig,
  "agentProfiles" | "agentRoutes" | "metadataGeneration"
>;

export interface AgentBriefGenerationInput {
  agent: Pick<ManagedAgent, "id" | "cwd" | "config" | "labels">;
  threadId: string;
  previousBrief: AgentBrief | null;
}

/** Regenerates one thread's brief (docs/agent-routes.md: "The brief and the handoff packet"). */
export interface AgentBriefGenerator {
  regenerate(input: AgentBriefGenerationInput): Promise<AgentBrief>;
}

export interface BriefStructuredGenerationRequest<T> {
  cwd: string;
  prompt: string;
  schema: z.ZodType<T>;
  schemaName: string;
  provider: AgentProvider;
  model?: string;
  thinkingOptionId?: string;
  /** The agent's route id, or null when it is not routed. */
  routeId: string | null;
}

/** The LLM boundary, injected so prompt-building and provider selection are unit-testable. */
export interface BriefStructuredGeneration {
  generate<T>(request: BriefStructuredGenerationRequest<T>): Promise<T>;
}

export function createAgentBriefGenerator(deps: {
  /** Committed rows from durable storage (`AgentManager.getTimelineRows`). */
  readTimeline: (agentId: string) => Promise<readonly AgentTimelineRow[]>;
  generation: BriefStructuredGeneration;
}): AgentBriefGenerator {
  return {
    async regenerate(input) {
      const rows = await deps.readTimeline(input.agent.id);
      const previousBrief = input.previousBrief;
      const relevantRows = previousBrief
        ? rows.filter((row) => row.timestamp > previousBrief.updatedAt)
        : rows;
      const activity = capActivityText(
        curateAgentActivity(relevantRows.map((row) => row.item)),
        MAX_ACTIVITY_CHARS,
      );
      const prompt = buildBriefGenerationPrompt({ previousBrief, activity });
      const routeId = readAgentRouteLabels(input.agent.labels)?.routeId ?? null;

      const fields = await deps.generation.generate({
        cwd: input.agent.cwd,
        prompt,
        schema: AgentBriefEditSchema,
        schemaName: "AgentBrief",
        provider: input.agent.config.provider,
        model: input.agent.config.model,
        thinkingOptionId: input.agent.config.thinkingOptionId,
        routeId,
      });

      return {
        threadId: input.threadId,
        ...fields,
        updatedAt: new Date().toISOString(),
      };
    },
  };
}

/** Caps from the end: the most recent activity is what the next model needs most. */
export function capActivityText(text: string, maxChars: number): string {
  if (text.length <= maxChars) {
    return text;
  }
  return `(earlier activity truncated)\n${text.slice(text.length - maxChars)}`;
}

type PreviousBriefFields = Pick<AgentBrief, "goal" | "state" | "decisions" | "openItems" | "files">;

/**
 * Pure prompt builder: the previous brief (if any) plus the curated activity since it was last
 * updated. `generateStructuredAgentResponseWithFallback` appends the JSON schema instructions.
 */
export function buildBriefGenerationPrompt(input: {
  previousBrief: PreviousBriefFields | null;
  activity: string;
}): string {
  return [
    "You maintain a running brief for a coding-agent thread. The thread may hand off to a " +
      "different AI model mid-task, so the brief is the only continuity the next model gets.",
    "Update the brief from the previous version and the activity recorded since it was last " +
      "updated. Goal and state are one or two sentences each. Decisions and open items are short " +
      "bullet phrases. Files lists every path touched so far, previous and new combined.",
    formatPreviousBriefSection(input.previousBrief),
    `## Activity since the last update\n${input.activity.trim() || "(no new activity)"}`,
  ].join("\n\n");
}

function formatPreviousBriefSection(previousBrief: PreviousBriefFields | null): string {
  if (!previousBrief) {
    return "## Previous brief\n(none yet — this is the first brief for this thread)";
  }
  return [
    "## Previous brief",
    `Goal: ${previousBrief.goal}`,
    `State: ${previousBrief.state}`,
    `Decisions: ${previousBrief.decisions.join("; ") || "(none)"}`,
    `Open items: ${previousBrief.openItems.join("; ") || "(none)"}`,
    `Files: ${previousBrief.files.join(", ") || "(none)"}`,
  ].join("\n");
}

/**
 * Provider selection (docs/agent-routes.md): on a route whose privacy resolves to "local", the
 * agent's own provider/model is the only candidate. Otherwise the configured metadata providers
 * are candidates too, via `resolveStructuredGenerationProviders`.
 */
export async function resolveBriefGenerationProviders(input: {
  cwd: string;
  provider: AgentProvider;
  model?: string;
  thinkingOptionId?: string;
  routeId: string | null;
  daemonConfig: AgentBriefDaemonConfig;
  providerSnapshotManager: Pick<ProviderSnapshotManager, "listProviders">;
}): Promise<StructuredGenerationProvider[]> {
  const route = input.routeId
    ? ((input.daemonConfig.agentRoutes ?? []).find((candidate) => candidate.id === input.routeId) ??
      null)
    : null;

  // Privacy is local unless a route explicitly says cloud. Everything else — a local route, a
  // non-routed agent, a label naming a route that no longer exists — generates the brief on the
  // agent's own provider only, which already sees this content, so the brief adds no exposure.
  if (!route || resolveRoutePrivacy(route) !== "cloud") {
    return [
      {
        provider: input.provider,
        ...(input.model ? { model: input.model } : {}),
        ...(input.thinkingOptionId ? { thinkingOptionId: input.thinkingOptionId } : {}),
      },
    ];
  }

  return resolveStructuredGenerationProviders({
    cwd: input.cwd,
    providerSnapshotManager: input.providerSnapshotManager,
    daemonConfig: input.daemonConfig,
    currentSelection: {
      provider: input.provider,
      model: input.model ?? null,
      thinkingOptionId: input.thinkingOptionId ?? null,
    },
  });
}

/** Production `BriefStructuredGeneration`: an internal, non-persisted structured-generation run. */
export function createProductionBriefStructuredGeneration(deps: {
  agentManager: AgentManager;
  providerSnapshotManager: Pick<ProviderSnapshotManager, "listProviders">;
  readDaemonConfig: () => AgentBriefDaemonConfig;
}): BriefStructuredGeneration {
  return {
    async generate(request) {
      const providers = await resolveBriefGenerationProviders({
        cwd: request.cwd,
        provider: request.provider,
        model: request.model,
        thinkingOptionId: request.thinkingOptionId,
        routeId: request.routeId,
        daemonConfig: deps.readDaemonConfig(),
        providerSnapshotManager: deps.providerSnapshotManager,
      });
      return generateStructuredAgentResponseWithFallback({
        manager: deps.agentManager,
        cwd: request.cwd,
        prompt: request.prompt,
        schema: request.schema,
        schemaName: request.schemaName,
        providers,
        persistSession: false,
        agentConfigOverrides: {
          title: "Brief generator",
          internal: true,
        },
      });
    },
  };
}
