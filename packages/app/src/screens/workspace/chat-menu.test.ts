import { describe, expect, it, vi } from "vitest";
import { buildChatMenuEntries, type ChatMenuLabels } from "./chat-menu";

const labels: ChatMenuLabels = {
  rename: "Rename",
  copyResumeCommand: "Copy resume command",
  copyAgentId: "Copy agent id",
  reloadAgent: "Reload agent",
  archiveChat: "Archive chat",
  deleteChat: "Delete chat",
};

function summarize(entries: ReturnType<typeof buildChatMenuEntries>) {
  return entries.map((entry) => (entry.kind === "separator" ? "---" : entry.label));
}

describe("buildChatMenuEntries", () => {
  it("offers Rename, Archive, and Delete chat for a sidebar row", () => {
    const entries = buildChatMenuEntries({
      agentId: "agent-123456789",
      menuTestIDBase: "sidebar-chat-menu-s:agent-123456789",
      labels,
      actions: { onRename: vi.fn(), onArchive: vi.fn(), onDelete: vi.fn() },
    });

    expect(summarize(entries)).toEqual(["Rename", "---", "Archive chat", "Delete chat"]);
  });

  it("offers Copy resume command, Copy agent id, Archive, and Delete chat for the chat header", () => {
    const entries = buildChatMenuEntries({
      agentId: "agent-123456789",
      menuTestIDBase: "chat-pane-menu",
      labels,
      actions: {
        onCopyResumeCommand: vi.fn(),
        onCopyAgentId: vi.fn(),
        onArchive: vi.fn(),
        onDelete: vi.fn(),
      },
    });

    expect(summarize(entries)).toEqual([
      "Copy resume command",
      "Copy agent id",
      "---",
      "Archive chat",
      "Delete chat",
    ]);
  });

  it("marks Delete chat destructive and keeps the tab menu's ids", () => {
    const entries = buildChatMenuEntries({
      agentId: "agent-123456789",
      menuTestIDBase: "base",
      labels,
      actions: { onCopyAgentId: vi.fn(), onArchive: vi.fn(), onDelete: vi.fn() },
    });
    const items = entries.flatMap((entry) => (entry.kind === "item" ? [entry] : []));

    expect(items.map((entry) => entry.testID)).toEqual([
      "base-copy-agent-id",
      "base-archive",
      "base-delete-agent",
    ]);
    expect(items.find((entry) => entry.key === "delete-agent")?.destructive).toBe(true);
    expect(items.find((entry) => entry.key === "copy-agent-id")?.hint).toBe("agent-1");
  });

  it("runs the action each entry was built with", () => {
    const onArchive = vi.fn();
    const onDelete = vi.fn();
    const entries = buildChatMenuEntries({
      agentId: "agent-1",
      menuTestIDBase: "base",
      labels,
      actions: { onArchive, onDelete },
    });
    for (const entry of entries) {
      if (entry.kind === "item") entry.onSelect();
    }

    expect(onArchive).toHaveBeenCalledTimes(1);
    expect(onDelete).toHaveBeenCalledTimes(1);
  });

  it("leaves out entries whose action is not offered and drops a lone separator", () => {
    expect(
      summarize(
        buildChatMenuEntries({
          agentId: "agent-1",
          menuTestIDBase: "base",
          labels,
          actions: { onArchive: vi.fn() },
        }),
      ),
    ).toEqual(["Archive chat"]);
  });
});
