import { describe, expect, it, vi } from "vitest";
import type { AgentRoute } from "@getpaseo/protocol/agent-route";
import type { AgentProfile } from "@getpaseo/protocol/agent-profile";
import type { ProviderAccountProfile } from "@getpaseo/protocol/provider-accounts";
import type { UsageReportEntry } from "@getpaseo/protocol/messages";
import {
  createRoutePreflight,
  type AgentRouteDaemonConfig,
  type AgentRoutePreflightDeps,
  type RouteUsageLookup,
} from "./preflight.js";

function profile(
  overrides: Partial<AgentProfile> & { id: string; provider: string },
): AgentProfile {
  return { name: overrides.id, ...overrides };
}

function route(overrides: Partial<AgentRoute> & { entries: AgentRoute["entries"] }): AgentRoute {
  // Defaults to "cloud" so tests unrelated to privacy don't trip over the route's default
  // privacy ("local" per docs/agent-routes.md) rejecting entries that aren't marked local.
  return { id: "route", name: "Route", privacy: "cloud", ...overrides };
}

function account(
  overrides: Partial<ProviderAccountProfile> & { id: string },
): ProviderAccountProfile {
  return {
    provider: "claude",
    name: overrides.id,
    identity: { email: "dev@example.com" },
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    lastAuthenticatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function availableReport(
  overrides: Partial<UsageReportEntry["report"]> = {},
): UsageReportEntry["report"] {
  return { status: "available", windows: [], ...overrides } as UsageReportEntry["report"];
}

interface TestDepsOverrides extends Partial<AgentRoutePreflightDeps> {
  config?: AgentRouteDaemonConfig;
}

function createTestDeps(overrides: TestDepsOverrides = {}): AgentRoutePreflightDeps {
  const config: AgentRouteDaemonConfig = overrides.config ?? { agentProfiles: [], agentRoutes: [] };
  return {
    readDaemonConfig: overrides.readDaemonConfig ?? (() => config),
    providers: overrides.providers ?? {
      getProviderAvailability: async (p) => ({ provider: p, available: true, error: null }),
    },
    accounts: overrides.accounts ?? { list: () => ({ accounts: [], defaults: {} }) },
    usage: overrides.usage ?? { listReports: async () => [] },
    fetchProbe:
      overrides.fetchProbe ??
      ((async () => new Response(null, { status: 200 })) as unknown as typeof fetch),
  };
}

describe("createRoutePreflight", () => {
  it("fails profile_missing when the entry's profile is not configured", async () => {
    const deps = createTestDeps();
    const preflight = createRoutePreflight(deps);
    const r = route({ entries: [{ profileId: "ghost" }] });
    const result = await preflight.checkEntry(r, 0);
    expect(result).toEqual({
      profileId: "ghost",
      profileName: null,
      ok: false,
      reason: "profile_missing",
      detail: expect.any(String),
    });
  });

  it("fails profile_missing when the entry index is out of range", async () => {
    const deps = createTestDeps();
    const preflight = createRoutePreflight(deps);
    const r = route({ entries: [] });
    const result = await preflight.checkEntry(r, 0);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("profile_missing");
  });

  it("fails privacy on a local route when the entry is not marked local", async () => {
    const a = profile({ id: "a", provider: "claude" });
    const deps = createTestDeps({ config: { agentProfiles: [a], agentRoutes: [] } });
    const preflight = createRoutePreflight(deps);
    const r = route({ privacy: "local", entries: [{ profileId: "a" }] });
    const result = await preflight.checkEntry(r, 0);
    expect(result).toEqual({
      profileId: "a",
      profileName: "a",
      ok: false,
      reason: "privacy",
      detail: expect.any(String),
    });
  });

  it("passes privacy on a local route when the entry is marked local", async () => {
    const a = profile({ id: "a", provider: "claude" });
    const deps = createTestDeps({ config: { agentProfiles: [a], agentRoutes: [] } });
    const preflight = createRoutePreflight(deps);
    const r = route({ privacy: "local", entries: [{ profileId: "a", privacy: "local" }] });
    const result = await preflight.checkEntry(r, 0);
    expect(result.ok).toBe(true);
  });

  it("ignores privacy on a cloud route even when the entry is not marked local", async () => {
    const a = profile({ id: "a", provider: "claude" });
    const deps = createTestDeps({ config: { agentProfiles: [a], agentRoutes: [] } });
    const preflight = createRoutePreflight(deps);
    const r = route({ privacy: "cloud", entries: [{ profileId: "a" }] });
    const result = await preflight.checkEntry(r, 0);
    expect(result.ok).toBe(true);
  });

  it("fails provider_unavailable when the provider reports unavailable", async () => {
    const a = profile({ id: "a", provider: "claude" });
    const deps = createTestDeps({
      config: { agentProfiles: [a], agentRoutes: [] },
      providers: {
        getProviderAvailability: async () => ({
          provider: "claude",
          available: false,
          error: "not installed",
        }),
      },
    });
    const preflight = createRoutePreflight(deps);
    const result = await preflight.checkEntry(route({ entries: [{ profileId: "a" }] }), 0);
    expect(result).toEqual({
      profileId: "a",
      profileName: "a",
      ok: false,
      reason: "provider_unavailable",
      detail: "not installed",
    });
  });

  it("fails provider_unavailable when the availability check throws", async () => {
    const a = profile({ id: "a", provider: "claude" });
    const deps = createTestDeps({
      config: { agentProfiles: [a], agentRoutes: [] },
      providers: {
        getProviderAvailability: async () => {
          throw new Error("boom");
        },
      },
    });
    const preflight = createRoutePreflight(deps);
    const result = await preflight.checkEntry(route({ entries: [{ profileId: "a" }] }), 0);
    expect(result.ok).toBe(false);
    expect(result.reason).toBe("provider_unavailable");
  });

  it("fails signed_out when the pinned account does not exist", async () => {
    const a = profile({ id: "a", provider: "claude", accountProfileId: "pac_missing" });
    const deps = createTestDeps({ config: { agentProfiles: [a], agentRoutes: [] } });
    const preflight = createRoutePreflight(deps);
    const result = await preflight.checkEntry(route({ entries: [{ profileId: "a" }] }), 0);
    expect(result.reason).toBe("signed_out");
  });

  it("fails signed_out when the pinned account exists but never completed sign-in", async () => {
    const a = profile({ id: "a", provider: "claude", accountProfileId: "pac_1" });
    const unauthenticated = account({ id: "pac_1", identity: null, lastAuthenticatedAt: null });
    const deps = createTestDeps({
      config: { agentProfiles: [a], agentRoutes: [] },
      accounts: { list: () => ({ accounts: [unauthenticated], defaults: {} }) },
    });
    const preflight = createRoutePreflight(deps);
    const result = await preflight.checkEntry(route({ entries: [{ profileId: "a" }] }), 0);
    expect(result.reason).toBe("signed_out");
  });

  it("passes signed_out when the pinned account is signed in", async () => {
    const a = profile({ id: "a", provider: "claude", accountProfileId: "pac_1" });
    const signedIn = account({ id: "pac_1" });
    const deps = createTestDeps({
      config: { agentProfiles: [a], agentRoutes: [] },
      accounts: { list: () => ({ accounts: [signedIn], defaults: {} }) },
    });
    const preflight = createRoutePreflight(deps);
    const result = await preflight.checkEntry(route({ entries: [{ profileId: "a" }] }), 0);
    expect(result.ok).toBe(true);
  });

  it("skips the signed_out check for a profile with no pinned account", async () => {
    const a = profile({ id: "a", provider: "claude" });
    const deps = createTestDeps({ config: { agentProfiles: [a], agentRoutes: [] } });
    const preflight = createRoutePreflight(deps);
    const result = await preflight.checkEntry(route({ entries: [{ profileId: "a" }] }), 0);
    expect(result.ok).toBe(true);
  });

  it("fails quota when a usage window is fully used", async () => {
    const a = profile({ id: "a", provider: "claude" });
    const usage: RouteUsageLookup = {
      listReports: async () => [
        {
          id: "claude:1",
          account: {},
          fetchedAt: "2026-01-01T00:00:00.000Z",
          sourceId: "claude",
          sourceLabel: "Claude",
          report: availableReport({ windows: [{ id: "5h", label: "5h window", usedPct: 100 }] }),
        },
      ],
    };
    const deps = createTestDeps({ config: { agentProfiles: [a], agentRoutes: [] }, usage });
    const preflight = createRoutePreflight(deps);
    const result = await preflight.checkEntry(route({ entries: [{ profileId: "a" }] }), 0);
    expect(result.reason).toBe("quota");
  });

  it("fails quota when a usage window has no percent remaining", async () => {
    const a = profile({ id: "a", provider: "claude" });
    const usage: RouteUsageLookup = {
      listReports: async () => [
        {
          id: "claude:1",
          account: {},
          fetchedAt: "2026-01-01T00:00:00.000Z",
          sourceId: "claude",
          sourceLabel: "Claude",
          report: availableReport({ windows: [{ id: "5h", label: "5h window", remainingPct: 0 }] }),
        },
      ],
    };
    const deps = createTestDeps({ config: { agentProfiles: [a], agentRoutes: [] }, usage });
    const preflight = createRoutePreflight(deps);
    const result = await preflight.checkEntry(route({ entries: [{ profileId: "a" }] }), 0);
    expect(result.reason).toBe("quota");
  });

  it("fails quota when a balance has nothing remaining", async () => {
    const a = profile({ id: "a", provider: "claude" });
    const usage: RouteUsageLookup = {
      listReports: async () => [
        {
          id: "claude:1",
          account: {},
          fetchedAt: "2026-01-01T00:00:00.000Z",
          sourceId: "claude",
          sourceLabel: "Claude",
          report: availableReport({
            windows: [],
            balances: [{ id: "credits", label: "Credits", remaining: 0, unit: "credits" }],
          }),
        },
      ],
    };
    const deps = createTestDeps({ config: { agentProfiles: [a], agentRoutes: [] }, usage });
    const preflight = createRoutePreflight(deps);
    const result = await preflight.checkEntry(route({ entries: [{ profileId: "a" }] }), 0);
    expect(result.reason).toBe("quota");
  });

  it("treats no usage report as usable", async () => {
    const a = profile({ id: "a", provider: "claude" });
    const deps = createTestDeps({ config: { agentProfiles: [a], agentRoutes: [] } });
    const preflight = createRoutePreflight(deps);
    const result = await preflight.checkEntry(route({ entries: [{ profileId: "a" }] }), 0);
    expect(result.ok).toBe(true);
  });

  it("treats a usage lookup failure as usable", async () => {
    const a = profile({ id: "a", provider: "claude" });
    const usage: RouteUsageLookup = {
      listReports: async () => {
        throw new Error("offline");
      },
    };
    const deps = createTestDeps({ config: { agentProfiles: [a], agentRoutes: [] }, usage });
    const preflight = createRoutePreflight(deps);
    const result = await preflight.checkEntry(route({ entries: [{ profileId: "a" }] }), 0);
    expect(result.ok).toBe(true);
  });

  it("passes quota when a report has a window with capacity left", async () => {
    const a = profile({ id: "a", provider: "claude" });
    const usage: RouteUsageLookup = {
      listReports: async () => [
        {
          id: "claude:1",
          account: {},
          fetchedAt: "2026-01-01T00:00:00.000Z",
          sourceId: "claude",
          sourceLabel: "Claude",
          report: availableReport({ windows: [{ id: "5h", label: "5h window", usedPct: 40 }] }),
        },
      ],
    };
    const deps = createTestDeps({ config: { agentProfiles: [a], agentRoutes: [] }, usage });
    const preflight = createRoutePreflight(deps);
    const result = await preflight.checkEntry(route({ entries: [{ profileId: "a" }] }), 0);
    expect(result.ok).toBe(true);
  });

  it("fails unreachable when the probe does not answer 2xx", async () => {
    const a = profile({ id: "a", provider: "claude" });
    const deps = createTestDeps({
      config: { agentProfiles: [a], agentRoutes: [] },
      fetchProbe: (async () => new Response(null, { status: 500 })) as unknown as typeof fetch,
    });
    const preflight = createRoutePreflight(deps);
    const result = await preflight.checkEntry(
      route({ entries: [{ profileId: "a", probeUrl: "http://localhost:8000/v1" }] }),
      0,
    );
    expect(result.reason).toBe("unreachable");
  });

  it("fails unreachable when the probe request throws", async () => {
    const a = profile({ id: "a", provider: "claude" });
    const deps = createTestDeps({
      config: { agentProfiles: [a], agentRoutes: [] },
      fetchProbe: (async () => {
        throw new Error("ECONNREFUSED");
      }) as unknown as typeof fetch,
    });
    const preflight = createRoutePreflight(deps);
    const result = await preflight.checkEntry(
      route({ entries: [{ profileId: "a", probeUrl: "http://localhost:8000/v1" }] }),
      0,
    );
    expect(result.reason).toBe("unreachable");
  });

  it("probes {probeUrl}/models with GET", async () => {
    const a = profile({ id: "a", provider: "claude" });
    const fetchProbe = vi.fn(async () => new Response(null, { status: 200 }));
    const deps = createTestDeps({
      config: { agentProfiles: [a], agentRoutes: [] },
      fetchProbe: fetchProbe as unknown as typeof fetch,
    });
    const preflight = createRoutePreflight(deps);
    await preflight.checkEntry(
      route({ entries: [{ profileId: "a", probeUrl: "http://spark:8000/v1" }] }),
      0,
    );
    expect(fetchProbe).toHaveBeenCalledWith(
      "http://spark:8000/v1/models",
      expect.objectContaining({ method: "GET" }),
    );
  });

  it("skips the probe check for an entry with no probeUrl", async () => {
    const a = profile({ id: "a", provider: "claude" });
    const fetchProbe = vi.fn(async () => new Response(null, { status: 500 }));
    const deps = createTestDeps({
      config: { agentProfiles: [a], agentRoutes: [] },
      fetchProbe: fetchProbe as unknown as typeof fetch,
    });
    const preflight = createRoutePreflight(deps);
    const result = await preflight.checkEntry(route({ entries: [{ profileId: "a" }] }), 0);
    expect(result.ok).toBe(true);
    expect(fetchProbe).not.toHaveBeenCalled();
  });

  it("passes every check for a fully usable entry", async () => {
    const a = profile({ id: "a", provider: "claude" });
    const deps = createTestDeps({ config: { agentProfiles: [a], agentRoutes: [] } });
    const preflight = createRoutePreflight(deps);
    const result = await preflight.checkEntry(route({ entries: [{ profileId: "a" }] }), 0);
    expect(result).toEqual({
      profileId: "a",
      profileName: "a",
      ok: true,
      reason: null,
      detail: null,
    });
  });

  it("reports the earliest failing check when an entry fails more than one", async () => {
    // Not marked local (privacy) AND the provider is unavailable: privacy is earlier in the
    // check order and must win.
    const a = profile({ id: "a", provider: "claude" });
    const deps = createTestDeps({
      config: { agentProfiles: [a], agentRoutes: [] },
      providers: {
        getProviderAvailability: async () => ({
          provider: "claude",
          available: false,
          error: "down",
        }),
      },
    });
    const preflight = createRoutePreflight(deps);
    const result = await preflight.checkEntry(
      route({ privacy: "local", entries: [{ profileId: "a" }] }),
      0,
    );
    expect(result.reason).toBe("privacy");
  });

  it("checkRoute runs every entry of a route and reports each", async () => {
    const a = profile({ id: "a", provider: "claude" });
    const b = profile({ id: "b", provider: "codex" });
    const deps = createTestDeps({
      config: {
        agentProfiles: [a, b],
        agentRoutes: [route({ id: "r1", entries: [{ profileId: "a" }, { profileId: "ghost" }] })],
      },
    });
    const preflight = createRoutePreflight(deps);
    const results = await preflight.checkRoute("r1");
    expect(results).toEqual([
      { profileId: "a", profileName: "a", ok: true, reason: null, detail: null },
      {
        profileId: "ghost",
        profileName: null,
        ok: false,
        reason: "profile_missing",
        detail: expect.any(String),
      },
    ]);
  });

  it("checkRoute throws for an unknown route id", async () => {
    const deps = createTestDeps();
    const preflight = createRoutePreflight(deps);
    await expect(preflight.checkRoute("missing")).rejects.toThrow("missing");
  });
});
