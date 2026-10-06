import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import type { AgentBrief, AgentRouteEvent } from "@getpaseo/protocol/agent-route";
import { createAgentBriefStore } from "./brief-store.js";

function createFakeLogger() {
  const warnings: Array<{ obj: object; msg?: string }> = [];
  return {
    warnings,
    warn: (obj: object, msg?: string) => {
      warnings.push({ obj, msg });
    },
  };
}

function buildBrief(overrides: Partial<AgentBrief> = {}): AgentBrief {
  return {
    threadId: "thread-1",
    goal: "Ship the feature",
    state: "Implementing the store",
    decisions: ["Use atomic writes"],
    openItems: ["Write tests"],
    files: ["brief-store.ts"],
    updatedAt: "2026-01-01T00:00:00.000Z",
    ...overrides,
  };
}

function buildEvent(overrides: Partial<AgentRouteEvent> = {}): AgentRouteEvent {
  return {
    at: "2026-01-01T00:00:00.000Z",
    kind: "failover",
    fromAgentId: "agent-1",
    toAgentId: "agent-2",
    fromProfileId: "qwen",
    toProfileId: "claude",
    reason: "unreachable",
    detail: null,
    ...overrides,
  };
}

describe("createAgentBriefStore", () => {
  let paseoHome: string;
  let logger: ReturnType<typeof createFakeLogger>;

  beforeEach(async () => {
    paseoHome = await fs.mkdtemp(path.join(os.tmpdir(), "agent-brief-store-"));
    logger = createFakeLogger();
  });

  afterEach(async () => {
    await fs.rm(paseoHome, { recursive: true, force: true });
  });

  it("reads an empty record when no file exists yet", async () => {
    const store = createAgentBriefStore({ paseoHome, logger });
    await expect(store.read("thread-1")).resolves.toEqual({ brief: null, events: [] });
    expect(logger.warnings).toHaveLength(0);
  });

  it("round-trips a written brief", async () => {
    const store = createAgentBriefStore({ paseoHome, logger });
    const brief = buildBrief();

    await store.writeBrief("thread-1", brief);

    await expect(store.read("thread-1")).resolves.toEqual({ brief, events: [] });
    const filePath = path.join(paseoHome, "agent-briefs", "thread-1.json");
    const raw = JSON.parse(await fs.readFile(filePath, "utf8"));
    expect(raw).toEqual({ brief, events: [] });
  });

  it("appends events while keeping the stored brief", async () => {
    const store = createAgentBriefStore({ paseoHome, logger });
    const brief = buildBrief();
    await store.writeBrief("thread-1", brief);

    const first = buildEvent({ at: "2026-01-01T00:00:01.000Z" });
    const second = buildEvent({ at: "2026-01-01T00:00:02.000Z", kind: "paused" });
    await store.appendEvent("thread-1", first);
    await store.appendEvent("thread-1", second);

    await expect(store.read("thread-1")).resolves.toEqual({
      brief,
      events: [first, second],
    });
  });

  it("clearing the brief keeps earlier events", async () => {
    const store = createAgentBriefStore({ paseoHome, logger });
    const event = buildEvent();
    await store.appendEvent("thread-1", event);
    await store.writeBrief("thread-1", buildBrief());

    await store.writeBrief("thread-1", null);

    await expect(store.read("thread-1")).resolves.toEqual({ brief: null, events: [event] });
  });

  it("keeps threads independent", async () => {
    const store = createAgentBriefStore({ paseoHome, logger });
    await store.writeBrief("thread-1", buildBrief({ threadId: "thread-1", goal: "Thread one" }));
    await store.writeBrief("thread-2", buildBrief({ threadId: "thread-2", goal: "Thread two" }));

    await expect(store.read("thread-1")).resolves.toMatchObject({ brief: { goal: "Thread one" } });
    await expect(store.read("thread-2")).resolves.toMatchObject({ brief: { goal: "Thread two" } });
  });

  it("treats invalid JSON as an empty record and logs it", async () => {
    const briefsDir = path.join(paseoHome, "agent-briefs");
    await fs.mkdir(briefsDir, { recursive: true });
    await fs.writeFile(path.join(briefsDir, "thread-1.json"), "{not json", "utf8");
    const store = createAgentBriefStore({ paseoHome, logger });

    await expect(store.read("thread-1")).resolves.toEqual({ brief: null, events: [] });

    expect(logger.warnings).toHaveLength(1);
    expect(logger.warnings[0]?.msg).toContain("Corrupt agent brief file");
  });

  it("treats a schema mismatch as an empty record and logs it", async () => {
    const briefsDir = path.join(paseoHome, "agent-briefs");
    await fs.mkdir(briefsDir, { recursive: true });
    await fs.writeFile(
      path.join(briefsDir, "thread-1.json"),
      JSON.stringify({ brief: { goal: "missing required fields" }, events: [] }),
      "utf8",
    );
    const store = createAgentBriefStore({ paseoHome, logger });

    await expect(store.read("thread-1")).resolves.toEqual({ brief: null, events: [] });

    expect(logger.warnings).toHaveLength(1);
    expect(logger.warnings[0]?.msg).toContain("Corrupt agent brief file");
  });

  it("sanitizes an unsafe thread id into a file strictly inside the briefs directory", async () => {
    const store = createAgentBriefStore({ paseoHome, logger });
    const unsafeThreadId = "../../etc/passwd";

    await store.writeBrief(unsafeThreadId, buildBrief({ threadId: unsafeThreadId }));

    const briefsDir = path.join(paseoHome, "agent-briefs");
    const entries = await fs.readdir(briefsDir);
    expect(entries).toHaveLength(1);
    for (const entry of entries) {
      expect(path.resolve(briefsDir, entry)).toContain(briefsDir);
    }
    await expect(store.read(unsafeThreadId)).resolves.toMatchObject({
      brief: { threadId: unsafeThreadId },
    });
  });

  it("serializes concurrent writes to the same thread without losing updates", async () => {
    const store = createAgentBriefStore({ paseoHome, logger });
    const events = Array.from({ length: 10 }, (_, index) =>
      buildEvent({ at: `2026-01-01T00:00:${String(index).padStart(2, "0")}.000Z` }),
    );

    await Promise.all(events.map((event) => store.appendEvent("thread-1", event)));

    const record = await store.read("thread-1");
    expect(record.events).toHaveLength(10);
    expect(new Set(record.events.map((event) => event.at)).size).toBe(10);
  });

  it("leaves no stray temp files after a write", async () => {
    const store = createAgentBriefStore({ paseoHome, logger });
    await store.writeBrief("thread-1", buildBrief());

    const entries = await fs.readdir(path.join(paseoHome, "agent-briefs"));
    expect(entries).toEqual(["thread-1.json"]);
  });
});
