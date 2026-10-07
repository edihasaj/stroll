import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { readPersistedConfig } from "@getpaseo/server/configuration";
import { runPeerRmCommand } from "./rm.js";

describe("peer rm", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  });

  test("removes only the peer with a matching id", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "paseo-peer-rm-"));
    tempDirs.push(home);
    writeFileSync(
      path.join(home, "config.json"),
      JSON.stringify({
        version: 1,
        daemon: {
          peers: [
            { id: "studio", target: "ssh://edi@edis-mac-studio" },
            { id: "macbook", target: "tcp://100.64.0.12:6767" },
          ],
        },
      }),
    );

    const result = await runPeerRmCommand(
      "studio",
      { daemonTarget: { kind: "instance", home } },
      {} as never,
    );

    expect(result.data).toMatchObject({ action: "saved", applied: false });
    expect(readPersistedConfig(home).daemon?.peers).toEqual([
      { id: "macbook", target: "tcp://100.64.0.12:6767" },
    ]);
  });

  test("is a no-op when the id is not configured", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "paseo-peer-rm-"));
    tempDirs.push(home);
    writeFileSync(
      path.join(home, "config.json"),
      JSON.stringify({ version: 1, daemon: { peers: [{ id: "studio", target: "tcp://a:6767" }] } }),
    );

    await runPeerRmCommand("missing", { daemonTarget: { kind: "instance", home } }, {} as never);

    expect(readPersistedConfig(home).daemon?.peers).toEqual([
      { id: "studio", target: "tcp://a:6767" },
    ]);
  });
});
