import type { Logger } from "pino";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import {
  resolveDaemonPeer,
  type DaemonPeer,
  type ResolvedDaemonPeer,
} from "@getpaseo/protocol/daemon-peer";
import {
  connectDaemonHost,
  parsePasswordFromHost,
  type DaemonClientType,
} from "../host-connection/connect-host.js";

const DEFAULT_CONNECT_TIMEOUT_MS = 10_000;

/**
 * The union has no value for one daemon dialing another (see the longer comment on
 * `ConnectDaemonHostOptions.clientType`), so a peer connection presents as "cli".
 */
const PEER_CLIENT_TYPE: DaemonClientType = "cli";

export class UnknownPeerError extends Error {
  constructor(
    public readonly peerId: string,
    knownPeerIds: readonly string[],
  ) {
    super(
      knownPeerIds.length > 0
        ? `Unknown peer "${peerId}". Known peers: ${knownPeerIds.join(", ")}.`
        : `Unknown peer "${peerId}". No peers are configured.`,
    );
    this.name = "UnknownPeerError";
  }
}

export interface PeerTestResult {
  peerId: string;
  serverId: string | null;
  hostname: string | null;
  version: string | null;
  latencyMs: number;
}

export interface PeerPoolOptions {
  getPeers: () => DaemonPeer[];
  clientId: string;
  appVersion: string;
  logger: Logger;
  connectTimeoutMs?: number;
}

type PeerConnectionState =
  | { status: "connecting"; target: string; promise: Promise<DaemonClient> }
  | { status: "connected"; target: string; client: DaemonClient };

/**
 * Dials other daemons this daemon peers with, over the transport the CLI already uses to dial a
 * daemon (`connectDaemonHost`). Caches one client per peer and reconnects when the cached client
 * drops or the peer's target changes. See docs/peers.md.
 */
export class PeerPool {
  private readonly getPeers: () => DaemonPeer[];
  private readonly clientId: string;
  private readonly appVersion: string;
  private readonly logger: Logger;
  private readonly connectTimeoutMs: number;
  private readonly connections = new Map<string, PeerConnectionState>();

  constructor(options: PeerPoolOptions) {
    this.getPeers = options.getPeers;
    this.clientId = options.clientId;
    this.appVersion = options.appVersion;
    this.logger = options.logger.child({ module: "peer-pool" });
    this.connectTimeoutMs = options.connectTimeoutMs ?? DEFAULT_CONNECT_TIMEOUT_MS;
  }

  list(): ResolvedDaemonPeer[] {
    return this.getPeers().map(resolveDaemonPeer);
  }

  get(peerId: string): ResolvedDaemonPeer {
    const peers = this.list();
    const peer = peers.find((candidate) => candidate.id === peerId);
    if (!peer)
      throw new UnknownPeerError(
        peerId,
        peers.map((candidate) => candidate.id),
      );
    return peer;
  }

  async connect(
    peerId: string,
  ): Promise<{ peer: ResolvedDaemonPeer; client: DaemonClient; serverId: string | null }> {
    const peer = this.get(peerId);
    const client = await this.dial(peer);
    return { peer, client, serverId: client.getLastServerInfoMessage()?.serverId ?? null };
  }

  /** Reachability check. Goes through the same cached connection `connect()` would reuse. */
  async test(peerId: string): Promise<PeerTestResult> {
    const startedAt = Date.now();
    const { peer, client } = await this.connect(peerId);
    const latencyMs = Date.now() - startedAt;
    const info = client.getLastServerInfoMessage();
    return {
      peerId: peer.id,
      serverId: info?.serverId ?? null,
      hostname: info?.hostname ?? null,
      version: info?.version ?? null,
      latencyMs,
    };
  }

  async close(): Promise<void> {
    const entries = Array.from(this.connections.values());
    this.connections.clear();
    await Promise.all(
      entries.map(async (entry) => {
        const client =
          entry.status === "connected" ? entry.client : await entry.promise.catch(() => null);
        await client?.close().catch(() => undefined);
      }),
    );
  }

  private async dial(peer: ResolvedDaemonPeer): Promise<DaemonClient> {
    const existing = this.connections.get(peer.id);
    if (existing?.target === peer.target) {
      if (existing.status === "connecting") return existing.promise;
      if (existing.client.isConnected) return existing.client;
    }
    // A dropped client, or one dialed at a target the config no longer names, is replaced; close
    // it so its socket does not outlive the entry.
    if (existing?.status === "connected") void existing.client.close().catch(() => undefined);

    const promise = this.connectPeer(peer);
    this.connections.set(peer.id, { status: "connecting", target: peer.target, promise });
    try {
      const client = await promise;
      this.connections.set(peer.id, { status: "connected", target: peer.target, client });
      return client;
    } catch (error) {
      const current = this.connections.get(peer.id);
      if (current?.status === "connecting" && current.promise === promise) {
        this.connections.delete(peer.id);
      }
      this.logger.warn({ peerId: peer.id, err: error }, "Failed to connect to peer");
      throw error;
    }
  }

  private connectPeer(peer: ResolvedDaemonPeer): Promise<DaemonClient> {
    return connectDaemonHost({
      host: peer.target,
      clientId: this.clientId,
      clientType: PEER_CLIENT_TYPE,
      appVersion: this.appVersion,
      timeoutMs: this.connectTimeoutMs,
      password: parsePasswordFromHost(peer.target),
    });
  }
}
