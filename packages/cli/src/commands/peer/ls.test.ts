import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { runPeerLsCommand } from "./ls.js";

describe("peer ls", () => {
  const tempDirs: string[] = [];

  afterEach(() => {
    for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  });

  test("lists configured peers with a redacted target", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "paseo-peer-ls-"));
    tempDirs.push(home);
    writeFileSync(
      path.join(home, "config.json"),
      JSON.stringify({
        version: 1,
        daemon: {
          peers: [
            { id: "studio", name: "Mac Studio", target: "ssh://edi@edis-mac-studio" },
            { id: "macbook", target: "tcp://100.64.0.12:6767?password=secret", privacy: "cloud" },
          ],
        },
      }),
    );

    const result = await runPeerLsCommand(
      { daemonTarget: { kind: "instance", home } },
      {} as never,
    );

    expect(result.data).toEqual([
      { id: "studio", name: "Mac Studio", target: "ssh://edi@edis-mac-studio", privacy: "local" },
      {
        id: "macbook",
        name: "macbook",
        target: "tcp://100.64.0.12:6767?password=REDACTED",
        privacy: "cloud",
      },
    ]);
    expect(JSON.stringify(result.data)).not.toContain("secret");
  });

  test("returns an empty list when no peers are configured", async () => {
    const home = mkdtempSync(path.join(tmpdir(), "paseo-peer-ls-"));
    tempDirs.push(home);

    const result = await runPeerLsCommand(
      { daemonTarget: { kind: "instance", home } },
      {} as never,
    );

    expect(result.data).toEqual([]);
  });
});
