import { useMemo } from "react";
import { useHosts } from "@/runtime/host-runtime";
import { useLocalDaemonServerId, useLocalDaemonServerIdState } from "@/hooks/use-is-local-daemon";
import { selectHostBadges, type HostBadgeModel } from "@/hosts/appearance";
import { friendlyHostDisplayName } from "@/hosts/display-name";

/**
 * Every host's badge, resolved from the three things that decide one: the host registry, which
 * host is local, and each host's own appearance. `enabled` is the caller's own "off" — a surface
 * that has its own reason to hide badges passes false rather than filtering the result, so the
 * per-host setting stays the only thing that decides name vs icon vs hidden.
 */
export function useHostBadges({
  enabled,
}: {
  enabled: boolean;
}): ReadonlyMap<string, HostBadgeModel> {
  const hosts = useHosts();
  const localServerId = useLocalDaemonServerId();
  const localDaemon = useLocalDaemonServerIdState();
  return useMemo(
    () =>
      selectHostBadges({
        hosts,
        localServerId,
        localHostResolutionPending: localDaemon.status !== "resolved",
        enabled,
      }),
    [hosts, localDaemon.status, localServerId, enabled],
  );
}

/**
 * Every connected host's friendly display name, keyed by serverId — the plain-text counterpart
 * to {@link useHostBadges} for surfaces that name a host inline (e.g. "· MacBook") rather than
 * drawing a badge, such as a cross-host subagent row (docs/peers.md "In the app").
 */
export function useHostDisplayNames(): ReadonlyMap<string, string> {
  const hosts = useHosts();
  return useMemo(() => {
    const names = new Map<string, string>();
    for (const host of hosts) {
      names.set(host.serverId, friendlyHostDisplayName(host));
    }
    return names;
  }, [hosts]);
}
