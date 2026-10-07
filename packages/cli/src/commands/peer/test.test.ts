import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runPeerTestCommand } from "./test.js";

describe("peer test", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  });

  test("names the peer id in the error when it is not configured", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "paseo-peer-test-"));
    tempDirs.push(home);
    writeFileSync(
      path.join(home, "config.json"),
      JSON.stringify({ version: 1, daemon: { peers: [{ id: "studio", target: "tcp://a:6767" }] } }),
    );

    await expect(
      runPeerTestCommand("missing", { daemonTarget: { kind: "instance", home } }, {} as never),
    ).rejects.toMatchObject({ code: "UNKNOWN_PEER", message: expect.stringContaining("missing") });
  });
});
