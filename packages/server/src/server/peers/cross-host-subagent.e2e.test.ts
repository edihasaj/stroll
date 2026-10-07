import net from "node:net";
import os from "node:os";
import path from "node:path";
import { mkdtemp, rm } from "node:fs/promises";
import { describe, expect, test } from "vitest";
import { experimental_createMCPClient } from "ai";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import pino from "pino";
import {
  PARENT_AGENT_ID_LABEL,
  PARENT_COMPUTER_AGENT_LABEL,
  PARENT_COMPUTER_LABEL,
} from "@getpaseo/protocol/agent-labels";
import { createPaseoDaemon, type PaseoDaemon, type PaseoDaemonConfig } from "../bootstrap.js";
import { createTestAgentClients } from "../test-utils/fake-agent-client.js";
import type { AgentPromptInput } from "../agent/agent-sdk-types.js";

interface StructuredContent {
  [key: string]: unknown;
}

interface McpToolResult {
  structuredContent?: StructuredContent;
  content?: Array<{ structuredContent?: StructuredContent } | StructuredContent>;
  isError?: boolean;
}

interface McpClient {
  callTool: (input: { name: string; args?: StructuredContent }) => Promise<McpToolResult>;
  close: () => Promise<void>;
}

async function getAvailablePort(): Promise<number> {
  return await new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      if (!address || typeof address === "string") {
        server.close(() => reject(new Error("Failed to acquire port")));
        return;
      }
      server.close(() => resolve(address.port));
    });
  });
}

function getStructuredContent(result: McpToolResult): StructuredContent | null {
  if (result.structuredContent && typeof result.structuredContent === "object") {
    return result.structuredContent;
  }
  const content = result.content?.[0];
  if (content && typeof content === "object" && "structuredContent" in content) {
    if (content.structuredContent) return content.structuredContent;
  }
  if (content && typeof content === "object") {
    return content;
  }
  return null;
}

async function createMcpClient(url: string): Promise<McpClient> {
  const transport = new StreamableHTTPClientTransport(new URL(url));
  const rawClient = await experimental_createMCPClient({ transport });
  const boundCallTool: McpClient["callTool"] = Reflect.get(rawClient, "callTool").bind(rawClient);
  return { callTool: boundCallTool, close: () => rawClient.close() };
}

/** Polls instead of sleeping a fixed duration, so the test settles as soon as the real async
 * notification path (peer dial, waitForFinish, steer-the-parent) actually lands. */
async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    if (predicate()) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Timed out waiting for condition");
}

interface StartedDaemon {
  daemon: PaseoDaemon;
  paseoHome: string;
  staticDir: string;
  port: number;
}

async function startDaemon(options: {
  onParentStartTurn?: (prompt: AgentPromptInput) => void;
  peers?: PaseoDaemonConfig["peers"];
}): Promise<StartedDaemon> {
  const paseoHome = await mkdtemp(path.join(os.tmpdir(), "paseo-home-"));
  const staticDir = await mkdtemp(path.join(os.tmpdir(), "paseo-static-"));
  const port = await getAvailablePort();
  const config: PaseoDaemonConfig = {
    listen: `127.0.0.1:${port}`,
    paseoHome,
    corsAllowedOrigins: [],
    hostnames: true,
    mcpEnabled: true,
    staticDir,
    mcpDebug: false,
    agentClients: createTestAgentClients(
      options.onParentStartTurn ? { onStartTurn: options.onParentStartTurn } : {},
    ),
    agentStoragePath: path.join(paseoHome, "agents"),
    ...(options.peers ? { peers: options.peers } : {}),
  };
  const daemon = await createPaseoDaemon(config, pino({ level: "silent" }));
  await daemon.start();
  return { daemon, paseoHome, staticDir, port };
}

async function cleanupDaemon(started: StartedDaemon): Promise<void> {
  await started.daemon.stop().catch(() => undefined);
  await rm(started.paseoHome, { recursive: true, force: true });
  await rm(started.staticDir, { recursive: true, force: true });
}

describe("cross-host subagents (docs/peers.md step 2)", () => {
  test("creates a subagent on a peer, labels it, and delivers a finish notification to the caller", async () => {
    const sharedCwd = await mkdtemp(path.join(os.tmpdir(), "paseo-shared-cwd-"));
    const parentPrompts: AgentPromptInput[] = [];

    const b = await startDaemon({});
    const a = await startDaemon({
      onParentStartTurn: (prompt) => parentPrompts.push(prompt),
      peers: [{ id: "b", name: "Daemon B", target: `127.0.0.1:${b.port}` }],
    });

    const topLevelClient = await createMcpClient(`http://127.0.0.1:${a.port}/mcp/agents`);
    let scopedClient: McpClient | null = null;

    try {
      const parentResult = await topLevelClient.callTool({
        name: "create_agent",
        args: {
          cwd: sharedCwd,
          title: "Planner",
          provider: "claude/claude-test-model",
          mode: "bypassPermissions",
          initialPrompt: "Hold while a subagent runs on another computer.",
          background: true,
        },
      });
      const parentPayload = getStructuredContent(parentResult);
      const parentAgentId =
        typeof parentPayload?.agentId === "string" ? parentPayload.agentId : null;
      expect(parentAgentId).toBeTruthy();

      scopedClient = await createMcpClient(
        `http://127.0.0.1:${a.port}/mcp/agents?callerAgentId=${parentAgentId}`,
      );

      const childResult = await scopedClient.callTool({
        name: "create_agent",
        args: {
          title: "Fix the bug",
          provider: "claude/claude-test-model",
          initialPrompt: "Fix the bug and report back.",
          computer: "b",
        },
      });
      expect(childResult.isError).not.toBe(true);
      const childPayload = getStructuredContent(childResult);
      const childAgentId = typeof childPayload?.agentId === "string" ? childPayload.agentId : null;
      expect(childAgentId).toBeTruthy();
      expect(childPayload?.computer).toBe("b");
      expect(childPayload?.cwd).toBe(sharedCwd);

      const childAgent = b.daemon.agentManager.getAgent(childAgentId!);
      expect(childAgent).not.toBeNull();
      expect(childAgent?.cwd).toBe(sharedCwd);
      expect(childAgent?.labels[PARENT_COMPUTER_LABEL]).toBe(a.daemon.getServerId());
      expect(childAgent?.labels[PARENT_COMPUTER_AGENT_LABEL]).toBe(parentAgentId);
      // The peer has no record of the parent agent, so it must never be stamped here
      // (docs/peers.md) — only the two cross-host labels above identify the parent.
      expect(childAgent?.labels[PARENT_AGENT_ID_LABEL]).toBeUndefined();

      const mentionsFinish = (prompt: AgentPromptInput): boolean =>
        typeof prompt === "string" &&
        prompt.includes("finished") &&
        prompt.includes("Daemon B") &&
        prompt.includes(childAgentId!);
      await waitFor(() => parentPrompts.some(mentionsFinish), 15_000);
    } finally {
      await scopedClient?.close().catch(() => undefined);
      await topLevelClient.close().catch(() => undefined);
      await cleanupDaemon(a);
      await cleanupDaemon(b);
      await rm(sharedCwd, { recursive: true, force: true });
    }
  }, 30_000);
});
