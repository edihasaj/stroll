import { beforeEach, describe, expect, it, vi } from "vitest";
import { connectDaemonHost } from "./connect-host.js";

const mocks = vi.hoisted(() => ({
  configs: [] as Array<Record<string, unknown>>,
  createSshTunnel: vi.fn(),
}));

vi.mock("@getpaseo/client/internal/daemon-client", () => ({
  DaemonClient: class {
    lastError = null;
    close = async () => {};
    constructor(config: Record<string, unknown>) {
      mocks.configs.push(config);
    }
    async connect() {}
  },
}));

vi.mock("./ssh-tunnel.js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("./ssh-tunnel.js")>()),
  createSshTunnel: mocks.createSshTunnel,
}));

describe("connectDaemonHost", () => {
  beforeEach(() => {
    mocks.configs.length = 0;
    mocks.createSshTunnel.mockReset();
    mocks.createSshTunnel.mockResolvedValue({
      endpoint: "127.0.0.1:4567",
      close: vi.fn(),
      failureDetail: () => null,
    });
  });

  it("tunnels an ssh:// host and connects through the local tunnel endpoint", async () => {
    await connectDaemonHost({
      host: "ssh://deploy@build-box:2222?daemonPort=7777",
      clientId: "peer-test-id",
      clientType: "cli",
      appVersion: "0.1.70",
      timeoutMs: 5_000,
    });

    expect(mocks.createSshTunnel).toHaveBeenCalledWith({
      host: "deploy@build-box",
      sshPort: 2222,
      daemonPort: 7777,
    });
    expect(mocks.configs[0]).toMatchObject({
      url: "ws://127.0.0.1:4567/ws",
      clientId: "peer-test-id",
      clientType: "cli",
    });
  });

  it("closes the SSH tunnel when the returned client closes", async () => {
    const closeTunnel = vi.fn();
    mocks.createSshTunnel.mockResolvedValue({
      endpoint: "127.0.0.1:4567",
      close: closeTunnel,
      failureDetail: () => null,
    });

    const client = await connectDaemonHost({
      host: "ssh://deploy@build-box",
      clientId: "peer-test-id",
      clientType: "cli",
      appVersion: "0.1.70",
      timeoutMs: 5_000,
    });
    await client.close();

    expect(closeTunnel).toHaveBeenCalledTimes(1);
  });

  it("never forwards a local credential resolver over an ssh:// target", async () => {
    await connectDaemonHost({
      host: "ssh://deploy@build-box",
      clientId: "peer-test-id",
      clientType: "cli",
      appVersion: "0.1.70",
      timeoutMs: 5_000,
      localCredential: () => "should-not-be-sent",
    });

    expect(mocks.configs.at(-1)).not.toHaveProperty("localCredential");
  });

  it("connects a plain host directly and forwards the resolved password", async () => {
    await connectDaemonHost({
      host: "127.0.0.1:6768",
      clientId: "peer-test-id",
      clientType: "cli",
      appVersion: "0.1.70",
      timeoutMs: 5_000,
      password: "secret",
    });

    expect(mocks.createSshTunnel).not.toHaveBeenCalled();
    expect(mocks.configs.at(-1)).toMatchObject({
      url: "ws://127.0.0.1:6768/ws",
      clientId: "peer-test-id",
      clientType: "cli",
      password: "secret",
    });
  });
});
