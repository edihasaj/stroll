import { afterEach, expect, test } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { AgentManager } from "./agent-manager.js";
import { AgentStorage } from "./agent-storage.js";
import { recoverInterruptedAgents } from "./agent-recovery.js";
import { createTestAgentClient } from "../test-utils/fake-agent-client.js";
import { createTestLogger } from "../../test-utils/test-logger.js";
import type { AgentClient } from "./agent-sdk-types.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

async function createInterruptedAgentFixture(): Promise<{
  agentId: string;
  storage: AgentStorage;
  workdir: string;
}> {
  const workdir = await mkdtemp(path.join(tmpdir(), "paseo-agent-recovery-"));
  roots.push(workdir);
  const storage = new AgentStorage(path.join(workdir, "agents"), createTestLogger());
  await storage.initialize();
  const manager = new AgentManager({
    clients: { codex: createTestAgentClient("codex") },
    registry: storage,
    logger: createTestLogger(),
    idFactory: () => "11111111-1111-4111-8111-111111111111",
  });
  const agent = await manager.createAgent({ provider: "codex", cwd: workdir }, undefined, {
    workspaceId: undefined,
  });
  await storage.applySnapshot(agent);
  await manager.closeAgent(agent.id);
  const record = await storage.get(agent.id);
  if (!record) {
    throw new Error("Expected persisted agent record");
  }
  await storage.upsert({
    ...record,
    lastStatus: "running",
    persistence: {
      provider: "codex",
      sessionId: "recovery-session",
      metadata: { cwd: workdir },
    },
  });

  return { agentId: agent.id, storage, workdir };
}

function createRecoveryManager(storage: AgentStorage, client: AgentClient): AgentManager {
  return new AgentManager({
    clients: { codex: client },
    registry: storage,
    logger: createTestLogger(),
  });
}

test("resumes interrupted persisted agents before clients connect", async () => {
  const fixture = await createInterruptedAgentFixture();
  const manager = createRecoveryManager(fixture.storage, createTestAgentClient("codex"));

  await recoverInterruptedAgents({
    agentManager: manager,
    agentStorage: fixture.storage,
    logger: createTestLogger(),
  });

  expect(manager.getAgent(fixture.agentId)?.persistence).toMatchObject({
    provider: "codex",
  });
});

test("marks an unrecoverable interrupted agent as an attention error without retrying it", async () => {
  const fixture = await createInterruptedAgentFixture();
  const delegate = createTestAgentClient("codex");
  const failingClient: AgentClient = {
    provider: delegate.provider,
    capabilities: delegate.capabilities,
    createSession: delegate.createSession.bind(delegate),
    resumeSession: async () => {
      throw new Error("conversation no longer exists");
    },
    fetchCatalog: delegate.fetchCatalog.bind(delegate),
    isAvailable: delegate.isAvailable.bind(delegate),
  };
  const manager = createRecoveryManager(fixture.storage, failingClient);

  await recoverInterruptedAgents({
    agentManager: manager,
    agentStorage: fixture.storage,
    logger: createTestLogger(),
  });

  await recoverInterruptedAgents({
    agentManager: manager,
    agentStorage: fixture.storage,
    logger: createTestLogger(),
  });

  expect(await fixture.storage.get(fixture.agentId)).toMatchObject({
    lastStatus: "error",
    requiresAttention: true,
    attentionReason: "error",
    lastError:
      "Stroll could not resume this agent after the daemon restart: conversation no longer exists",
  });
});

test("marks an interrupted agent without a persistence handle as unrecoverable", async () => {
  const fixture = await createInterruptedAgentFixture();
  const record = await fixture.storage.get(fixture.agentId);
  if (!record) {
    throw new Error("Expected persisted agent record");
  }
  await fixture.storage.upsert({ ...record, persistence: null });
  const manager = createRecoveryManager(fixture.storage, createTestAgentClient("codex"));

  await recoverInterruptedAgents({
    agentManager: manager,
    agentStorage: fixture.storage,
    logger: createTestLogger(),
  });

  expect(await fixture.storage.get(fixture.agentId)).toMatchObject({
    lastStatus: "error",
    requiresAttention: true,
    attentionReason: "error",
    lastError:
      "Stroll could not resume this agent after the daemon restart: the codex conversation is not resumable on this daemon",
  });
});
