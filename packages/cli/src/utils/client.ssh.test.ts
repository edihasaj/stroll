import { beforeEach, describe, expect, it, vi } from "vitest";
import { connectToDaemon } from "./client.js";

const mocks = vi.hoisted(() => ({
  connectDaemonHost: vi.fn(),
}));

vi.mock("@getpaseo/server/host-connection", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@getpaseo/server/host-connection")>()),
  connectDaemonHost: mocks.connectDaemonHost,
}));
vi.mock("./client-id.js", () => ({ getOrCreateCliClientId: async () => "cli-test-id" }));

describe("CLI SSH transport", () => {
  beforeEach(() => {
    mocks.connectDaemonHost.mockReset();
    mocks.connectDaemonHost.mockResolvedValue({ close: async () => {}, lastError: null });
  });

  it("delegates an SSH host to connectDaemonHost with the CLI client identity", async () => {
    await connectToDaemon({
      target: { kind: "endpoint", host: "ssh://deploy@build-box:2222?daemonPort=7777" },
    });

    expect(mocks.connectDaemonHost).toHaveBeenCalledTimes(1);
    expect(mocks.connectDaemonHost).toHaveBeenCalledWith(
      expect.objectContaining({
        host: "ssh://deploy@build-box:2222?daemonPort=7777",
        clientId: "cli-test-id",
        clientType: "cli",
      }),
    );
  });
});
