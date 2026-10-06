import type { Logger } from "pino";
import type { UsageReportEntry } from "@getpaseo/protocol/messages";
import type { AgentManager } from "../agent-manager.js";
import type { AgentStorage } from "../agent-storage.js";
import type { ProviderSnapshotManager } from "../provider-snapshot-manager.js";
import type { CreateAgentCommandInput, CreateAgentCommandResult } from "../create-agent/create.js";
import type { DaemonConfigStore } from "../../daemon-config-store.js";
import type { ProviderAccountService } from "../../provider-accounts/service.js";
import { sendPromptToAgent } from "../agent-prompt.js";
import { ensureAgentLoaded } from "../agent-loading.js";
import { appendTimelineItemIfAgentKnown } from "../timeline-append.js";
import { createAgentBriefService } from "../brief/brief-service.js";
import {
  createAgentBriefGenerator,
  createProductionBriefStructuredGeneration,
} from "../brief/brief-generator.js";
import type { AgentRouting } from "./handlers.js";
import { createRoutePreflight, type RouteUsageLookup } from "./preflight.js";
import { createAgentRouteService, type AgentRouteService } from "./route-service.js";

/** Usage is a best-effort preflight check; a slow source must not hold up creating an agent. */
const USAGE_LOOKUP_TIMEOUT_MS = 3000;

export interface AgentRoutingWiringDeps {
  agentManager: AgentManager;
  agentStorage: AgentStorage;
  daemonConfigStore: DaemonConfigStore;
  providerSnapshotManager: ProviderSnapshotManager;
  providerAccounts: ProviderAccountService;
  listUsageReports: () => Promise<UsageReportEntry[]>;
  createAgent: (input: CreateAgentCommandInput) => Promise<CreateAgentCommandResult>;
  paseoHome: string;
  logger: Logger;
}

export interface AgentRoutingWiring {
  routing: AgentRouting;
  routeService: AgentRouteService;
  start(): void;
  stop(): void;
}

/**
 * Builds the brief and route services (docs/agent-routes.md) from daemon collaborators, so
 * bootstrap only creates this, starts it, and hands `routing`/`routeService` to the WebSocket
 * server and the MCP tool host.
 */
export function createAgentRoutingWiring(deps: AgentRoutingWiringDeps): AgentRoutingWiring {
  const readDaemonConfig = () => deps.daemonConfigStore.get();
  const loadAgent = async (agentId: string) => {
    try {
      return await ensureAgentLoaded(agentId, {
        agentManager: deps.agentManager,
        agentStorage: deps.agentStorage,
        logger: deps.logger,
      });
    } catch (error) {
      deps.logger.warn({ err: error, agentId }, "Route: could not load agent");
      return null;
    }
  };
  const briefService = createAgentBriefService({
    loadAgent,
    agentManager: deps.agentManager,
    readDaemonConfig,
    paseoHome: deps.paseoHome,
    generator: createAgentBriefGenerator({
      readTimeline: (agentId) => deps.agentManager.getTimelineRows(agentId),
      generation: createProductionBriefStructuredGeneration({
        agentManager: deps.agentManager,
        providerSnapshotManager: deps.providerSnapshotManager,
        readDaemonConfig,
      }),
    }),
    logger: deps.logger.child({ module: "agent-brief-service" }),
  });
  const preflight = createRoutePreflight({
    readDaemonConfig,
    providers: deps.agentManager,
    accounts: deps.providerAccounts,
    usage: createRouteUsageLookup(deps),
  });
  const routeService = createAgentRouteService({
    agentManager: deps.agentManager,
    createAgent: deps.createAgent,
    sendPrompt: async (agentId, prompt) => {
      await sendPromptToAgent({
        agentManager: deps.agentManager,
        agentStorage: deps.agentStorage,
        agentId,
        prompt,
        logger: deps.logger,
      });
    },
    appendNotification: async (agentId, message, level = "info") => {
      await appendTimelineItemIfAgentKnown({
        agentManager: deps.agentManager,
        agentId,
        item: { type: "notification", level, message },
      });
    },
    preflight,
    readDaemonConfig,
    handoff: briefService,
    loadAgent,
    cancelAgentRun: (agentId) => deps.agentManager.cancelAgentRun(agentId),
    logger: deps.logger.child({ module: "agent-route-service" }),
  });
  return {
    routing: { routes: routeService, briefs: briefService },
    routeService,
    start() {
      briefService.start();
      routeService.start();
    },
    stop() {
      routeService.stop();
      briefService.stop();
    },
  };
}

/**
 * Usage reports name their source (the provider id for the built-in sources) and the account's
 * label, not the Stroll account id, so an entry pinned to a managed account matches reports by the
 * account's name, and the system account takes the reports that match no managed account.
 */
function createRouteUsageLookup(deps: AgentRoutingWiringDeps): RouteUsageLookup {
  return {
    async listReports({ provider, accountProfileId }) {
      const reports = await withTimeout(deps.listUsageReports(), USAGE_LOOKUP_TIMEOUT_MS, []);
      const accounts = deps.providerAccounts
        .listUsageScopes()
        .filter((account) => account.provider === provider);
      const managedNames = new Set(accounts.map((account) => account.accountName));
      const pinnedName = accountProfileId
        ? (accounts.find((account) => account.accountProfileId === accountProfileId)?.accountName ??
          null)
        : null;
      return reports.filter((report) => {
        if (report.sourceId !== provider) return false;
        const label = report.account.label ?? null;
        if (accountProfileId) return pinnedName !== null && label === pinnedName;
        return label === null || !managedNames.has(label);
      });
    },
  };
}

async function withTimeout<T>(promise: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<T>((resolve) => {
    timer = setTimeout(() => resolve(fallback), ms);
  });
  try {
    return await Promise.race([promise.catch(() => fallback), timeout]);
  } finally {
    clearTimeout(timer);
  }
}
