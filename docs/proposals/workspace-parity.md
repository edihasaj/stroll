# Proposal: one chat, one panel (workspace parity with Codex)

Status: proposal. Follows the parity work already shipped (`ui/sidebar-parity`, `ui/timeline-parity`,
`ui/composer-parity`) and [docs/ui-gap-gpt.md](../ui-gap-gpt.md).

## Goal

Make the workspace work like the Codex desktop app and remove what that makes redundant:

- The main view shows one chat. Chats are switched from the sidebar and the Command Center, not
  from a tab row.
- Everything else opens in one right-hand panel: files, folders, diffs and changes, terminal,
  browser, subagents, pull requests, setup, plugin views. One view at a time, a switcher at the
  top, a drag handle to widen it, and **Full view** (`Cmd+Shift+B`) to cover the chat with it.
- Plain chatting (no project) and browsing work from every entry point.
- Settings keep what matters, merge one-option pages, and add what Codex has and Stroll lacks.
  Host and daemon settings stay as they are.

Codex's own layout, for reference: a single right panel with Files, Terminal, Browser, and Diff,
one shown at a time, plus "Enter full view"; no tiling or multi-window support
([Codex what's new](https://learn.chatgpt.com/docs/whats-new), open request
[openai/codex#33301](https://github.com/openai/codex/issues/33301)).

## What changes

### Main view

- No tab row. Opening a chat from the sidebar, a notification, a link, or the Command Center
  replaces the main view. Back and forward move between recently opened chats.
- The sidebar already lists a workspace's chats and nests subagents under their parent; it becomes
  the only switcher.
- Archiving a chat is an explicit action (sidebar row menu, chat menu, `Cmd+W` asks first). Today
  closing a root agent's tab archives it; with no tabs, that rule moves to the explicit action and
  [agent-lifecycle.md](../agent-lifecycle.md) "Tabs vs archive" is rewritten accordingly. Subagents
  still detach or archive the way they do now.

### Right panel

- Built on the existing side pane and Maximize/Restore (`docs/explorer-sidebar.md`,
  `workspace-layout-store.ts`). Width persists per workspace, as today.
- Splits are removed. A workspace has the main view, the right panel, and the Explorer sidebar.
- `openInSidePane` decides what opens in the panel versus the main view; it gains `browser`, and
  pull request, file, folder, setup, and plugin views read the same preference instead of their own
  rules.
- Compact layouts already show one view at a time; the panel becomes the existing sheet there.

### Persisted layouts

`WORKSPACE_LAYOUT_PERSIST_VERSION` goes from 2 to 3. The migration keeps the active chat in the
main view, leaves other chats in the sidebar (they are not closed or archived), moves every
non-chat view into the panel with the last active one showing, and drops split sizes. It gets the
same fixture tests as the v1→v2 migration before it ships.

### Settings

| Change                        | Why                                                                |
| ----------------------------- | ------------------------------------------------------------------ |
| Editor → General              | One toggle (Vim keys) does not need a page                         |
| Browser data → Diagnostics    | One button (clear browser data)                                    |
| Integrations → About          | One row (install the CLI) next to version and updates              |
| Permissions → Notifications   | One row (microphone); frees the name for agent permissions         |
| Add **Worktrees**             | Where worktrees live, how many to keep, and which to pin, as Codex |
| Add **MCP servers** if absent | List, add, and remove servers; today there is only a toggle        |

Per-chat approval and sandbox already exist as the mode control in the composer, so nothing new
is added there.

## Phases

1. Right panel: one panel with a switcher, Full view and its shortcut, browser in the panel by
   default. Done.
2. One chat in the main view: remove the tab row and splits, the layout v3 migration, explicit
   archive, back and forward.
3. Settings: the merges and the two additions.
4. End-to-end tests: about 58 of 216 browser specs use tab ids and move to the panel and sidebar.

Each phase ships on its own and keeps the suite green.

## Risks

- People who split the workspace into three or more views lose that. The release notes say so.
- A migration bug could lose open views on upgrade; fixtures from real persisted layouts guard it.
- Compact and native layouts need their own pass (`docs/mobile-panels.md`).
