# File links

`packages/app/src/assistant-file-links/` turns text that names a local file or folder into
something you can open. Four surfaces feed it: explicit markdown links, inline code, plain
assistant prose, and user messages. All four end up at the same classification
(`parse.ts`'s `classifyAssistantFileLink`) and the same open path (`use-file-link.ts`'s
`useFileLink`), so a gotcha fixed once applies everywhere.

## What counts as a link, per surface

- **Explicit markdown links** (`[text](href)`): open regardless of extension. A bare relative
  href with no `./`, `../`, `~/` prefix still counts as long as it contains a "/" or ends in any
  dot-extension — `allowAnyExtension` in `parse.ts`. The author wrote `[]()` on purpose; that's
  trusted more than ambient text.
- **Inline code**: the curated extension allowlist (`ASSISTANT_FILE_EXTENSIONS`), plus any short
  alphanumeric extension once the token contains a "/", a trailing slash as a bare directory
  marker, and well-known extensionless names (`Makefile`, `Dockerfile`, `README`, …).
- **Plain prose and user messages**: the strictest of the three, and the only pair that shares
  one scanner (`text-path-scan.ts`'s `scanTextForLocalPaths`). A bare relative path needs _both_
  a "/" and a dot-extension on the last segment — not "or" — specifically to keep branch names
  (`feat/agent-routes`), `owner/repo` slugs, dates, and fractions from lighting up. Absolute,
  `~/`, Windows, and `file://` paths are unconditional in all three tiers.

Prose gets there through a markdown-it core rule (`markdown-prose-rule.ts`, registered after
"linkify" in `createAssistantMarkdownParser`) that splices link tokens into plain text tokens,
marked `markup: "linkify"` the same way linkify's own matches are — so the existing "link" render
rule and `isLinkifiedSource` need no surface-specific branch. User messages never go through
markdown-it, so `splitTextIntoPathSegments` (same module) does the equivalent split directly for
`components/message.tsx`'s `UserMessage` to render as nested pressable `Text` runs.

## File or folder — and when the string alone doesn't say

`InlinePathTarget.kind` is `"file"`, `"directory"`, or absent. A trailing slash always means
directory, read off the raw token because resolving `notes/` under the workspace drops the slash;
a recognized/short extension always means file. A directory never goes through the name lookup
that confirms bare inline-code files, since that lookup only finds files. An absolute path with no extension
(`/usr/local/bin`) leaves `kind` unset on purpose — the shape genuinely doesn't say. Resolving
that is `use-file-link.ts`'s job alone, and only when a target is actually opened: it calls
`client.listDirectory` through the same cwd-rooting rule as `resolveFilePreviewReadTarget` (the
workspace root when the path is inside it, otherwise the filesystem root), treats success as
directory and any failure — including no client — as file. This never runs during render or
hover prefetch; probing on every keystroke-adjacent render would hammer the daemon for a question
nothing is waiting on yet.

## Opening a folder

A directory inside the current workspace reveals in the Explorer's Files view instead of opening
a tab: `usePanelStore`'s `explorerRevealRequest` (path + an incrementing revision, transient,
never persisted) tells whichever `FileExplorerPane` owns that workspace's explorer state to expand
every ancestor plus the folder itself, select it, and scroll it into view. The request is generic
by design — it only needs a workspace's explorer state key and a path, so anything else that
wants to point at a row in the Files tree can reuse it instead of growing a second mechanism.

A directory outside the workspace — or when there's no workspace at all — opens its own tab,
`{ kind: "folder", path }` (`panels/folder-panel.tsx`). It renders the same `FileExplorerPane` the
Files view uses, rooted at the folder with no `workspaceId`, so its explorer state key is
`root:<path>` and never collides with a real workspace's Files state. Files opened from it get
absolute paths: explorer entries are relative to the folder, and a relative file tab would resolve
against the workspace root instead.

The callback that decides between the two, `onOpenWorkspaceFolder`, sits next to
`onOpenWorkspaceFile` in `AssistantFileLinkResolverConfig` and is threaded through
`PaneContext.openFolderInWorkspace` the same way `openFileInWorkspace` already was. The one place
that actually branches reveal-vs-tab is `workspace-screen.tsx`'s `handleOpenWorkspaceFolderFromPane`,
mirroring `handleOpenWorkspaceFileFromPane` beside it.

In the chat, `agent-stream/view.tsx` takes the folder opener from the hosting pane
(`useOptionalPaneContext`) and wraps user messages in the same resolver provider as assistant
messages, so both open folders the same way.

A config that hasn't been given `onOpenWorkspaceFolder` falls back to routing a directory target
through `onOpenWorkspaceFile` instead of dropping the open silently — every existing caller already
handles a directory-shaped `InlinePathTarget` that way, and adding `kind` detection must not change
their behavior just because they haven't picked up the new callback yet.

## How links look

In the monochrome palette a link's colour matches the prose around it, so markdown links carry a
muted underline (`styles/markdown-styles.ts`); user-message path links are underlined the same
way. Without it a file reference reads as plain text.

## The link actions menu

Right-click (web/Electron) or long-press (native) on a file or folder link opens Open, Open to the
side (files only), Reveal in `<file manager>`, Open in `<editor>` (desktop only, hidden without a
bridge target), and Copy path — `link-actions-menu.tsx`'s `LinkActionsMenuContent`, the same shared
`ContextMenuContent`/`ContextMenuItem` primitives the file explorer's own row menu uses.

It does not open through a `ContextMenuTrigger`. That trigger wraps its children in a `View`, and
on iOS an assistant link renders as a leaf span inside the paragraph's native `UITextView` (see
`link.tsx`'s native branch) — the same hoisting failure that drops a plain `<Text>` there drops a
wrapping `View` too. `useLinkActionsMenuGesture` (`link-actions-menu.tsx`) opens the menu by
calling the menu engine's `setAnchorRect`/`setOpen` directly from the gesture event's point, so the
link's own rendering never gains an extra wrapping node. Both `AssistantMarkdownLink` and the user
message's path-link component use this one hook rather than duplicating the gesture logic.

Long-press on iOS rides the same leaf-span path `onPress` already does:
`react-native-uitextview`'s child component carries `onLongPress` alongside `onPress`, so
`AssistantLinkPressProvider` (`link-press-context.ts`) now threads both.
