import pino from "pino";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { DaemonPeer } from "@getpaseo/protocol/daemon-peer";
import { createTestPaseoDaemon, type TestPaseoDaemon } from "../test-utils/paseo-daemon.js";
import { PeerPool, UnknownPeerError } from "./peer-pool.js";

describe("PeerPool", () => {
  let remote: TestPaseoDaemon;
  let peers: DaemonPeer[];
  let pool: PeerPool;

  beforeAll(async () => {
    remote = await createTestPaseoDaemon();
    peers = [{ id: "remote", name: "Remote", target: `127.0.0.1:${remote.port}` }];
    pool = new PeerPool({
      getPeers: () => peers,
      clientId: "peer-pool-test",
      appVersion: "0.1.70",
      logger: pino({ level: "silent" }),
    });
  });

  afterAll(async () => {
    await pool.close();
    await remote.close();
  });

  it("connects to a configured peer and reuses the cached client on a second connect", async () => {
    const first = await pool.connect("remote");
    expect(first.peer).toEqual({
      id: "remote",
      name: "Remote",
      target: peers[0]?.target,
      privacy: "local",
    });
    expect(first.serverId).toBe(remote.daemon.getServerId());

    const second = await pool.connect("remote");
    expect(second.client).toBe(first.client);
  });

  it("throws UnknownPeerError for an id that is not configured", async () => {
    await expect(pool.connect("does-not-exist")).rejects.toThrow(UnknownPeerError);
    await expect(pool.connect("does-not-exist")).rejects.toThrow(/does-not-exist/);
  });

  it("reports reachability and the peer's server info through test()", async () => {
    const result = await pool.test("remote");
    expect(result).toMatchObject({
      peerId: "remote",
      serverId: remote.daemon.getServerId(),
    });
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});
