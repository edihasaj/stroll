import type { SidebarStateBucket } from "@/utils/sidebar-agent-state";
import { resolveRowLabel } from "./track-presentation";

export type SubagentOpenTarget =
  | { kind: "agent"; agentId: string }
  | { kind: "provider_subagent"; parentAgentId: string; subagentId: string };

export interface SubagentRowStatusText {
  key:
    | "subagents.statusWorking"
    | "subagents.statusNeedsPermission"
    | "subagents.statusDone"
    | "subagents.statusFailed"
    | "subagents.statusFailedGeneric";
  params?: { reason: string };
}

export interface SubagentToolCallRowPresentation {
  /** Managed agent title, else the task description, else the native subagent type. */
  title: string;
  titleState: "ready" | "loading";
  /** Quiet secondary line: a route id, or "provider · model" / "subAgentType · provider". */
  meta: string;
  statusBucket: SidebarStateBucket;
  statusText: SubagentRowStatusText;
  /** Elapsed-time anchor. `null` when no timing is known yet (e.g. an unmapped native row). */
  startedAt: Date | null;
  isRunning: boolean;
  /** When the row finished. Meaningful only once `isRunning` is false. */
  endedAt: Date | null;
  /** Where clicking the row navigates. `null` means no reliable target — never a dead control. */
  openTarget: SubagentOpenTarget | null;
}

interface SubagentStatusInput {
  isRunning: boolean;
  /** Blocked on a live permission decision right now — only ever true for managed rows. */
  needsPermission: boolean;
  isFailed: boolean;
  /** First line of the failure reason, when known. */
  failureReason: string | null;
}

interface SubagentStatus {
  bucket: SidebarStateBucket;
  text: SubagentRowStatusText;
}

function resolveSubagentStatus(input: SubagentStatusInput): SubagentStatus {
  if (input.needsPermission) {
    return { bucket: "needs_input", text: { key: "subagents.statusNeedsPermission" } };
  }
  if (input.isRunning) {
    return { bucket: "running", text: { key: "subagents.statusWorking" } };
  }
  if (input.isFailed) {
    return input.failureReason
      ? {
          bucket: "failed",
          text: { key: "subagents.statusFailed", params: { reason: input.failureReason } },
        }
      : { bucket: "failed", text: { key: "subagents.statusFailedGeneric" } };
  }
  return { bucket: "done", text: { key: "subagents.statusDone" } };
}

/** The first line of a multi-line message, trimmed — `null` for empty or missing text. */
export function firstLine(text: string | null | undefined): string | null {
  if (!text) return null;
  const trimmed = text.trim();
  if (!trimmed) return null;
  const newlineIndex = trimmed.indexOf("\n");
  return newlineIndex === -1 ? trimmed : trimmed.slice(0, newlineIndex).trim();
}

function joinMeta(parts: ReadonlyArray<string | null>): string {
  return parts.filter((part): part is string => Boolean(part)).join(" · ");
}

export interface ManagedSubagentLiveFields {
  title: string | null;
  provider: string;
  model: string | null;
  /** `agent.labels["stroll.route"]`, when the agent started on a route. */
  routeId: string | null;
  isRunning: boolean;
  startedAt: Date;
  endedAt: Date;
  pendingPermissionCount: number;
  isFailed: boolean;
  lastError: string | null;
}

export interface ManagedSubagentRowInput {
  agentId: string;
  /** `null` while the `create_agent` result is known but the agent record hasn't hydrated yet. */
  agent: ManagedSubagentLiveFields | null;
  /** The `create_agent` call's own task description — a title fallback before the agent names itself. */
  toolCallDescription: string | null;
}

/** Builds the compact row for a Paseo `create_agent` call — a managed subagent with a real id. */
export function buildManagedSubagentRowPresentation(
  input: ManagedSubagentRowInput,
): SubagentToolCallRowPresentation {
  const openTarget: SubagentOpenTarget = { kind: "agent", agentId: input.agentId };
  const fallbackTitle = resolveRowLabel(input.toolCallDescription) ?? "";

  if (!input.agent) {
    return {
      title: fallbackTitle,
      titleState: fallbackTitle ? "ready" : "loading",
      meta: "",
      statusBucket: "running",
      statusText: { key: "subagents.statusWorking" },
      startedAt: null,
      isRunning: true,
      endedAt: null,
      openTarget,
    };
  }

  const { agent } = input;
  const title = resolveRowLabel(agent.title) ?? fallbackTitle;
  const status = resolveSubagentStatus({
    isRunning: agent.isRunning,
    needsPermission: agent.pendingPermissionCount > 0,
    isFailed: agent.isFailed,
    failureReason: firstLine(agent.lastError),
  });

  return {
    title,
    titleState: title ? "ready" : "loading",
    meta: agent.routeId ?? joinMeta([agent.provider, agent.model]),
    statusBucket: status.bucket,
    statusText: status.text,
    startedAt: agent.startedAt,
    isRunning: agent.isRunning,
    endedAt: agent.endedAt,
    openTarget,
  };
}

export interface NativeSubagentDescriptorFields {
  isRunning: boolean;
  isFailed: boolean;
  startedAt: Date;
  endedAt: Date;
}

export interface NativeSubagentRowInput {
  provider: string;
  subAgentType: string | null;
  description: string | null;
  parentAgentId: string;
  /** Resolved by `resolveNativeProviderSubagentId`; `null` when no provider has a reliable mapping. */
  mappedSubagentId: string | null;
  /** The live provider-subagent-store descriptor, when `mappedSubagentId` resolved to one that exists. */
  descriptor: NativeSubagentDescriptorFields | null;
  /** The tool call's own status — always known, used when there is no live descriptor to read. */
  toolCallStatus: "executing" | "running" | "completed" | "failed" | "canceled";
}

/** Builds the compact row for a native provider spawn (Claude Task, Codex spawnAgent, OMP task, …). */
export function buildNativeSubagentRowPresentation(
  input: NativeSubagentRowInput,
): SubagentToolCallRowPresentation {
  const title = resolveRowLabel(input.description) ?? resolveRowLabel(input.subAgentType) ?? "";
  const meta = joinMeta([resolveRowLabel(input.subAgentType), resolveRowLabel(input.provider)]);
  const openTarget: SubagentOpenTarget | null = input.mappedSubagentId
    ? {
        kind: "provider_subagent",
        parentAgentId: input.parentAgentId,
        subagentId: input.mappedSubagentId,
      }
    : null;

  const isRunning = input.descriptor
    ? input.descriptor.isRunning
    : input.toolCallStatus === "running" || input.toolCallStatus === "executing";
  const isFailed = input.descriptor ? input.descriptor.isFailed : input.toolCallStatus === "failed";
  const status = resolveSubagentStatus({
    isRunning,
    needsPermission: false,
    isFailed,
    failureReason: null,
  });

  return {
    title,
    titleState: title ? "ready" : "loading",
    meta,
    statusBucket: status.bucket,
    statusText: status.text,
    startedAt: input.descriptor?.startedAt ?? null,
    isRunning,
    endedAt: input.descriptor?.endedAt ?? null,
    openTarget,
  };
}
