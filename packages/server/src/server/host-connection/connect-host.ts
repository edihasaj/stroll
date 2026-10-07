import { WebSocket } from "ws";
import {
  buildDaemonWebSocketUrl,
  buildRelayWebSocketUrl,
  normalizeHostPort,
  parseConnectionUri,
  shouldUseTlsForDefaultHostedRelay,
} from "@getpaseo/protocol/daemon-endpoints";
import {
  parseConnectionOfferFromUrl,
  type ConnectionOffer,
} from "@getpaseo/protocol/connection-offer";
import { parseSshTransportUri } from "@getpaseo/protocol/ssh-transport";
import {
  DaemonClient,
  type DaemonClientConfig,
  type WebSocketLike,
} from "@getpaseo/client/internal/daemon-client";
import { createSshTunnel } from "./ssh-tunnel.js";

export { createSshTunnel, resolveSshFailureDetail, type SshTunnel } from "./ssh-tunnel.js";

/** The client identity a daemon presents when it dials a host. Mirrors the wire `hello.clientType`. */
export type DaemonClientType = NonNullable<DaemonClientConfig["clientType"]>;

type TransportTarget =
  | { type: "tcp"; url: string }
  | { type: "ipc"; url: string; socketPath: string };

type NodeWebSocketFactory = ReturnType<typeof createNodeWebSocketFactory>;

export interface ConnectDaemonHostOptions {
  /**
   * Any form `paseo --host` accepts: `ssh://`, `tcp://host:port[?ssl=true&password=…]`, a bare
   * `host:port`, a unix/pipe socket, or a pairing-offer URL.
   */
  host: string;
  clientId: string;
  /**
   * The union has no value for one daemon dialing another, so a peer connection presents as
   * "cli": the daemon dials peers with the same client code the CLI already uses to dial a
   * daemon (see docs/proposals/cross-host-subagents.md). "hub" is not a better fit — it names the
   * hosted Hub service's distinct trust principal, not a generic non-human client.
   */
  clientType: DaemonClientType;
  appVersion: string;
  timeoutMs: number;
  /** An explicit password, already resolved by the caller (for example from a target URI). */
  password?: string;
  /**
   * Lazily resolves a locally trusted credential token. Never consulted for `ssh://` targets,
   * matching the direct-connect behavior this replaces.
   */
  localCredential?: () => string | undefined;
}

export function normalizeDaemonHost(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("tcp://")) {
    try {
      const parsed = parseConnectionUri(trimmed);
      const endpoint = normalizeHostPort(
        parsed.isIpv6 ? `[${parsed.host}]:${parsed.port}` : `${parsed.host}:${parsed.port}`,
      );
      const query = new URLSearchParams();
      if (parsed.useTls) {
        query.set("ssl", "true");
      }
      if (parsed.password) {
        query.set("password", parsed.password);
      }
      const queryString = query.toString();
      const suffix = queryString ? `?${queryString}` : "";
      return `tcp://${endpoint}${suffix}`;
    } catch {
      return null;
    }
  }

  if (
    trimmed.startsWith("unix://") ||
    trimmed.startsWith("pipe://") ||
    trimmed.startsWith("\\\\.\\pipe\\")
  ) {
    return trimmed.startsWith("\\\\.\\pipe\\") ? `pipe://${trimmed}` : trimmed;
  }

  if (trimmed.startsWith("/") || trimmed.startsWith("~")) {
    return `unix://${trimmed}`;
  }

  // Windows absolute paths (e.g. C:\Users\foo) are filesystem paths, not TCP or IPC targets.
  if (/^[A-Za-z]:[/\\]/.test(trimmed)) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    return `127.0.0.1:${trimmed}`;
  }

  return trimmed.includes(":") ? trimmed : null;
}

function stripIpcPrefix(trimmed: string): string {
  if (trimmed.startsWith("unix://")) return trimmed.slice("unix://".length).trim();
  if (trimmed.startsWith("pipe://")) return trimmed.slice("pipe://".length).trim();
  return trimmed;
}

export function resolveDaemonTarget(host: string): TransportTarget {
  const trimmed = normalizeDaemonHost(host);
  if (!trimmed) {
    throw new Error(`Invalid daemon target: ${host}`);
  }
  if (
    trimmed.startsWith("unix://") ||
    trimmed.startsWith("pipe://") ||
    trimmed.startsWith("\\\\.\\pipe\\")
  ) {
    const socketPath = stripIpcPrefix(trimmed);
    if (!socketPath) {
      throw new Error("Invalid IPC daemon target: missing socket path");
    }
    const isUnixSocket = trimmed.startsWith("unix://");
    return {
      type: "ipc",
      url: isUnixSocket ? `ws+unix://${socketPath}:/ws` : "ws://localhost/ws",
      socketPath,
    };
  }

  if (trimmed.startsWith("tcp://")) {
    const parsed = parseConnectionUri(trimmed);
    const endpoint = normalizeHostPort(
      parsed.isIpv6 ? `[${parsed.host}]:${parsed.port}` : `${parsed.host}:${parsed.port}`,
    );
    return {
      type: "tcp",
      url: buildDaemonWebSocketUrl(endpoint, { useTls: parsed.useTls }),
    };
  }

  return {
    type: "tcp",
    url: `ws://${trimmed}/ws`,
  };
}

/** Reads the `password` query parameter off a `tcp://` target URI. Pure: never reads env. */
export function parsePasswordFromHost(host: string): string | undefined {
  const trimmed = host.trim();
  if (!trimmed.startsWith("tcp://")) {
    return undefined;
  }
  const fromUri = parseConnectionUri(trimmed).password;
  return fromUri ? fromUri : undefined;
}

function createNodeWebSocketFactory() {
  return (
    url: string,
    options?: { headers?: Record<string, string>; protocols?: string[]; socketPath?: string },
  ): WebSocketLike => {
    return new WebSocket(url, options?.protocols, {
      headers: options?.headers,
      ...(options?.socketPath ? { socketPath: options.socketPath } : {}),
    }) as unknown as WebSocketLike;
  };
}

interface TryConnectHostParams {
  host: string;
  clientId: string;
  clientType: DaemonClientType;
  appVersion: string;
  timeoutMs: number;
  password?: string;
  localCredential?: () => string | undefined;
  webSocketFactory: NodeWebSocketFactory;
}

async function tryConnectHost(
  params: TryConnectHostParams,
): Promise<{ client: DaemonClient } | { error: unknown }> {
  const target = resolveDaemonTarget(params.host);
  const client = new DaemonClient({
    url: target.url,
    clientId: params.clientId,
    clientType: params.clientType,
    appVersion: params.appVersion,
    ...(params.password ? { password: params.password } : {}),
    ...(params.localCredential ? { localCredential: params.localCredential } : {}),
    connectTimeoutMs: params.timeoutMs,
    webSocketFactory: (
      url: string,
      config?: { headers?: Record<string, string>; protocols?: string[] },
    ) =>
      params.webSocketFactory(url, {
        headers: config?.headers,
        protocols: config?.protocols,
        ...(target.type === "ipc" ? { socketPath: target.socketPath } : {}),
      }),
    reconnect: { enabled: false },
  });

  try {
    await client.connect();
    return { client };
  } catch (error) {
    await client.close().catch(() => {});
    return { error };
  }
}

interface ConnectViaRelayOfferParams {
  clientId: string;
  clientType: DaemonClientType;
  appVersion: string;
  timeoutMs: number;
  webSocketFactory: NodeWebSocketFactory;
}

async function connectViaRelayOffer(
  offer: ConnectionOffer,
  params: ConnectViaRelayOfferParams,
): Promise<DaemonClient> {
  const url = buildRelayWebSocketUrl({
    endpoint: offer.relay.endpoint,
    serverId: offer.serverId,
    role: "client",
    useTls: offer.relay.useTls ?? shouldUseTlsForDefaultHostedRelay(offer.relay.endpoint),
  });

  const client = new DaemonClient({
    url,
    clientId: params.clientId,
    clientType: params.clientType,
    appVersion: params.appVersion,
    connectTimeoutMs: params.timeoutMs,
    webSocketFactory: (
      target: string,
      config?: { headers?: Record<string, string>; protocols?: string[] },
    ) =>
      params.webSocketFactory(target, { headers: config?.headers, protocols: config?.protocols }),
    e2ee: { enabled: true, daemonPublicKeyB64: offer.daemonPublicKeyB64 },
    reconnect: { enabled: false },
  });

  try {
    await client.connect();
    return client;
  } catch (error) {
    await client.close().catch(() => {});
    const message = error instanceof Error ? error.message : String(error);
    const lastError = client.lastError ? ` (${client.lastError})` : "";
    throw new Error(`Failed to connect via relay offer: ${message}${lastError}`, { cause: error });
  }
}

function parseHostOfferOrNull(host: string): ConnectionOffer | null {
  try {
    return parseConnectionOfferFromUrl(host);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Invalid pairing offer URL: ${message}`, { cause: error });
  }
}

/**
 * Dials a daemon host and returns a connected `DaemonClient`. Used by the CLI to reach the
 * daemon a user selected, and by the daemon's `PeerPool` to reach another daemon it peers with.
 * Never reads `process.env`: every credential is supplied by the caller, so a daemon dialing a
 * peer cannot leak its own `PASEO_PASSWORD` to that peer.
 */
export async function connectDaemonHost(options: ConnectDaemonHostOptions): Promise<DaemonClient> {
  const deadline = Date.now() + options.timeoutMs;
  const remainingMs = () => Math.max(1, deadline - Date.now());
  const webSocketFactory = createNodeWebSocketFactory();
  const trimmedHost = options.host.trim();

  if (trimmedHost.startsWith("ssh://")) {
    const target = parseSshTransportUri(trimmedHost);
    const tunnel = await createSshTunnel(target);
    const result = await tryConnectHost({
      host: tunnel.endpoint,
      clientId: options.clientId,
      clientType: options.clientType,
      appVersion: options.appVersion,
      timeoutMs: remainingMs(),
      password: options.password,
      webSocketFactory,
    });
    if ("client" in result) {
      const close = result.client.close.bind(result.client);
      result.client.close = async () => {
        try {
          await close();
        } finally {
          tunnel.close();
        }
      };
      return result.client;
    }

    const failure = tunnel.failureDetail();
    tunnel.close();
    if (failure) throw new Error(`SSH connection failed: ${failure}`, { cause: result.error });
    throw result.error;
  }

  const offer = parseHostOfferOrNull(trimmedHost);
  if (offer) {
    return connectViaRelayOffer(offer, {
      clientId: options.clientId,
      clientType: options.clientType,
      appVersion: options.appVersion,
      timeoutMs: remainingMs(),
      webSocketFactory,
    });
  }

  const result = await tryConnectHost({
    host: trimmedHost,
    clientId: options.clientId,
    clientType: options.clientType,
    appVersion: options.appVersion,
    timeoutMs: remainingMs(),
    password: options.password,
    localCredential: options.localCredential,
    webSocketFactory,
  });
  if ("client" in result) return result.client;
  throw result.error;
}
