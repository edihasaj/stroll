import type { Logger } from "pino";
import { z } from "zod";
import type {
  CreateAgentRequestOptions,
  DaemonClient,
} from "@getpaseo/client/internal/daemon-client";
import type { AgentPermissionRequest } from "@getpaseo/protocol/agent-types";
import type { AgentRoutePrivacy } from "@getpaseo/protocol/agent-route";
import {
  PARENT_COMPUTER_AGENT_LABEL,
  PARENT_COMPUTER_LABEL,
} from "@getpaseo/protocol/agent-labels";
import type { AgentSnapshotPayload } from "@getpaseo/protocol/messages";
import type { ResolvedDaemonPeer } from "@getpaseo/protocol/daemon-peer";
import { AGENT_WAIT_TIMEOUT_MS, resolveRequiredProviderModel } from "../agent/mcp-shared.js";
import { checkCreateAgentPrivacyGuard } from "../agent/routes/create-agent-privacy-guard.js";
import { expandUserPath, resolvePathFromBase } from "../path-utils.js";
import type { PeerPool } from "./peer-pool.js";
import type { RemoteSubagentRecord, RemoteSubagentRegistry } from "./remote-subagent-registry.js";

/**
 * `create_agent` raw args once `computer` is set. Looser than the local tool's own schemas
 * (defined privately inside `createPaseoToolCatalog`) because the outer tool schema has already
 * validated the shared fields (title, provider format, labels, settings, initialPrompt); this
 * only needs to read them back out and validate the remote-only ones (`computer`, `cwd`).
 */
const RemoteCreateAgentArgsSchema = z
  .object({
    title: z.string().trim().min(1, "Title is required"),
    provider: z.string().optional(),
    route: z.string().optional(),
    labels: z.record(z.string(), z.string()).optional(),
    settings: z
      .object({
        accountProfileId: z.string().nullable().optional(),
        modeId: z.string().optional(),
        thinkingOptionId: z.string().optional(),
        features: z.record(z.string(), z.unknown()).optional(),
      })
      .optional(),
    initialPrompt: z.string().trim().min(1, "initialPrompt is required"),
    computer: z.string().min(1),
    cwd: z.string().optional(),
    background: z.boolean().optional(),
    notifyOnFinish: z.boolean().optional(),
  })
  .passthrough();

type RemoteCreateAgentArgs = z.infer<typeof RemoteCreateAgentArgsSchema>;

/** Fields that imply a local workspace/worktree placement, unsupported with `computer` for now. */
const UNSUPPORTED_WITH_COMPUTER_KEYS = [
  "workspaceId",
  "workspace",
  "worktreeName",
  "branchName",
  "baseBranch",
  "refName",
  "githubPrNumber",
] as const;

function findUnsupportedArgWithComputer(args: unknown): string | null {
  if (!args || typeof args !== "object") {
    return null;
  }
  const input = args as Record<string, unknown>;
  return UNSUPPORTED_WITH_COMPUTER_KEYS.find((key) => input[key] !== undefined) ?? null;
}

/** Validates the raw args and returns the parsed remote-only fields, or throws a clear error. */
function parseRemoteCreateAgentArgs(rawArgs: unknown): RemoteCreateAgentArgs {
  const unsupported = findUnsupportedArgWithComputer(rawArgs);
  if (unsupported) {
    throw new Error(
      `create_agent with \`computer\` does not support \`${unsupported}\` yet. Create the agent ` +
        `without \`computer\` for that, or omit \`${unsupported}\` and point \`cwd\` at an ` +
        "existing directory on that computer.",
    );
  }
  const parsed = RemoteCreateAgentArgsSchema.parse(rawArgs);
  if (!parsed.provider && !parsed.route) {
    throw new Error(
      "create_agent with `computer` needs `route` or `provider` — the peer resolves routes and " +
        "profiles from its own config (see list_profiles on that computer).",
    );
  }
  return parsed;
}

/** "The explicit cwd arg, else the caller's cwd" (docs/peers.md), relative paths joined to it. */
export function resolveRemoteSubagentCwd(params: {
  callerCwd: string | undefined;
  requestedCwd: string | undefined;
}): string {
  const requested = params.requestedCwd?.trim();
  if (params.callerCwd) {
    return requested ? resolvePathFromBase(params.callerCwd, requested) : params.callerCwd;
  }
  if (!requested) {
    throw new Error("cwd is required when `computer` is set outside an agent-scoped session");
  }
  return expandUserPath(requested);
}

type CwdCheckClient = Pick<DaemonClient, "listDirectory">;

async function ensureCwdExistsOnPeer(
  client: CwdCheckClient,
  cwd: string,
  peerName: string,
): Promise<void> {
  try {
    await client.listDirectory(cwd, ".");
  } catch {
    throw new Error(`No directory ${cwd} on ${peerName}. Pass a cwd that exists there.`);
  }
}

export interface CreateRemoteSubagentDeps {
  peerPool: Pick<PeerPool, "get" | "connect">;
  registry: Pick<RemoteSubagentRegistry, "add">;
  /** Arms the finish watch for a newly-registered remote child; pre-bound to agentManager/agentStorage by the caller. */
  armWatch: (record: RemoteSubagentRecord) => void;
  serverId: string;
  logger: Logger;
}

export interface CreateRemoteSubagentContext {
  callerAgentId: string | undefined;
  callerRouteContext: { routeId: string; privacy: AgentRoutePrivacy } | null;
  /** The calling agent's own cwd on this daemon; absent for a top-level (no caller) call. */
  callerCwd: string | undefined;
}

export interface CreateRemoteSubagentResult {
  agentId: string;
  type: string;
  status: AgentSnapshotPayload["status"];
  cwd: string;
  computer: string;
  currentModeId: AgentSnapshotPayload["currentModeId"];
  availableModes: AgentSnapshotPayload["availableModes"];
  lastMessage: string | null;
  permission: AgentPermissionRequest | null;
  guidance?: string;
}

/** Resolves the peer and enforces the local-route guard (docs/agent-routes.md, docs/peers.md). */
function resolvePeerForCreate(
  peerPool: Pick<PeerPool, "get">,
  callerRouteContext: CreateRemoteSubagentContext["callerRouteContext"],
  computer: string,
): ResolvedDaemonPeer {
  const peer = peerPool.get(computer);
  const privacyViolation = checkCreateAgentPrivacyGuard(callerRouteContext, {
    kind: "peer",
    peerId: peer.id,
    peerName: peer.name,
    privacy: peer.privacy,
  });
  if (privacyViolation) {
    throw new Error(privacyViolation);
  }
  return peer;
}

/** The caller's labels plus the two parent-computer labels (docs/peers.md); never `paseo.parent-agent-id`. */
function buildRemoteSubagentLabels(
  parsed: RemoteCreateAgentArgs,
  context: CreateRemoteSubagentContext,
  serverId: string,
): Record<string, string> {
  const labels: Record<string, string> = {
    ...parsed.labels,
    [PARENT_COMPUTER_LABEL]: serverId,
  };
  if (context.callerAgentId) {
    labels[PARENT_COMPUTER_AGENT_LABEL] = context.callerAgentId;
  }
  return labels;
}

/** Mirrors the CLI's provider/route/settings mapping (packages/cli/src/commands/agent/run.ts). */
function buildPeerCreateAgentOptions(
  parsed: RemoteCreateAgentArgs,
  resolvedCwd: string,
  labels: Record<string, string>,
): CreateAgentRequestOptions {
  const providerModel = parsed.provider ? resolveRequiredProviderModel(parsed.provider) : undefined;
  return {
    // A route needs a truthy `provider` to satisfy the client's own validation; the peer
    // overrides it once the route resolves (mirrors `resolveRunProviderModel` in run.ts,
    // docs/agent-routes.md).
    provider: providerModel?.provider ?? parsed.route,
    ...(providerModel?.model ? { model: providerModel.model } : {}),
    ...(parsed.route ? { route: parsed.route } : {}),
    cwd: resolvedCwd,
    title: parsed.title,
    initialPrompt: parsed.initialPrompt,
    labels,
    ...(parsed.settings?.accountProfileId !== undefined
      ? { accountProfileId: parsed.settings.accountProfileId }
      : {}),
    ...(parsed.settings?.modeId !== undefined ? { modeId: parsed.settings.modeId } : {}),
    ...(parsed.settings?.thinkingOptionId !== undefined
      ? { thinkingOptionId: parsed.settings.thinkingOptionId }
      : {}),
    ...(parsed.settings?.features !== undefined ? { featureValues: parsed.settings.features } : {}),
  };
}

/** Registers the new remote child and arms its finish watch, when there is a caller to notify. */
async function registerRemoteChildIfNeeded(
  deps: CreateRemoteSubagentDeps,
  context: CreateRemoteSubagentContext,
  parsed: RemoteCreateAgentArgs,
  peer: ResolvedDaemonPeer,
  childAgentId: string,
): Promise<boolean> {
  const notifyOnFinish = parsed.notifyOnFinish ?? Boolean(context.callerAgentId);
  if (!context.callerAgentId || !notifyOnFinish) {
    return notifyOnFinish;
  }
  const record: RemoteSubagentRecord = {
    childAgentId,
    peerId: peer.id,
    parentAgentId: context.callerAgentId,
    title: parsed.title,
    createdAt: new Date().toISOString(),
    notifyOnFinish: true,
  };
  await deps.registry.add(record);
  deps.armWatch(record);
  return notifyOnFinish;
}

/** The result of waiting out a top-level (no caller) foreground create (docs/agent-lifecycle.md). */
async function buildForegroundCreateResult(
  client: Pick<DaemonClient, "waitForFinish">,
  snapshot: AgentSnapshotPayload,
  peer: ResolvedDaemonPeer,
  resolvedCwd: string,
): Promise<CreateRemoteSubagentResult> {
  const waited = await client.waitForFinish(snapshot.id, AGENT_WAIT_TIMEOUT_MS);
  const lastMessage =
    waited.status === "timeout"
      ? `Awaiting the agent timed out after ${AGENT_WAIT_TIMEOUT_MS / 1000}s. This does not mean ` +
        `it failed — it is still running on ${peer.name}. Call get_agent_status to check on it.`
      : waited.lastMessage;
  return {
    agentId: snapshot.id,
    type: snapshot.provider,
    status: waited.final?.status ?? snapshot.status,
    cwd: resolvedCwd,
    computer: peer.id,
    currentModeId: snapshot.currentModeId,
    availableModes: snapshot.availableModes,
    lastMessage,
    permission: waited.final?.pendingPermissions.at(-1) ?? null,
  };
}

function buildBackgroundCreateResult(
  snapshot: AgentSnapshotPayload,
  peer: ResolvedDaemonPeer,
  resolvedCwd: string,
  notifyOnFinish: boolean,
): CreateRemoteSubagentResult {
  const guidance = notifyOnFinish
    ? "You will get notified when the created agent finishes, errors, or needs permission. Do " +
      "not poll for status; continue with other work until the notification arrives."
    : undefined;
  return {
    agentId: snapshot.id,
    type: snapshot.provider,
    status: snapshot.status,
    cwd: resolvedCwd,
    computer: peer.id,
    currentModeId: snapshot.currentModeId,
    availableModes: snapshot.availableModes,
    lastMessage: null,
    permission: null,
    ...(guidance ? { guidance } : {}),
  };
}

/**
 * The `computer` branch of `create_agent` (docs/peers.md, docs/proposals/cross-host-subagents.md
 * step 2): creates the agent on a peer's daemon instead of this one, with the same label and
 * finish-notification contract a local subagent gets.
 */
export async function createRemoteSubagent(
  deps: CreateRemoteSubagentDeps,
  context: CreateRemoteSubagentContext,
  rawArgs: unknown,
): Promise<CreateRemoteSubagentResult> {
  const parsed = parseRemoteCreateAgentArgs(rawArgs);
  const peer = resolvePeerForCreate(deps.peerPool, context.callerRouteContext, parsed.computer);
  const resolvedCwd = resolveRemoteSubagentCwd({
    callerCwd: context.callerCwd,
    requestedCwd: parsed.cwd,
  });

  const { client } = await deps.peerPool.connect(parsed.computer);
  await ensureCwdExistsOnPeer(client, resolvedCwd, peer.name);
  deps.logger.info(
    { peerId: peer.id, cwd: resolvedCwd, callerAgentId: context.callerAgentId },
    "Creating subagent on peer",
  );

  const labels = buildRemoteSubagentLabels(parsed, context, deps.serverId);
  const snapshot = await client.createAgent(
    buildPeerCreateAgentOptions(parsed, resolvedCwd, labels),
  );
  const notifyOnFinish = await registerRemoteChildIfNeeded(
    deps,
    context,
    parsed,
    peer,
    snapshot.id,
  );

  // Agent-scoped creation is always asynchronous (docs/agent-lifecycle.md), so only a top-level
  // (no caller) call can wait here — and a top-level call has no parent to notify either way.
  const background = context.callerAgentId ? true : (parsed.background ?? false);
  return background
    ? buildBackgroundCreateResult(snapshot, peer, resolvedCwd, notifyOnFinish)
    : await buildForegroundCreateResult(client, snapshot, peer, resolvedCwd);
}
