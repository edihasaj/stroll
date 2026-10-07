import type { Logger } from "pino";
import type {
  AgentPermissionRequest,
  AgentPermissionResponse,
} from "@getpaseo/protocol/agent-types";
import type { AgentSnapshotPayload } from "@getpaseo/protocol/messages";
import { AGENT_WAIT_TIMEOUT_MS } from "../agent/mcp-shared.js";
import type { PeerPool } from "./peer-pool.js";
import type { RemoteSubagentRecord } from "./remote-subagent-registry.js";

const NOTIFICATION_GUIDANCE =
  "You will get notified when the prompted agent finishes, errors, or needs permission. Do not " +
  "poll for status; continue with other work until the notification arrives.";

export interface RemoteFollowupDeps {
  peerPool: Pick<PeerPool, "connect">;
  /** Re-arms the finish watch for a record whose `notifyOnFinish` is true. */
  armWatch: (record: RemoteSubagentRecord) => void;
  /** Persists a record change (e.g. `notifyOnFinish` flipped on by a follow-up prompt). */
  saveRecord: (record: RemoteSubagentRecord) => Promise<void>;
  logger: Logger;
}

/**
 * A follow-up prompt starts a new turn, so the child is unfinished again: the record drops its
 * earlier `finishedAt`, otherwise the watch would skip it as already done and the second finish
 * would never reach the caller.
 */
export async function rearmIfRequested(
  deps: Pick<RemoteFollowupDeps, "armWatch" | "saveRecord">,
  record: RemoteSubagentRecord,
  notifyOnFinish: boolean,
): Promise<void> {
  if (!notifyOnFinish) {
    return;
  }
  const { finishedAt: _previousFinish, ...unfinished } = record;
  const updated: RemoteSubagentRecord = { ...unfinished, notifyOnFinish: true };
  await deps.saveRecord(updated);
  deps.armWatch(updated);
}

export interface SendRemoteAgentPromptArgs {
  prompt: string;
  sessionMode?: string;
  background: boolean;
  notifyOnFinish: boolean;
}

export interface SendRemoteAgentPromptResult {
  success: boolean;
  status: AgentSnapshotPayload["status"];
  lastMessage: string | null;
  permission: AgentPermissionRequest | null;
  guidance?: string;
}

/** Routes `send_agent_prompt` to the peer that owns this remote child (docs/peers.md). */
export async function sendRemoteAgentPrompt(
  deps: RemoteFollowupDeps,
  record: RemoteSubagentRecord,
  args: SendRemoteAgentPromptArgs,
): Promise<SendRemoteAgentPromptResult> {
  const { client } = await deps.peerPool.connect(record.peerId);
  if (args.sessionMode) {
    await client.setAgentMode(record.childAgentId, args.sessionMode);
  }
  await client.sendAgentMessage(record.childAgentId, args.prompt);

  if (!args.background) {
    const waited = await client.waitForFinish(record.childAgentId, AGENT_WAIT_TIMEOUT_MS);
    const stillRunning = waited.status === "timeout" && waited.final?.status === "running";
    if (stillRunning) {
      await rearmIfRequested(deps, record, args.notifyOnFinish);
    }
    return {
      success: true,
      status: waited.final?.status ?? "idle",
      lastMessage: waited.lastMessage,
      permission: waited.final?.pendingPermissions.at(-1) ?? null,
      ...(stillRunning && args.notifyOnFinish ? { guidance: NOTIFICATION_GUIDANCE } : {}),
    };
  }

  await rearmIfRequested(deps, record, args.notifyOnFinish);
  const current = await client.fetchAgent(record.childAgentId);
  return {
    success: true,
    status: current?.agent.status ?? "idle",
    lastMessage: null,
    permission: null,
    ...(args.notifyOnFinish ? { guidance: NOTIFICATION_GUIDANCE } : {}),
  };
}

export interface GetRemoteAgentStatusResult {
  status: AgentSnapshotPayload["status"];
  snapshot: AgentSnapshotPayload;
}

/** Routes `get_agent_status` to the peer that owns this remote child (docs/peers.md). */
export async function getRemoteAgentStatus(
  deps: Pick<RemoteFollowupDeps, "peerPool">,
  record: RemoteSubagentRecord,
): Promise<GetRemoteAgentStatusResult> {
  const { client } = await deps.peerPool.connect(record.peerId);
  const fetched = await client.fetchAgent(record.childAgentId);
  if (!fetched) {
    throw new Error(`Agent ${record.childAgentId} not found`);
  }
  return { status: fetched.agent.status, snapshot: fetched.agent };
}

/** Routes `cancel_agent` to the peer that owns this remote child (docs/peers.md). */
export async function cancelRemoteAgent(
  deps: Pick<RemoteFollowupDeps, "peerPool">,
  record: RemoteSubagentRecord,
): Promise<{ success: boolean }> {
  const { client } = await deps.peerPool.connect(record.peerId);
  await client.cancelAgent(record.childAgentId);
  return { success: true };
}

/** Routes `archive_agent` to the peer that owns this remote child (docs/peers.md). */
export async function archiveRemoteAgent(
  deps: Pick<RemoteFollowupDeps, "peerPool">,
  record: RemoteSubagentRecord,
): Promise<{ success: boolean }> {
  const { client } = await deps.peerPool.connect(record.peerId);
  await client.archiveAgent(record.childAgentId);
  return { success: true };
}

/** Routes `respond_to_permission` to the peer that owns this remote child (docs/peers.md). */
export async function respondToRemoteAgentPermission(
  deps: Pick<RemoteFollowupDeps, "peerPool">,
  record: RemoteSubagentRecord,
  requestId: string,
  response: AgentPermissionResponse,
): Promise<{ success: boolean }> {
  const { client } = await deps.peerPool.connect(record.peerId);
  await client.respondToPermission(record.childAgentId, requestId, response);
  return { success: true };
}
