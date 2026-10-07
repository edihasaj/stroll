import { describe, expect, it } from "vitest";
import { rearmIfRequested } from "./remote-subagent-followups.js";
import type { RemoteSubagentRecord } from "./remote-subagent-registry.js";

const FINISHED: RemoteSubagentRecord = {
  childAgentId: "child",
  peerId: "macbook",
  parentAgentId: "parent",
  title: "remote child",
  createdAt: "2026-10-07T13:46:15.000Z",
  notifyOnFinish: true,
  finishedAt: "2026-10-07T13:46:25.000Z",
};

function recorder() {
  const saved: RemoteSubagentRecord[] = [];
  const armed: RemoteSubagentRecord[] = [];
  return {
    saved,
    armed,
    deps: {
      saveRecord: async (record: RemoteSubagentRecord) => {
        saved.push(record);
      },
      armWatch: (record: RemoteSubagentRecord) => {
        armed.push(record);
      },
    },
  };
}

describe("rearmIfRequested", () => {
  it("re-arms a child that already finished once, clearing its finish", async () => {
    const { deps, saved, armed } = recorder();
    await rearmIfRequested(deps, FINISHED, true);
    expect(saved).toHaveLength(1);
    expect(saved[0]?.finishedAt).toBeUndefined();
    expect(armed).toEqual(saved);
  });

  it("turns notifications on for a child created without them", async () => {
    const { deps, armed } = recorder();
    const { finishedAt: _finishedAt, ...running } = FINISHED;
    await rearmIfRequested(deps, { ...running, notifyOnFinish: false }, true);
    expect(armed[0]?.notifyOnFinish).toBe(true);
  });

  it("leaves the record alone when the caller does not want a notification", async () => {
    const { deps, saved, armed } = recorder();
    await rearmIfRequested(deps, FINISHED, false);
    expect(saved).toEqual([]);
    expect(armed).toEqual([]);
  });
});
