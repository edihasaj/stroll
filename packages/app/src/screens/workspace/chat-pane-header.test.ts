import { describe, expect, it, vi } from "vitest";
import { buildChatMenuEntries, type ChatMenuLabels } from "./chat-menu";

// The header offers the menu below; the rename lives on the title. This pins the header's menu so
// a new entry or a lost one shows up here, next to the tab menu's own test.
const labels: ChatMenuLabels = {
  rename: "Rename",
  copyResumeCommand: "Copy resume command",
  copyAgentId: "Copy agent id",
  reloadAgent: "Reload agent",
  archiveChat: "Archive chat",
  deleteChat: "Delete chat",
};

describe("chat pane header menu", () => {
  const actions = {
    onCopyResumeCommand: vi.fn(),
    onCopyAgentId: vi.fn(),
    onReload: vi.fn(),
    onArchive: vi.fn(),
    onDelete: vi.fn(),
  };
  const entries = buildChatMenuEntries({
    agentId: "agent-abcdef123",
    menuTestIDBase: "chat-pane-menu",
    labels,
    actions,
  });

  it("lists the copy actions, Reload agent, Archive, and Delete chat", () => {
    expect(entries.flatMap((entry) => (entry.kind === "item" ? [entry.label] : []))).toEqual([
      "Copy resume command",
      "Copy agent id",
      "Reload agent",
      "Archive chat",
      "Delete chat",
    ]);
  });

  it("shows the start of the agent id beside Copy agent id", () => {
    const copyId = entries.find((entry) => entry.kind === "item" && entry.key === "copy-agent-id");

    expect(copyId).toMatchObject({ hint: "agent-a", testID: "chat-pane-menu-copy-agent-id" });
  });

  it("separates the copy actions from Archive and Delete chat, and marks Delete chat destructive", () => {
    expect(entries.map((entry) => entry.kind)).toEqual([
      "item",
      "item",
      "item",
      "separator",
      "item",
      "item",
    ]);
    expect(entries.at(-1)).toMatchObject({ key: "delete-agent", destructive: true });
  });

  it("runs the matching action when an entry is chosen", () => {
    for (const entry of entries) {
      if (entry.kind === "item") entry.onSelect();
    }

    expect(actions.onCopyResumeCommand).toHaveBeenCalledTimes(1);
    expect(actions.onCopyAgentId).toHaveBeenCalledTimes(1);
    expect(actions.onReload).toHaveBeenCalledTimes(1);
    expect(actions.onArchive).toHaveBeenCalledTimes(1);
    expect(actions.onDelete).toHaveBeenCalledTimes(1);
  });
});
