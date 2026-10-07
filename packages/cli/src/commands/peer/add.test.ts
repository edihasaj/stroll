import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { readPersistedConfig } from "@getpaseo/server/configuration";
import { runPeerAddCommand } from "./add.js";

describe("peer add", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  });

  test("saves a new peer and reports it as saved but not applied without a running daemon", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "paseo-peer-add-"));
    tempDirs.push(home);

    const result = await runPeerAddCommand(
      "studio",
      "ssh://edi@edis-mac-studio",
      { daemonTarget: { kind: "instance", home }, name: "Mac Studio" },
      {} as never,
    );

    expect(result.data).toMatchObject({ action: "saved", applied: false });
    expect(readPersistedConfig(home).daemon?.peers).toEqual([
      { id: "studio", name: "Mac Studio", target: "ssh://edi@edis-mac-studio" },
    ]);
  });

  test("rejects an invalid peer id before touching the config file", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "paseo-peer-add-"));
    tempDirs.push(home);

    await expect(
      runPeerAddCommand(
        "Not Valid",
        "tcp://host:6767",
        { daemonTarget: { kind: "instance", home } },
        {} as never,
      ),
    ).rejects.toThrow();
    expect(readPersistedConfig(home).daemon?.peers).toBeUndefined();
  });

  test("upserts by id instead of duplicating an entry", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "paseo-peer-add-"));
    tempDirs.push(home);

    await runPeerAddCommand(
      "studio",
      "ssh://edi@edis-mac-studio",
      { daemonTarget: { kind: "instance", home } },
      {} as never,
    );
    await runPeerAddCommand(
      "studio",
      "tcp://100.64.0.5:6767",
      { daemonTarget: { kind: "instance", home }, privacy: "local" },
      {} as never,
    );

    expect(readPersistedConfig(home).daemon?.peers).toEqual([
      { id: "studio", target: "tcp://100.64.0.5:6767", privacy: "local" },
    ]);
  });
});
