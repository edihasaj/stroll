import { z } from "zod";

/**
 * A daemon the local daemon can dial to spawn agents on another computer. See
 * docs/proposals/cross-host-subagents.md and docs/peers.md.
 */
export const DaemonPeerSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9][a-z0-9-]{0,62}$/),
    name: z.string().optional(),
    /** Any form `paseo --host` accepts: `ssh://`, `tcp://host:port[?password=…]`, or a pairing URL. */
    target: z.string().min(1),
    /** Defaults to "local": a peer is one of your machines unless marked "cloud". */
    privacy: z.enum(["local", "cloud"]).optional(),
  })
  .passthrough();
export type DaemonPeer = z.infer<typeof DaemonPeerSchema>;

export interface ResolvedDaemonPeer {
  id: string;
  name: string;
  target: string;
  privacy: "local" | "cloud";
}

export function resolveDaemonPeer(peer: DaemonPeer): ResolvedDaemonPeer {
  return {
    id: peer.id,
    name: peer.name ?? peer.id,
    target: peer.target,
    privacy: peer.privacy ?? "local",
  };
}
