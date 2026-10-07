import pino from "pino";
import { describe, expect, it } from "vitest";
import type { ResolvedDaemonPeer } from "@getpaseo/protocol/daemon-peer";
import { buildListComputersResult } from "./list-computers.js";
import type { PeerTestResult } from "./peer-pool.js";

const silentLogger = pino({ level: "silent" });

const PEERS: ResolvedDaemonPeer[] = [
  { id: "studio", name: "Mac Studio", target: "ssh://edi@studio", privacy: "local" },
  { id: "spark-a", name: "Spark A", target: "tcp://spark-a:6767", privacy: "cloud" },
];

describe("buildListComputersResult", () => {
  it("lists this computer and every configured peer without testing by default", async () => {
    const result = await buildListComputersResult({
      peerPool: {
        list: () => PEERS,
        test: () => {
          throw new Error("should not be called");
        },
      },
      serverId: "server-a",
      test: false,
      logger: silentLogger,
    });

    expect(result.thisComputer.serverId).toBe("server-a");
    expect(result.peers).toEqual([
      { id: "studio", name: "Mac Studio", privacy: "local" },
      { id: "spark-a", name: "Spark A", privacy: "cloud" },
    ]);
  });

  it("reports reachable and latency per peer when test is requested", async () => {
    const result = await buildListComputersResult({
      peerPool: {
        list: () => PEERS,
        test: async (peerId: string): Promise<PeerTestResult> => {
          if (peerId === "studio") {
            return {
              peerId,
              serverId: "server-studio",
              hostname: "studio",
              version: "0.1.70",
              latencyMs: 12,
            };
          }
          throw new Error("ECONNREFUSED");
        },
      },
      serverId: "server-a",
      test: true,
      logger: silentLogger,
    });

    expect(result.peers).toEqual([
      {
        id: "studio",
        name: "Mac Studio",
        privacy: "local",
        test: { reachable: true, latencyMs: 12 },
      },
      {
        id: "spark-a",
        name: "Spark A",
        privacy: "cloud",
        test: { reachable: false, error: "ECONNREFUSED" },
      },
    ]);
  });

  it("times out a peer test instead of hanging on an unresponsive peer", async () => {
    const result = await buildListComputersResult({
      peerPool: {
        list: () => [PEERS[0]!],
        test: () => new Promise<PeerTestResult>(() => {}),
      },
      serverId: "server-a",
      test: true,
      testTimeoutMs: 10,
      logger: silentLogger,
    });

    expect(result.peers[0]?.test?.reachable).toBe(false);
    expect(result.peers[0]?.test?.error).toMatch(/Timed out/);
  });
});
