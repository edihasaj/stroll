import type { DaemonPeer } from "@getpaseo/protocol/daemon-peer";
import { editPersistedConfig, readPersistedConfig } from "@getpaseo/server/configuration";
import { applySaved } from "../daemon/config.js";
import type { CommandOptions } from "../../output/index.js";

export function homeOf(options: CommandOptions): string {
  if (options.daemonTarget.kind !== "instance") throw new Error("Peer management requires --home");
  return options.daemonTarget.home;
}

export function listPeers(home: string): DaemonPeer[] {
  return readPersistedConfig(home, { defaultsIfMissing: true }).daemon?.peers ?? [];
}

/** Replaces the entry with a matching id, or appends when there is none. */
export function upsertPeer(peers: DaemonPeer[], next: DaemonPeer): DaemonPeer[] {
  const index = peers.findIndex((peer) => peer.id === next.id);
  if (index === -1) return [...peers, next];
  return peers.map((peer, candidateIndex) => (candidateIndex === index ? next : peer));
}

export function removePeer(peers: DaemonPeer[], id: string): DaemonPeer[] {
  return peers.filter((peer) => peer.id !== id);
}

/** Persists the full peer list, then applies it to a running daemon (see daemon/config.ts). */
export function savePeers(home: string, options: CommandOptions, peers: DaemonPeer[]) {
  editPersistedConfig(home, "daemon.peers", { value: peers });
  return applySaved(home, options);
}

/**
 * A target may carry a password (`tcp://host:port?password=…`). `daemon config get` redacts
 * keys literally named `password`; a password embedded inside a target string is not one of
 * those keys, so `peer ls` redacts it here instead.
 */
export function redactPeerTarget(target: string): string {
  try {
    const url = new URL(target);
    // Unbracketed, matching daemon-target.ts's describeDaemonTarget: a bracketed value would
    // URL-encode to %5B...%5D once substituted back into the query string.
    if (url.password) url.password = "REDACTED";
    if (url.searchParams.has("password")) url.searchParams.set("password", "REDACTED");
    return url.toString();
  } catch {
    return target.replace(/([?&]password=)[^&]*/gi, "$1REDACTED");
  }
}
