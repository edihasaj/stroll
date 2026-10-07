import { Command } from "commander";
import { resolveDaemonPeer } from "@getpaseo/protocol/daemon-peer";
import { connectDaemonHost, parsePasswordFromHost } from "@getpaseo/server/host-connection";
import { addLocalDaemonOptions } from "../../utils/command-options.js";
import {
  withOutput,
  type CommandOptions,
  type SingleResult,
  type OutputSchema,
} from "../../output/index.js";
import { getOrCreateCliClientId } from "../../utils/client-id.js";
import { resolveCliVersion } from "../../version.js";
import { homeOf, listPeers } from "./shared.js";

const PEER_TEST_TIMEOUT_MS = 10_000;

export interface PeerTestResult {
  peerId: string;
  serverId: string | null;
  hostname: string | null;
  version: string | null;
  latencyMs: number;
}

export const peerTestSchema: OutputSchema<PeerTestResult> = {
  idField: "peerId",
  columns: [],
  renderHuman: (result) => {
    if (result.type !== "single") return "";
    const { peerId, serverId, hostname, version, latencyMs } = result.data;
    return [
      `peerId: ${peerId}`,
      `serverId: ${serverId ?? "unknown"}`,
      `hostname: ${hostname ?? "unknown"}`,
      `version: ${version ?? "unknown"}`,
      `latencyMs: ${latencyMs}`,
    ].join("\n");
  },
};

export async function runPeerTestCommand(
  id: string,
  options: CommandOptions,
  _command: Command,
): Promise<SingleResult<PeerTestResult>> {
  const home = homeOf(options);
  const peers = listPeers(home);
  const peer = peers.find((candidate) => candidate.id === id);
  if (!peer)
    throw {
      code: "UNKNOWN_PEER",
      message: `Unknown peer "${id}". Known peers: ${peers.map((candidate) => candidate.id).join(", ") || "none"}.`,
    };
  const resolved = resolveDaemonPeer(peer);
  const clientId = await getOrCreateCliClientId(home);

  const startedAt = Date.now();
  let client;
  try {
    client = await connectDaemonHost({
      host: resolved.target,
      clientId,
      clientType: "cli",
      appVersion: resolveCliVersion(),
      timeoutMs: PEER_TEST_TIMEOUT_MS,
      password: parsePasswordFromHost(resolved.target),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw { code: "PEER_UNREACHABLE", message: `Cannot reach peer "${id}": ${message}` };
  }

  try {
    const latencyMs = Date.now() - startedAt;
    const info = client.getLastServerInfoMessage();
    return {
      type: "single",
      data: {
        peerId: id,
        serverId: info?.serverId ?? null,
        hostname: info?.hostname ?? null,
        version: info?.version ?? null,
        latencyMs,
      },
      schema: peerTestSchema,
    };
  } finally {
    await client.close().catch(() => {});
  }
}

export function peerTestCommand(): Command {
  return addLocalDaemonOptions(
    new Command("test")
      .description("Dial a peer and report reachability")
      .argument("<id>", "Peer id"),
  ).action(withOutput(runPeerTestCommand));
}
