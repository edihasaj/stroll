import { Command } from "commander";
import { DaemonPeerSchema } from "@getpaseo/protocol/daemon-peer";
import { addLocalDaemonOptions } from "../../utils/command-options.js";
import { withOutput, type CommandOptions } from "../../output/index.js";
import { homeOf, listPeers, savePeers, upsertPeer } from "./shared.js";

export interface PeerAddOptions extends CommandOptions {
  name?: string;
  privacy?: string;
}

export async function runPeerAddCommand(
  id: string,
  target: string,
  options: PeerAddOptions,
  _command: Command,
) {
  const home = homeOf(options);
  const peer = DaemonPeerSchema.parse({
    id,
    target,
    ...(options.name ? { name: options.name } : {}),
    ...(options.privacy ? { privacy: options.privacy } : {}),
  });
  return savePeers(home, options, upsertPeer(listPeers(home), peer));
}

export function peerAddCommand(): Command {
  return addLocalDaemonOptions(
    new Command("add")
      .description("Add or update a peer daemon this one can dial")
      .argument("<id>", "Peer id (lowercase letters, digits, hyphens)")
      .argument("<target>", "ssh://, tcp://host:port[?ssl=true&password=…], or a pairing URL")
      .option("--name <name>", "Display name for the peer")
      .option("--privacy <privacy>", "local (default) or cloud"),
  ).action(withOutput(runPeerAddCommand));
}
