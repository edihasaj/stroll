export type KeyboardFocusScope =
  | "terminal"
  | "message-input"
  | "command-center"
  | "editable"
  | "browser"
  | "other";

export type MessageInputKeyboardActionKind =
  | "focus"
  | "send"
  | "dictation-toggle"
  | "dictation-cancel"
  | "dictation-confirm"
  | "voice-toggle"
  | "voice-mute-toggle"
  | "mode-cycle";

export type KeyboardActionId =
  | "agent.interrupt"
  | "agent.new"
  | "workspace.tab.menu.open"
  | "workspace.tab.target.agent"
  | "workspace.tab.target.browser"
  | "workspace.tab.target.changes"
  | "workspace.tab.target.files"
  | "workspace.tab.close.current"
  | "workspace.tab.navigate.index"
  | "workspace.tab.navigate.relative"
  | "workspace.navigate.index"
  | "workspace.navigate.relative"
  | "sidebar.toggle.left"
  | "sidebar.toggle.right"
  | "sidebar.toggle.both"
  | "settings.toggle"
  | "command-center.toggle"
  | "command-center.files"
  | "shortcuts.dialog.toggle"
  | "workspace.terminal.new"
  | "workspace.new"
  | "workspace.project.pick"
  | "worktree.new"
  | "workspace.archive"
  | "workspace.pin"
  | "view.toggle.focus"
  | "view.toggle.full-view"
  | "theme.cycle"
  | "message-input.action";

export type KeyboardShortcutPayload =
  | { index: number }
  | { delta: 1 | -1 }
  | { kind: MessageInputKeyboardActionKind }
  | null;
