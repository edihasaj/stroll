import { Command } from "commander";
import { peerAddCommand } from "./add.js";
import { peerRmCommand } from "./rm.js";
import { peerLsCommand } from "./ls.js";
import { peerTestCommand } from "./test.js";

export function createPeerCommand(): Command {
  const peer = new Command("peer").description(
    "Manage other daemons this one can dial to spawn agents on another computer",
  );
  for (const command of [peerAddCommand(), peerRmCommand(), peerLsCommand(), peerTestCommand()])
    peer.addCommand(command);
  return peer;
}
