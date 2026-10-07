import { Command } from "commander";
import { resolveDaemonPeer } from "@getpaseo/protocol/daemon-peer";
import { addLocalDaemonOptions } from "../../utils/command-options.js";
import {
  withOutput,
  type CommandOptions,
  type ListResult,
  type OutputSchema,
} from "../../output/index.js";
import { homeOf, listPeers, redactPeerTarget } from "./shared.js";

export interface PeerListItem {
  id: string;
  name: string;
  target: string;
  privacy: "local" | "cloud";
}

export const peerLsSchema: OutputSchema<PeerListItem> = {
  idField: "id",
  columns: [
    { header: "ID", field: "id", width: 16 },
    { header: "NAME", field: "name", width: 20 },
    { header: "TARGET", field: "target", width: 40 },
    { header: "PRIVACY", field: "privacy", width: 8 },
  ],
};

export async function runPeerLsCommand(
  options: CommandOptions,
  _command: Command,
): Promise<ListResult<PeerListItem>> {
  const peers = listPeers(homeOf(options)).map(resolveDaemonPeer);
  return {
    type: "list",
    data: peers.map((peer) => ({
      id: peer.id,
      name: peer.name,
      target: redactPeerTarget(peer.target),
      privacy: peer.privacy,
    })),
    schema: peerLsSchema,
  };
}

export function peerLsCommand(): Command {
  return addLocalDaemonOptions(
    new Command("ls").description("List configured peer daemons"),
  ).action(withOutput(runPeerLsCommand));
}
