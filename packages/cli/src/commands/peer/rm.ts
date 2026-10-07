import { Command } from "commander";
import { addLocalDaemonOptions } from "../../utils/command-options.js";
import { withOutput, type CommandOptions } from "../../output/index.js";
import { homeOf, listPeers, removePeer, savePeers } from "./shared.js";

export async function runPeerRmCommand(id: string, options: CommandOptions, _command: Command) {
  const home = homeOf(options);
  return savePeers(home, options, removePeer(listPeers(home), id));
}

export function peerRmCommand(): Command {
  return addLocalDaemonOptions(
    new Command("rm").description("Remove a peer daemon").argument("<id>", "Peer id"),
  ).action(withOutput(runPeerRmCommand));
}
