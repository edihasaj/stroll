import type { AgentProvider } from "@getpaseo/protocol/agent-types";
import type { Agent } from "@/stores/session-store";
import { isWorkspaceRootAgent } from "@/subagents/policies";
import {
  aggregateSidebarStateBuckets,
  deriveSidebarStateBucket,
  type SidebarStateBucket,
} from "@/utils/sidebar-agent-state";
import { workspaceAgentStatus } from "@/utils/workspace-agent-activity";
import { normalizeWorkspaceOpaqueId } from "@/utils/workspace-identity";
import { resolveChatTitle } from "@/workspace-tabs/chat-title";

/** Chats listed under a workspace row before "Show more". */
export const SIDEBAR_CHAT_LIMIT = 5;

/** What a sidebar chat row needs from an agent, flattened so rows compare by value. */
export interface SidebarChat {
  id: string;
  /** Null until the chat has a real title; the row shows a placeholder. */
  title: string | null;
  provider: AgentProvider;
  bucket: SidebarStateBucket;
  lastActivityAt: number;
}

export function toSidebarChat(agent: Agent): SidebarChat {
  return {
    id: agent.id,
    title: resolveChatTitle(agent.title),
    provider: agent.provider,
    bucket: deriveSidebarStateBucket({
      status: workspaceAgentStatus(agent),
      pendingPermissionCount: agent.pendingPermissions.length,
      requiresAttention: agent.requiresAttention,
      attentionReason: agent.attentionReason,
    }),
    lastActivityAt: agent.lastActivityAt.getTime(),
  };
}

function byMostRecentActivity(left: SidebarChat, right: SidebarChat): number {
  return right.lastActivityAt - left.lastActivityAt || left.id.localeCompare(right.id);
}

/**
 * Each workspace's active root chats, most recently active first, keyed by normalized workspace
 * id. Subagents are left out: they belong to their parent's subagents track, not the sidebar.
 */
export function buildWorkspaceChatIndex(
  agents: ReadonlyMap<string, Agent>,
): Map<string, readonly SidebarChat[]> {
  const chatsByWorkspaceId = new Map<string, SidebarChat[]>();
  for (const agent of agents.values()) {
    const workspaceId = normalizeWorkspaceOpaqueId(agent.workspaceId);
    if (agent.archivedAt || !workspaceId) {
      continue;
    }
    const parentAgent = agent.parentAgentId ? agents.get(agent.parentAgentId) : undefined;
    if (!isWorkspaceRootAgent(agent, parentAgent)) {
      continue;
    }
    const chats = chatsByWorkspaceId.get(workspaceId);
    if (chats) {
      chats.push(toSidebarChat(agent));
    } else {
      chatsByWorkspaceId.set(workspaceId, [toSidebarChat(agent)]);
    }
  }
  for (const chats of chatsByWorkspaceId.values()) {
    chats.sort(byMostRecentActivity);
  }
  return chatsByWorkspaceId;
}

export function isSameSidebarChat(left: SidebarChat, right: SidebarChat): boolean {
  return (
    left.id === right.id &&
    left.title === right.title &&
    left.provider === right.provider &&
    left.bucket === right.bucket &&
    left.lastActivityAt === right.lastActivityAt
  );
}

export function areSidebarChatsEqual(
  left: readonly SidebarChat[],
  right: readonly SidebarChat[],
): boolean {
  if (left === right) {
    return true;
  }
  if (left.length !== right.length) {
    return false;
  }
  return left.every((chat, index) => {
    const other = right[index];
    return other !== undefined && isSameSidebarChat(chat, other);
  });
}

export interface LimitedSidebarChats {
  visible: readonly SidebarChat[];
  /** Whether there are more chats than the limit, so the group needs a Show more toggle. */
  canToggle: boolean;
}

/**
 * Applies the "Show more" cap. The active chat stays visible even when it would fall past the cap,
 * taking the last visible slot, so the row the user is on never hides behind the toggle.
 */
export function limitSidebarChats(input: {
  chats: readonly SidebarChat[];
  expanded: boolean;
  activeChatId: string | null;
  limit?: number;
}): LimitedSidebarChats {
  const limit = input.limit ?? SIDEBAR_CHAT_LIMIT;
  const canToggle = input.chats.length > limit;
  if (input.expanded || !canToggle) {
    return { visible: input.chats, canToggle };
  }
  const head = input.chats.slice(0, limit);
  const active = input.chats.find((chat) => chat.id === input.activeChatId);
  if (!active || head.includes(active)) {
    return { visible: head, canToggle };
  }
  return { visible: [...head.slice(0, limit - 1), active], canToggle };
}

/** The most urgent status among chats, for the collapsed row that stands in for them. */
export function aggregateChatBucket(chats: readonly SidebarChat[]): SidebarStateBucket {
  return aggregateSidebarStateBuckets(chats.map((chat) => chat.bucket));
}
