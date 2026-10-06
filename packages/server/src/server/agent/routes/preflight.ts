import {
  resolveEntryPrivacy,
  resolveRoutePrivacy,
  type AgentRoute,
  type AgentRoutePreflightResult,
} from "@getpaseo/protocol/agent-route";
import type { AgentProfile } from "@getpaseo/protocol/agent-profile";
import type { MutableDaemonConfig, UsageReportEntry } from "@getpaseo/protocol/messages";
import type { AgentManager, ProviderAvailability } from "../agent-manager.js";
import type { ProviderAccountService } from "../../provider-accounts/service.js";

/** The slice of the daemon config preflight reads. Mirrors `AgentBriefDaemonConfig`. */
export type AgentRouteDaemonConfig = Pick<MutableDaemonConfig, "agentRoutes" | "agentProfiles">;

/**
 * Reports relevant to one route entry, best effort. A provider/account with no usage source
 * registered, or a source that fails to answer, reports nothing — the caller treats that as
 * usable rather than blocking the entry on missing data.
 */
export interface RouteUsageLookup {
  listReports(scope: {
    provider: string;
    accountProfileId: string | null;
  }): Promise<UsageReportEntry[]>;
}

export interface AgentRoutePreflightDeps {
  readDaemonConfig: () => AgentRouteDaemonConfig;
  providers: Pick<AgentManager, "getProviderAvailability">;
  accounts: Pick<ProviderAccountService, "list">;
  usage: RouteUsageLookup;
  /** Defaults to the global `fetch`. Injected so tests never hit the network. */
  fetchProbe?: typeof fetch;
}

export interface AgentRoutePreflight {
  checkEntry(route: AgentRoute, entryIndex: number): Promise<AgentRoutePreflightResult>;
  checkRoute(routeId: string): Promise<AgentRoutePreflightResult[]>;
}

const PROBE_TIMEOUT_MS = 5_000;

function ok(profileId: string, profileName: string | null): AgentRoutePreflightResult {
  return { profileId, profileName, ok: true, reason: null, detail: null };
}

function failed(
  profileId: string,
  profileName: string | null,
  reason: AgentRoutePreflightResult["reason"],
  detail: string,
): AgentRoutePreflightResult {
  return { profileId, profileName, ok: false, reason, detail };
}

function quotaDetailFromReport(entry: UsageReportEntry): string | null {
  if (entry.report.status !== "available") {
    return null;
  }
  for (const window of entry.report.windows) {
    if (typeof window.usedPct === "number" && window.usedPct >= 100) {
      return `${window.label} is fully used`;
    }
    if (typeof window.remainingPct === "number" && window.remainingPct <= 0) {
      return `${window.label} has no quota remaining`;
    }
  }
  for (const balance of entry.report.balances ?? []) {
    if (typeof balance.remaining === "number" && balance.remaining <= 0) {
      return `${balance.label} balance is exhausted`;
    }
  }
  return null;
}

/** `GET {probeUrl}/models`, 2xx required, within {@link PROBE_TIMEOUT_MS}. */
async function checkProbe(fetchProbe: typeof fetch, probeUrl: string): Promise<string | null> {
  const url = `${probeUrl.replace(/\/+$/, "")}/models`;
  try {
    const response = await fetchProbe(url, {
      method: "GET",
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    });
    if (response.ok) {
      return null;
    }
    return `GET ${url} returned ${response.status}`;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return `GET ${url} failed: ${message}`;
  }
}

export function createRoutePreflight(deps: AgentRoutePreflightDeps): AgentRoutePreflight {
  async function checkEntry(
    route: AgentRoute,
    entryIndex: number,
  ): Promise<AgentRoutePreflightResult> {
    const entry = route.entries[entryIndex];
    if (!entry) {
      return failed(
        "",
        null,
        "profile_missing",
        `Route ${route.id} has no entry at index ${entryIndex}`,
      );
    }
    const config = deps.readDaemonConfig();
    const profile = (config.agentProfiles ?? []).find(
      (candidate): candidate is AgentProfile => candidate.id === entry.profileId,
    );
    if (!profile) {
      return failed(
        entry.profileId,
        null,
        "profile_missing",
        `Profile ${entry.profileId} not found`,
      );
    }

    if (resolveRoutePrivacy(route) === "local" && resolveEntryPrivacy(entry) !== "local") {
      return failed(
        entry.profileId,
        profile.name,
        "privacy",
        `${route.name} is local-only but ${profile.name} is not marked local`,
      );
    }

    let availability: ProviderAvailability;
    try {
      availability = await deps.providers.getProviderAvailability(profile.provider);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return failed(entry.profileId, profile.name, "provider_unavailable", message);
    }
    if (!availability.available) {
      return failed(
        entry.profileId,
        profile.name,
        "provider_unavailable",
        availability.error ?? `Provider ${profile.provider} is unavailable`,
      );
    }

    if (profile.accountProfileId) {
      const account = deps.accounts
        .list()
        .accounts.find((candidate) => candidate.id === profile.accountProfileId);
      if (!account || !account.identity) {
        return failed(
          entry.profileId,
          profile.name,
          "signed_out",
          `Account ${profile.accountProfileId} is not signed in`,
        );
      }
    }

    const quotaDetail = await checkQuota(deps.usage, profile);
    if (quotaDetail) {
      return failed(entry.profileId, profile.name, "quota", quotaDetail);
    }

    if (entry.probeUrl) {
      const unreachableDetail = await checkProbe(deps.fetchProbe ?? fetch, entry.probeUrl);
      if (unreachableDetail) {
        return failed(entry.profileId, profile.name, "unreachable", unreachableDetail);
      }
    }

    return ok(entry.profileId, profile.name);
  }

  async function checkRoute(routeId: string): Promise<AgentRoutePreflightResult[]> {
    const config = deps.readDaemonConfig();
    const route = (config.agentRoutes ?? []).find((candidate) => candidate.id === routeId);
    if (!route) {
      throw new Error(`Agent route not found: ${routeId}`);
    }
    return Promise.all(route.entries.map((_entry, index) => checkEntry(route, index)));
  }

  async function checkQuota(
    usage: RouteUsageLookup,
    profile: AgentProfile,
  ): Promise<string | null> {
    let reports: UsageReportEntry[];
    try {
      reports = await usage.listReports({
        provider: profile.provider,
        accountProfileId: profile.accountProfileId ?? null,
      });
    } catch {
      // Best effort: a usage lookup failure never blocks an otherwise-usable entry.
      return null;
    }
    for (const report of reports) {
      const detail = quotaDetailFromReport(report);
      if (detail) {
        return detail;
      }
    }
    return null;
  }

  return { checkEntry, checkRoute };
}
