import { describe, expect, it, vi } from "vitest";
import type { AgentPermissionRequest } from "@getpaseo/protocol/agent-types";
import {
  MAX_RECONNECT_BACKOFF_MS,
  MIN_RECONNECT_BACKOFF_MS,
  watchRemoteSubagent,
  type RemoteSubagentWatchClient,
  type WatchRemoteSubagentParams,
} from "./remote-subagent-watch.js";

function createDeferred<T>(): {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (error: unknown) => void;
} {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const PERMISSION: AgentPermissionRequest = {
  id: "perm-1",
  provider: "codex",
  name: "run_command",
  kind: "tool",
};

interface Harness {
  client: RemoteSubagentWatchClient;
  waitForFinish: ReturnType<typeof vi.fn>;
  fetchAgent: ReturnType<typeof vi.fn>;
  connect: ReturnType<typeof vi.fn>;
  notify: ReturnType<typeof vi.fn>;
  isParentArchived: ReturnType<typeof vi.fn>;
  markFinished: ReturnType<typeof vi.fn>;
  delayCalls: number[];
  delay: (ms: number) => Promise<void>;
  start: () => { stop: () => void };
}

function createHarness(): Harness {
  const waitForFinish = vi.fn();
  const fetchAgent = vi.fn();
  const client: RemoteSubagentWatchClient = { waitForFinish, fetchAgent };
  const connect = vi.fn().mockResolvedValue({ client });
  const notify = vi.fn().mockResolvedValue(undefined);
  const isParentArchived = vi.fn().mockResolvedValue(false);
  const markFinished = vi.fn().mockResolvedValue(undefined);
  const delayCalls: number[] = [];
  const delay = (ms: number) => {
    delayCalls.push(ms);
    return Promise.resolve();
  };

  const params: WatchRemoteSubagentParams = {
    peerId: "studio",
    childAgentId: "child-1",
    connect,
    notify,
    isParentArchived,
    markFinished,
    delay,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- minimal silent test logger
    logger: { warn: () => {}, error: () => {} } as any,
  };

  return {
    client,
    waitForFinish,
    fetchAgent,
    connect,
    notify,
    isParentArchived,
    markFinished,
    delayCalls,
    delay,
    start: () => watchRemoteSubagent(params),
  };
}

// Each `setImmediate` tick drains every microtask queued so far, so repeating it a generous
// number of times lets a multi-iteration loop (several connects, waits, and delays chained
// together) settle without depending on wall-clock timing.
async function flush(): Promise<void> {
  for (let i = 0; i < 50; i++) {
    await new Promise((resolve) => setImmediate(resolve));
  }
}

describe("watchRemoteSubagent", () => {
  it("notifies finished and marks the record finished when the child goes idle", async () => {
    const h = createHarness();
    h.waitForFinish.mockResolvedValue({
      status: "idle",
      final: { status: "idle", pendingPermissions: [] },
      lastMessage: "all done",
    });

    h.start();
    await flush();

    expect(h.notify).toHaveBeenCalledTimes(1);
    expect(h.notify).toHaveBeenCalledWith("finished", undefined, "all done");
    expect(h.markFinished).toHaveBeenCalledTimes(1);
  });

  it("notifies errored when the child's last turn failed", async () => {
    const h = createHarness();
    h.waitForFinish.mockResolvedValue({
      status: "error",
      final: { status: "error", pendingPermissions: [] },
      lastMessage: "boom",
    });

    h.start();
    await flush();

    expect(h.notify).toHaveBeenCalledWith("errored", undefined, "boom");
    expect(h.markFinished).toHaveBeenCalledTimes(1);
  });

  it("notifies was closed from the final snapshot even when the wrapped status says idle", async () => {
    // The daemon's wait_for_finish handler collapses a closed agent's status to "idle"
    // (see packages/server/src/server/session.ts handleWaitForFinish); the watch must
    // read the real lifecycle off `final.status`, not the collapsed `status` field.
    const h = createHarness();
    h.waitForFinish.mockResolvedValue({
      status: "idle",
      final: { status: "closed", pendingPermissions: [] },
      lastMessage: null,
    });

    h.start();
    await flush();

    expect(h.notify).toHaveBeenCalledWith("was closed", undefined, null);
    expect(h.markFinished).toHaveBeenCalledTimes(1);
  });

  it("waits for a pending permission to resolve before re-arming, then reports the next terminal state", async () => {
    const h = createHarness();
    h.waitForFinish
      .mockResolvedValueOnce({
        status: "permission",
        final: { status: "running", pendingPermissions: [PERMISSION] },
        lastMessage: null,
      })
      .mockResolvedValueOnce({
        status: "idle",
        final: { status: "idle", pendingPermissions: [] },
        lastMessage: "resolved and done",
      });
    h.fetchAgent
      .mockResolvedValueOnce({ agent: { status: "running", pendingPermissions: [PERMISSION] } })
      .mockResolvedValueOnce({ agent: { status: "running", pendingPermissions: [] } });

    h.start();
    await flush();

    expect(h.notify).toHaveBeenNthCalledWith(1, "needs permission", PERMISSION, null);
    expect(h.fetchAgent).toHaveBeenCalledTimes(2);
    expect(h.waitForFinish).toHaveBeenCalledTimes(2);
    expect(h.notify).toHaveBeenNthCalledWith(2, "finished", undefined, "resolved and done");
    expect(h.markFinished).toHaveBeenCalledTimes(1);
  });

  it("reconnects with capped, doubling backoff when the peer cannot be dialed", async () => {
    const h = createHarness();
    h.connect
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("ECONNREFUSED"))
      .mockResolvedValueOnce({ client: h.client });
    h.waitForFinish.mockResolvedValue({
      status: "idle",
      final: { status: "idle", pendingPermissions: [] },
      lastMessage: null,
    });

    h.start();
    await flush();

    expect(h.delayCalls.slice(0, 2)).toEqual([
      MIN_RECONNECT_BACKOFF_MS,
      MIN_RECONNECT_BACKOFF_MS * 2,
    ]);
    expect(h.connect).toHaveBeenCalledTimes(3);
    expect(h.notify).toHaveBeenCalledWith("finished", undefined, null);
  });

  it("caps backoff growth at the configured maximum", async () => {
    const h = createHarness();
    for (let i = 0; i < 8; i++) {
      h.connect.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    }
    h.connect.mockResolvedValueOnce({ client: h.client });
    h.waitForFinish.mockResolvedValue({
      status: "idle",
      final: { status: "idle", pendingPermissions: [] },
      lastMessage: null,
    });

    h.start();
    await flush();

    expect(Math.max(...h.delayCalls)).toBe(MAX_RECONNECT_BACKOFF_MS);
  });

  it("reconnects when the connection drops mid-wait instead of giving up", async () => {
    const h = createHarness();
    h.waitForFinish.mockRejectedValueOnce(new Error("socket hang up")).mockResolvedValueOnce({
      status: "idle",
      final: { status: "idle", pendingPermissions: [] },
      lastMessage: null,
    });

    h.start();
    await flush();

    expect(h.connect).toHaveBeenCalledTimes(2);
    expect(h.delayCalls).toEqual([MIN_RECONNECT_BACKOFF_MS]);
    expect(h.notify).toHaveBeenCalledWith("finished", undefined, null);
  });

  it("stops without connecting when the parent is already archived", async () => {
    const h = createHarness();
    h.isParentArchived.mockResolvedValue(true);

    h.start();
    await flush();

    expect(h.connect).not.toHaveBeenCalled();
    expect(h.notify).not.toHaveBeenCalled();
  });

  it("stop() suppresses the notification for a result that arrives after stopping", async () => {
    const h = createHarness();
    const deferred = createDeferred<unknown>();
    h.waitForFinish.mockReturnValue(deferred.promise);

    const handle = h.start();
    await flush();
    handle.stop();
    deferred.resolve({
      status: "idle",
      final: { status: "idle", pendingPermissions: [] },
      lastMessage: "too late",
    });
    await flush();

    expect(h.notify).not.toHaveBeenCalled();
    expect(h.markFinished).not.toHaveBeenCalled();
  });
});
