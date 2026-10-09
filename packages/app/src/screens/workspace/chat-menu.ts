import type { WorkspaceTabMenuEntry } from "@/screens/workspace/workspace-tab-menu";

export interface ChatMenuLabels {
  rename: string;
  copyResumeCommand: string;
  copyAgentId: string;
  archiveChat: string;
  deleteChat: string;
}

/** Each surface passes the actions it offers; an entry appears only when its action is given. */
export interface ChatMenuActions {
  onRename?: () => void;
  onCopyResumeCommand?: () => void;
  onCopyAgentId?: () => void;
  onArchive?: () => void;
  onDelete?: () => void;
}

interface BuildChatMenuEntriesInput {
  agentId: string;
  menuTestIDBase: string;
  labels: ChatMenuLabels;
  actions: ChatMenuActions;
}

type ChatMenuItemEntry = Extract<WorkspaceTabMenuEntry, { kind: "item" }>;

/**
 * The menu of one chat, shared by the sidebar row and the chat header. Entry keys and test ids
 * follow the agent tab menu (`workspace-tab-menu.ts`) so the same action is named the same way
 * wherever it is offered.
 */
export function buildChatMenuEntries(input: BuildChatMenuEntriesInput): WorkspaceTabMenuEntry[] {
  const { agentId, menuTestIDBase, labels, actions } = input;
  const manage: ChatMenuItemEntry[] = [];
  if (actions.onRename) {
    manage.push({
      kind: "item",
      key: "rename",
      label: labels.rename,
      icon: "pencil",
      testID: `${menuTestIDBase}-rename`,
      onSelect: actions.onRename,
    });
  }
  if (actions.onCopyResumeCommand) {
    manage.push({
      kind: "item",
      key: "copy-resume-command",
      label: labels.copyResumeCommand,
      icon: "copy",
      testID: `${menuTestIDBase}-copy-resume-command`,
      onSelect: actions.onCopyResumeCommand,
    });
  }
  if (actions.onCopyAgentId) {
    manage.push({
      kind: "item",
      key: "copy-agent-id",
      label: labels.copyAgentId,
      icon: "copy",
      hint: agentId.slice(0, 7),
      testID: `${menuTestIDBase}-copy-agent-id`,
      onSelect: actions.onCopyAgentId,
    });
  }

  const retire: ChatMenuItemEntry[] = [];
  if (actions.onArchive) {
    retire.push({
      kind: "item",
      key: "archive",
      label: labels.archiveChat,
      icon: "archive",
      testID: `${menuTestIDBase}-archive`,
      onSelect: actions.onArchive,
    });
  }
  if (actions.onDelete) {
    retire.push({
      kind: "item",
      key: "delete-agent",
      label: labels.deleteChat,
      icon: "trash",
      destructive: true,
      testID: `${menuTestIDBase}-delete-agent`,
      onSelect: actions.onDelete,
    });
  }

  const separator: WorkspaceTabMenuEntry[] =
    manage.length > 0 && retire.length > 0 ? [{ kind: "separator", key: "retire-separator" }] : [];
  return [...manage, ...separator, ...retire];
}
