import os from "node:os";
import path from "node:path";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { RemoteSubagentRegistry, type RemoteSubagentRecord } from "./remote-subagent-registry.js";

function record(overrides: Partial<RemoteSubagentRecord> = {}): RemoteSubagentRecord {
  return {
    childAgentId: "child-1",
    peerId: "studio",
    parentAgentId: "parent-1",
    title: "Fix the thing",
    createdAt: "2026-01-01T00:00:00.000Z",
    notifyOnFinish: true,
    ...overrides,
  };
}

describe("RemoteSubagentRegistry", () => {
  let dir: string;
  let filePath: string;

  beforeEach(async () => {
    dir = await mkdtemp(path.join(os.tmpdir(), "remote-subagent-registry-"));
    filePath = path.join(dir, "remote-subagents.json");
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it("starts empty when no file exists yet", async () => {
    const registry = new RemoteSubagentRegistry(filePath);
    expect(await registry.list()).toEqual([]);
    expect(await registry.get("child-1")).toBeNull();
  });

  it("adds a record and finds it by child agent id", async () => {
    const registry = new RemoteSubagentRegistry(filePath);
    await registry.add(record());

    expect(await registry.get("child-1")).toEqual(record());
    expect(await registry.list()).toEqual([record()]);
  });

  it("persists records atomically so a fresh registry reloads them", async () => {
    const registry = new RemoteSubagentRegistry(filePath);
    await registry.add(record());
    await registry.add(record({ childAgentId: "child-2", title: "Second task" }));

    const reloaded = new RemoteSubagentRegistry(filePath);
    const records = await reloaded.list();
    expect(records).toHaveLength(2);
    expect(records.map((r) => r.childAgentId).sort()).toEqual(["child-1", "child-2"]);

    const onDisk = JSON.parse(await readFile(filePath, "utf8"));
    expect(onDisk).toHaveLength(2);
  });

  it("marks a record finished without touching others", async () => {
    const registry = new RemoteSubagentRegistry(filePath);
    await registry.add(record());
    await registry.add(record({ childAgentId: "child-2" }));

    await registry.markFinished("child-1", "2026-01-01T01:00:00.000Z");

    expect(await registry.get("child-1")).toEqual(
      record({ finishedAt: "2026-01-01T01:00:00.000Z" }),
    );
    expect(await registry.get("child-2")).toEqual(record({ childAgentId: "child-2" }));
  });

  it("keeps the first finishedAt once a record is marked finished", async () => {
    const registry = new RemoteSubagentRegistry(filePath);
    await registry.add(record());

    await registry.markFinished("child-1", "2026-01-01T01:00:00.000Z");
    await registry.markFinished("child-1", "2026-01-01T02:00:00.000Z");

    expect((await registry.get("child-1"))?.finishedAt).toBe("2026-01-01T01:00:00.000Z");
  });

  it("serializes concurrent writes instead of losing one", async () => {
    const registry = new RemoteSubagentRegistry(filePath);
    await Promise.all([
      registry.add(record({ childAgentId: "child-1" })),
      registry.add(record({ childAgentId: "child-2" })),
      registry.add(record({ childAgentId: "child-3" })),
    ]);

    const records = await registry.list();
    expect(records.map((r) => r.childAgentId).sort()).toEqual(["child-1", "child-2", "child-3"]);

    const reloaded = new RemoteSubagentRegistry(filePath);
    expect((await reloaded.list()).map((r) => r.childAgentId).sort()).toEqual([
      "child-1",
      "child-2",
      "child-3",
    ]);
  });

  it("rejects a malformed file instead of silently discarding its contents", async () => {
    const registry = new RemoteSubagentRegistry(filePath);
    await registry.add(record());
    const { writeFile } = await import("node:fs/promises");
    await writeFile(filePath, JSON.stringify([{ childAgentId: "only-a-fragment" }]), "utf8");

    const reloaded = new RemoteSubagentRegistry(filePath);
    await expect(reloaded.list()).rejects.toThrow();
  });
});
