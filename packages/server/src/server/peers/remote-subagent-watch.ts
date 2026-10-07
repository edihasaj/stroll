import type { Logger } from "pino";
import type { WaitForFinishResult } from "@getpaseo/client/internal/daemon-client";
import type { AgentPermissionRequest } from "@getpaseo/protocol/agent-types";
import type { AgentSnapshotPayload } from "@getpaseo/protocol/messages";
import type { AgentManager } from "../agent/agent-manager.js";
import type { AgentStorage } from "../agent/agent-storage.js";
import {
  formatFinishNotificationBody,
  formatSystemNotificationPrompt,
  sendPromptToAgent,
  type FinishNotificationReason,
} from "../agent/agent-prompt.js";
import type { PeerPool } from "./peer-pool.js";
import type { RemoteSubagentRecord, RemoteSubagentRegistry } from "./remote-subagent-registry.js";

/**
 * The slice of a snapshot the finish watch reads. A `Pick` of the wire type rather than a
 * hand-written shape, so a real `DaemonClient` satisfies this structurally and a test fake only
 * has to fill in two fields instead of a whole `AgentSnapshotPayload`.
 */
type RemoteSubagentFinishSnapshot = Pick<AgentSnapshotPayload, "status" | "pendingPermissions">;

/** The slice of `DaemonClient` the finish watch needs from a peer connection. */
export interface RemoteSubagentWatchClient {
  waitForFinish(
    agentId: string,
    timeoutMs: number,
  ): Promise<Omit<WaitForFinishResult, "final"> & { final: RemoteSubagentFinishSnapshot | null }>;
  fetchAgent(agentId: string): Promise<{ agent: RemoteSubagentFinishSnapshot } | null>;
}

export const MIN_RECONNECT_BACKOFF_MS = 2_000;
export const MAX_RECONNECT_BACKOFF_MS = 60_000;
const PERMISSION_POLL_INTERVAL_MS = 3_000;

export type NotifyRemoteSubagent = (
  reason: FinishNotificationReason,
  permissionRequest?: AgentPermissionRequest,
  lastMessage?: string | null,
) => Promise<void>;

export interface RemoteSubagentWatchHandle {
  stop(): void;
}

export interface WatchRemoteSubagentParams {
  peerId: string;
  childAgentId: string;
  connect: (peerId: string) => Promise<{ client: RemoteSubagentWatchClient }>;
  notify: NotifyRemoteSubagent;
  isParentArchived: () => Promise<boolean>;
  markFinished: () => Promise<void>;
  /** Injected so tests control time directly instead of racing real timers. */
  delay: (ms: number) => Promise<void>;
  logger: Logger;
}

/**
 * Watches a subagent on another computer's daemon until it finishes, errors, or closes, notifying
 * the caller the same way a local subagent would (docs/peers.md, docs/agent-lifecycle.md). Blocks
 * on the peer's `waitForFinish` rather than polling, reconnects with capped backoff when the peer
 * drops, and waits out a pending permission instead of re-arming into the same "permission" state.
 *
 * Cannot interrupt an in-flight `waitForFinish` call: if the parent is archived while this watch is
 * blocked waiting on the child, the watch only notices on its next loop iteration (reconnect, the
 * next terminal event, or after a permission resolves) rather than mid-wait.
 */
export function watchRemoteSubagent(params: WatchRemoteSubagentParams): RemoteSubagentWatchHandle {
  const abortController = new AbortController();
  const stopped = () => abortController.signal.aborted;

  void run().catch((error) => {
    params.logger.error(
      { err: error, peerId: params.peerId, childAgentId: params.childAgentId },
      "Remote subagent watch crashed",
    );
  });

  return {
    stop: () => abortController.abort(),
  };

  async function run(): Promise<void> {
    let backoffMs = MIN_RECONNECT_BACKOFF_MS;
    while (!stopped()) {
      if (await params.isParentArchived()) {
        return;
      }

      let client: RemoteSubagentWatchClient;
      try {
        ({ client } = await params.connect(params.peerId));
      } catch (error) {
        params.logger.warn(
          { err: error, peerId: params.peerId, childAgentId: params.childAgentId },
          "Failed to connect to peer for remote subagent watch; retrying",
        );
        backoffMs = await backoffAndGrow(backoffMs);
        continue;
      }
      backoffMs = MIN_RECONNECT_BACKOFF_MS;

      let result: Awaited<ReturnType<RemoteSubagentWatchClient["waitForFinish"]>>;
      try {
        result = await client.waitForFinish(params.childAgentId, 0);
      } catch (error) {
        if (stopped()) return;
        params.logger.warn(
          { err: error, peerId: params.peerId, childAgentId: params.childAgentId },
          "Lost connection watching remote subagent; reconnecting",
        );
        backoffMs = await backoffAndGrow(backoffMs);
        continue;
      }
      if (stopped()) return;

      if (result.final?.status === "closed") {
        await params.markFinished();
        await notifySafely("was closed", undefined, result.lastMessage);
        return;
      }

      if (result.status === "permission") {
        const pending = result.final?.pendingPermissions.at(-1);
        await notifySafely("needs permission", pending, result.lastMessage);
        await waitForPermissionResolved(client, pending);
        continue;
      }

      await params.markFinished();
      await notifySafely(
        result.status === "error" ? "errored" : "finished",
        undefined,
        result.lastMessage,
      );
      return;
    }
  }

  async function backoffAndGrow(currentBackoffMs: number): Promise<number> {
    await params.delay(currentBackoffMs);
    return Math.min(currentBackoffMs * 2, MAX_RECONNECT_BACKOFF_MS);
  }

  async function notifySafely(
    reason: FinishNotificationReason,
    permissionRequest: AgentPermissionRequest | undefined,
    lastMessage: string | null,
  ): Promise<void> {
    try {
      await params.notify(reason, permissionRequest, lastMessage);
    } catch (error) {
      params.logger.error(
        { err: error, peerId: params.peerId, childAgentId: params.childAgentId, reason },
        "Failed to notify caller agent about remote subagent",
      );
    }
  }

  /** Polls instead of blocking so a dropped connection here surfaces as "gone," not a hang. */
  async function waitForPermissionResolved(
    client: RemoteSubagentWatchClient,
    pending: AgentPermissionRequest | undefined,
  ): Promise<void> {
    if (!pending) {
      // No concrete request to track. Back off once so a status that keeps reporting
      // "permission" with nothing to poll cannot busy-loop against the peer.
      await params.delay(PERMISSION_POLL_INTERVAL_MS);
      return;
    }
    while (!stopped()) {
      if (await params.isParentArchived()) {
        return;
      }
      await params.delay(PERMISSION_POLL_INTERVAL_MS);
      const fetched = await client.fetchAgent(params.childAgentId).catch(() => null);
      if (!fetched) {
        return;
      }
      if (!fetched.agent.pendingPermissions.some((request) => request.id === pending.id)) {
        return;
      }
    }
  }
}

export interface RemoteSubagentNotifyDeps {
  agentManager: AgentManager;
  agentStorage: AgentStorage;
}

interface BuildRemoteSubagentNotifierParams extends RemoteSubagentNotifyDeps {
  childAgentId: string;
  parentAgentId: string;
  title: string;
  /** Peer display name, inserted into the notification body (docs/peers.md). */
  computerName: string;
  logger: Logger;
}

/** Wires the finish watch's `notify` callback to the same steer-the-parent path a local subagent uses. */
export function buildRemoteSubagentNotifier(
  params: BuildRemoteSubagentNotifierParams,
): NotifyRemoteSubagent {
  return async (reason, permissionRequest, lastMessage) => {
    const parentRecord = await params.agentStorage.get(params.parentAgentId);
    if (parentRecord?.archivedAt) {
      return;
    }
    const body = formatFinishNotificationBody({
      childAgentId: params.childAgentId,
      title: params.title,
      reason,
      lastAssistantMessage: lastMessage ?? null,
      permissionRequest,
      computerName: params.computerName,
    });
    await sendPromptToAgent({
      agentManager: params.agentManager,
      agentStorage: params.agentStorage,
      agentId: params.parentAgentId,
      prompt: formatSystemNotificationPrompt(body),
      activeTurnBehavior: "steer",
      unarchive: false,
      logger: params.logger,
    });
  };
}

/**
 * Tracks the live finish watch for every remote child, keyed by child agent id, so a creation and
 * a later daemon-restart re-arm cannot both watch the same child, and so shutdown can stop them all.
 */
export class RemoteSubagentWatchManager {
  private readonly active = new Map<string, RemoteSubagentWatchHandle>();

  constructor(
    private readonly peerPool: PeerPool,
    private readonly registry: RemoteSubagentRegistry,
    private readonly logger: Logger,
    private readonly delay: (ms: number) => Promise<void> = (ms) =>
      new Promise((resolve) => setTimeout(resolve, ms)),
  ) {}

  /** Arms (replacing any existing watch) the finish watch for one remote child. No-op if finished or not watched. */
  arm(record: RemoteSubagentRecord, deps: RemoteSubagentNotifyDeps): void {
    this.active.get(record.childAgentId)?.stop();
    this.active.delete(record.childAgentId);
    if (!record.notifyOnFinish || record.finishedAt) {
      return;
    }

    let computerName = record.peerId;
    try {
      computerName = this.peerPool.get(record.peerId).name;
    } catch (error) {
      this.logger.warn(
        { err: error, peerId: record.peerId, childAgentId: record.childAgentId },
        "Peer is no longer configured; using its id in finish notifications",
      );
    }

    const handle = watchRemoteSubagent({
      peerId: record.peerId,
      childAgentId: record.childAgentId,
      connect: async (peerId) => {
        const { client } = await this.peerPool.connect(peerId);
        return { client };
      },
      notify: buildRemoteSubagentNotifier({
        ...deps,
        childAgentId: record.childAgentId,
        parentAgentId: record.parentAgentId,
        title: record.title,
        computerName,
        logger: this.logger,
      }),
      isParentArchived: async () => {
        const parent = await deps.agentStorage.get(record.parentAgentId);
        return Boolean(parent?.archivedAt);
      },
      markFinished: () => this.registry.markFinished(record.childAgentId, new Date().toISOString()),
      delay: this.delay,
      logger: this.logger,
    });
    this.active.set(record.childAgentId, handle);
  }

  /** Re-arms every unfinished watch, for daemon startup (docs/peers.md). */
  async rearmAll(deps: RemoteSubagentNotifyDeps): Promise<void> {
    for (const record of await this.registry.list()) {
      this.arm(record, deps);
    }
  }

  stopAll(): void {
    for (const handle of this.active.values()) {
      handle.stop();
    }
    this.active.clear();
  }
}
