import type { Logger } from "pino";
import { withTimeout } from "../../utils/promise-timeout.js";
import { getHostName } from "../host-name.js";
import type { PeerPool } from "./peer-pool.js";

/** Kept well under the pool's own connect timeout so one unreachable peer can't stall the list. */
export const DEFAULT_PEER_TEST_TIMEOUT_MS = 5_000;

export interface ListComputersPeerSummary {
  id: string;
  name: string;
  privacy: "local" | "cloud";
  test?: { reachable: boolean; latencyMs?: number; error?: string };
}

export interface ListComputersResult {
  thisComputer: { serverId: string; hostname: string | null };
  peers: ListComputersPeerSummary[];
}

async function testPeer(
  peerPool: Pick<PeerPool, "test">,
  peerId: string,
  timeoutMs: number,
): Promise<ListComputersPeerSummary["test"]> {
  try {
    const result = await withTimeout(
      peerPool.test(peerId),
      timeoutMs,
      `Timed out testing peer "${peerId}" after ${timeoutMs}ms`,
    );
    return { reachable: true, latencyMs: result.latencyMs };
  } catch (error) {
    return { reachable: false, error: error instanceof Error ? error.message : String(error) };
  }
}

async function summarizePeer(
  peerPool: Pick<PeerPool, "test">,
  peer: Pick<ListComputersPeerSummary, "id" | "name" | "privacy">,
  shouldTest: boolean,
  timeoutMs: number,
): Promise<ListComputersPeerSummary> {
  const summary: ListComputersPeerSummary = {
    id: peer.id,
    name: peer.name,
    privacy: peer.privacy,
  };
  if (shouldTest) {
    summary.test = await testPeer(peerPool, peer.id, timeoutMs);
  }
  return summary;
}

/** Builds the `list_computers` tool's result: this daemon plus every configured peer (docs/peers.md). */
export async function buildListComputersResult(params: {
  peerPool: Pick<PeerPool, "list" | "test">;
  serverId: string;
  test: boolean;
  logger: Logger;
  /** Overridable so tests don't wait out the real timeout. */
  testTimeoutMs?: number;
}): Promise<ListComputersResult> {
  const testTimeoutMs = params.testTimeoutMs ?? DEFAULT_PEER_TEST_TIMEOUT_MS;
  const peers = await Promise.all(
    params.peerPool
      .list()
      .map((peer) => summarizePeer(params.peerPool, peer, params.test, testTimeoutMs)),
  );

  let hostname: string | null = null;
  try {
    hostname = getHostName();
  } catch (error) {
    params.logger.warn({ err: error }, "Failed to resolve this computer's hostname");
  }

  return { thisComputer: { serverId: params.serverId, hostname }, peers };
}
