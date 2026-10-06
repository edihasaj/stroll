import { afterEach, expect, test } from "vitest";
import { MockLoadTestAgentClient } from "./agent/providers/mock-load-test-agent.js";
import { DaemonClient } from "./test-utils/daemon-client.js";
import { createTestPaseoDaemon, type TestPaseoDaemon } from "./test-utils/paseo-daemon.js";

// Regression test for the demand-driven subscription merge (upstream #4470)
// landing on top of the daemon-owned agent queue (c3dc4b741, a7db050b1,
// cea693e14, f98f067f5). `createAgentQueuePrompt` succeeds and persists, but
// the `agent.queue.update` push must also reach a client that subscribes the
// way `packages/app/src/contexts/session-context.tsx` does.

let daemon: TestPaseoDaemon;

afterEach(async () => {
  await daemon?.close();
});

test("agent.queue.update push reaches a client after createAgentQueuePrompt", async () => {
  daemon = await createTestPaseoDaemon({
    isDev: true,
    agentClients: { mock: new MockLoadTestAgentClient() },
  });

  const client = new DaemonClient({
    url: `ws://127.0.0.1:${daemon.port}/ws`,
    appVersion: "0.8.0",
  });
  await client.connect();
  await client.fetchAgents({ subscribe: {} });

  // Mirror session-context.tsx: subscribe to the explicit event categories
  // the app cares about, including "agent.queue.update".
  client.observeEvents([
    "agent_attention_required",
    "terminal_attention_required",
    "agent_permission_request",
    "agent_permission_resolved",
    "agent.provider_subagents.update",
    "agent.queue.update",
    "checkout_status_update",
    "workspace_setup_progress",
    "status.server_info",
  ]);

  const agent = await client.createAgent({
    provider: "mock",
    cwd: "/tmp",
    title: "Queue push repro",
    model: "ten-second-stream",
  });
  await client.sendMessage(agent.id, "Start a long turn");
  await client.waitForAgentUpsert(agent.id, (a) => a.status === "running", 15_000);

  const pushReceived = new Promise<{ agentId: string; prompts: unknown[] }>((resolve) => {
    client.on("agent.queue.update", (message) => {
      resolve(message.payload);
    });
  });

  const created = await client.createAgentQueuePrompt({
    agentId: agent.id,
    text: "Queued while running",
  });

  const push = await Promise.race([
    pushReceived,
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error("Timed out waiting for agent.queue.update push")), 5_000),
    ),
  ]);

  expect(push.agentId).toBe(agent.id);
  expect(push.prompts).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ id: created.prompt?.id, text: "Queued while running" }),
    ]),
  );

  await client.close();
});

test("an unavailable steer never interrupts the turn and is delivered once it ends", async () => {
  daemon = await createTestPaseoDaemon({
    isDev: true,
    agentClients: { mock: new MockLoadTestAgentClient() },
  });

  const client = new DaemonClient({
    url: `ws://127.0.0.1:${daemon.port}/ws`,
    appVersion: "0.8.0",
  });
  await client.connect();
  await client.fetchAgents({ subscribe: {} });

  const agent = await client.createAgent({
    provider: "mock",
    cwd: "/tmp",
    title: "Steer queue fallback repro",
    model: "e2e-fast-stream",
    featureValues: { mockSteerUnavailableCount: 1 },
  });
  await client.sendMessage(agent.id, "Start a turn that cannot be steered.");
  await client.waitForAgentUpsert(agent.id, (a) => a.status === "running", 15_000);

  const result = await client.sendAgentMessage(agent.id, "steer me", {
    activeTurnBehavior: "steer",
  });
  expect(result.dispatch).toBe("queued_fallback");

  // The original turn is still the one running — an unavailable steer must never
  // interrupt it. If it had been interrupted, the agent would already be back to
  // "running" on a brand new turn well before the original 2s stream finishes.
  const stillRunning = await client.fetchAgent({ agentId: agent.id });
  expect(stillRunning.agent.status).toBe("running");

  const queue = await client.listAgentQueue(agent.id);
  expect(queue.prompts).toEqual(
    expect.arrayContaining([expect.objectContaining({ text: "steer me" })]),
  );

  await client.waitForFinish(agent.id, 15_000);

  // The queue drains on the idle transition, which starts a second turn with the
  // queued text — proof of delivery, not just retention.
  await client.waitForAgentUpsert(agent.id, (a) => a.status === "running", 15_000);
  const drainedQueue = await client.listAgentQueue(agent.id);
  expect(drainedQueue.prompts).toEqual([]);

  await client.close();
});

async function waitForQueuedPromptDelivery(
  client: DaemonClient,
  agentId: string,
  text: string,
): Promise<number> {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const timeline = await client.fetchAgentTimeline(agentId, { limit: 100 });
    const delivered = timeline.entries.filter(
      (entry) => entry.item.type === "user_message" && entry.item.text === text,
    );
    if (delivered.length > 0) return delivered.length;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Timed out waiting for queued prompt "${text}" to reach the agent`);
}

test("a queued prompt reaches the agent while no client is connected", async () => {
  daemon = await createTestPaseoDaemon({
    isDev: true,
    agentClients: { mock: new MockLoadTestAgentClient() },
  });
  const url = `ws://127.0.0.1:${daemon.port}/ws`;

  const sender = new DaemonClient({ url, appVersion: "0.8.0" });
  await sender.connect();
  await sender.fetchAgents({ subscribe: {} });
  const agent = await sender.createAgent({
    provider: "mock",
    cwd: "/tmp",
    title: "Queue drains unattended",
    model: "e2e-fast-stream",
  });
  await sender.sendMessage(agent.id, "Start a turn, then queue behind it.");
  await sender.waitForAgentUpsert(agent.id, (a) => a.status === "running", 15_000);
  await sender.createAgentQueuePrompt({ agentId: agent.id, text: "Delivered unattended" });
  // A phone that queues a message and then locks must still get it delivered.
  await sender.close();

  const queueStore = daemon.daemon.agentStorage.queueStore;
  const deadline = Date.now() + 15_000;
  while ((await queueStore.list(agent.id)).length > 0) {
    if (Date.now() > deadline) throw new Error("Queued prompt never drained without a client");
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  const observer = new DaemonClient({ url, appVersion: "0.8.0" });
  await observer.connect();
  expect(await waitForQueuedPromptDelivery(observer, agent.id, "Delivered unattended")).toBe(1);
  await observer.close();
});

test("a prompt queued while the agent is already idle is delivered right away", async () => {
  daemon = await createTestPaseoDaemon({
    isDev: true,
    agentClients: { mock: new MockLoadTestAgentClient() },
  });

  const client = new DaemonClient({
    url: `ws://127.0.0.1:${daemon.port}/ws`,
    appVersion: "0.8.0",
  });
  await client.connect();
  await client.fetchAgents({ subscribe: {} });
  const agent = await client.createAgent({
    provider: "mock",
    cwd: "/tmp",
    title: "Queue lands after the turn ended",
    model: "e2e-fast-stream",
  });
  await client.sendMessage(agent.id, "Finish before the queue lands.");
  await client.waitForFinish(agent.id, 15_000);

  // The idle transition already happened, so only the queue write itself can trigger delivery.
  await client.createAgentQueuePrompt({ agentId: agent.id, text: "Queued after the turn" });

  expect(await waitForQueuedPromptDelivery(client, agent.id, "Queued after the turn")).toBe(1);
  expect((await client.listAgentQueue(agent.id)).prompts).toEqual([]);
  await client.close();
});
