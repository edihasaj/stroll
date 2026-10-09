# Main view, Explorer sidebar, and side pane

A desktop workspace has three surfaces. The Explorer sidebar and the side pane share panel
implementations, but they have different shell contracts.

| Surface          | Purpose                       | Lifecycle                                             |
| ---------------- | ----------------------------- | ----------------------------------------------------- |
| Main view        | One chat, with a header       | Always present; opening another chat replaces it      |
| Explorer sidebar | Files and Changes navigation  | Cmd+E shows or hides the dedicated dock               |
| Side pane        | Everything that is not a chat | Created on first use, closed when its last tab closes |

Compact layouts and native keep the earlier model: one pane holding tabs, with the Explorer as a
sheet or inline dock. Nothing below applies to them unless it says so.

## Main view

The main view shows one chat and has no tab row. Its header (`screens/workspace/main-pane-header.tsx`)
carries the chat's title (press to rename), provider, a menu (copy ids, Reload, Archive, Delete chat),
New chat, and the launcher menu. A draft shows a plain header over the composer. The sidebar lists
each workspace's chats and is the switcher; Cmd+Alt+Left and Cmd+Alt+Right walk the history
([agent-lifecycle.md](agent-lifecycle.md) has the archive rules).

`packages/app/src/workspace-tabs/single-chat.ts` holds the rules, and the layout store applies them
on desktop only (`isSingleChatMainActive`):

- A chat (agent or draft) opens in the main pane and replaces the chat showing there. Reconcile adds
  a chat to an empty main pane and never a second one.
- Every other target opens in the side pane, creating it when needed. A target that asks for the
  Explorer and can live there stays in Explorer. Dragging a chat out of the main pane or a
  non-chat into it is refused.
- Opening a target that already has a tab reveals that tab where it is and never creates an empty
  side pane.
- Opening a workspace from the sidebar without naming a chat keeps the chat its main view shows
  (`navigation-active-workspace-store/navigation.ts`). Only an empty main view opens the chat that
  needs attention.

Because the rules sit in the layout store, every entry point gets them without branching: the
sidebar, Command Center, notifications, deep links, Explorer clicks, and agent-opened browser tabs.

## Panel host contract

Every desktop panel registers its supported `PaneHost` values and presentation. Launchers derive
fixed-target labels and icons from that registration, filter by host, and never substitute one
panel type for another. Tab moves reject unsupported destinations, and placement resolves only to
a compatible pane.

Files and Changes are the Explorer defaults. Their panel manifests mark them as singletons,
so a pane’s + menu omits each while that pane already contains it. Closing one makes its menu
item available again. Other compatible tabs, including terminals, files, and diffs, can move
between Explorer and the side pane. A chat never leaves the main view.
Keep panel implementations independent of either shell. `WorkspacePanelHost` owns mounting and
retention, while each shell owns its tabs, focus, dragging, resizing, and shortcuts.

## Explorer sidebar

`packages/app/src/workspace-tabs/explorer-sidebar.ts` owns show, hide, toggle, and view selection.
On desktop, the shell is rendered outside the workspace pane canvas so it divides the full
workspace, including the header. It has its own persisted width and resize handle. Main and side
pane sizes never read or modify that width.

`packages/app/src/workspace-tabs/open-supporting-view.ts` owns semantic Changes and pull-request
opens. Compact and wide native layouts select the matching Explorer tab. Desktop Changes opens
follow the shared diff preference. Desktop pull requests use their Main panel, On the side, or
Explorer sidebar setting. Automatic PR discovery follows that preference once per workspace without
interrupting the user's work. Closing the tab opts that workspace out of future automatic opens,
even for a different PR; moving or reordering it remains the user's choice.
Callers request the content and never choose the shell.
The composer Changes pill is a two-stage desktop action: it first reveals Explorer on Changes, then
routes later presses to the working diff through the shared diff preference.

The persisted layout still contains the Explorer pane so tabs survive reloads. The renderer removes
that pane from the workspace pane tree and docks it separately. Persisted identifiers retain the
literal `"explorer"` pane id and `explorerPaneIdByWorkspace` key for compatibility.

Explorer uses the shared workspace tab row and ordinary tab context menus. Files and Changes
hide their close buttons through the panel manifest; close them from the tab context menu.
Other tabs reveal the close control on hover. The + menu opens compatible panels in the dock and
omits Agent and terminal profiles. Terminals can still be dragged into Explorer.
Bulk-close actions apply only to the dock's tabs. Explorer tabs can be reordered and dragged
between compatible panes, but the dock cannot be put in Full view. Selecting an Explorer
tab does not change workspace focus.

Cmd+E shows or hides Explorer without changing its selected view. Compact layouts use the combined
full-screen Explorer overlay for Changes, Files, and pull requests, and close it after a file opens. Compact Changes has no tree rail; its overview is the Jump to file action (`packages/app/src/git/jump-to-file/`), a sheet over the same changed-files tree the desktop rail renders.
Wide native layouts without desktop panes use the same combined content in a resizable inline dock;
opening a file leaves that dock visible. Both presentations keep their selection in the panel store
and reuse the layout store's per-workspace Explorer width. They do not create a second Explorer
lifecycle.

## Side pane

`packages/app/src/workspace-tabs/open-beside.ts` owns content opened beside the chat. The layout
store remembers one ordinary pane per workspace. The first side open creates a full-height pane to
the right of the main pane, with its own resize handle and tab row; later side opens reuse it. The
header's launcher menu and the side pane's own + menu open the same targets. The + menu leaves out
Agent, because a new chat opens in the main view.

Users cannot split panes: there are no split shortcuts, Command Center entries, pane menu, or drag
edges. A layout saved before the single-chat main view migrates once (layout version 3,
`stores/workspace-layout-migration.ts`): the focused chat stays in the main pane, every other view
moves to one side pane, and nothing is closed or archived. Version 2 data is also copied to
`workspace-layout-state.v2-backup` first. The migration follows the platform, not the window width,
and adds no persisted key: the schema is strict, and a blob that fails it is discarded on load.

Removing a pane clears its remembered id; a later side open creates a new pane. The last visible
ordinary pane stays when its final tab closes and shows the New launcher. An empty workspace does
not automatically create a draft; New chat opens one. Explorer cannot replace the workspace canvas,
even when visible. Restoring a saved layout enforces the same rule while preserving Explorer and
saved tab content. There is no hidden side-pane lifecycle.

Placement intent still controls where a target lands among the panes it may use:

| Mode      | New target                  | Existing target                   |
| --------- | --------------------------- | --------------------------------- |
| `pane`    | opens in the requested pane | moves to the requested pane       |
| `prefer`  | opens in the requested pane | stays where the user placed it    |
| `focused` | opens in the focused pane   | focuses it where it already lives |
| `ambient` | opens in a compatible pane  | focuses it where it already lives |

With a single-chat main view the requested pane is advisory for kind: a non-chat request for the
main pane becomes a request for the side pane. Explicit **Open to Side** uses `pane`. Implicit opens
use `prefer`, so a request affects only a new target and never yanks an existing tab out of a pane.

### Full view

Full view gives one pane the whole workspace canvas and hides the rest. The Explorer dock stays. The
pane toolbar button, the Command Center, and `Cmd+Shift+B` (`Ctrl+Shift+B` elsewhere) toggle it
through the same state in `packages/app/src/stores/workspace-full-view-store.ts`.

The toolbar button covers the canvas with its own pane. The shortcut and the Command Center cover it
with the side pane, the one `ensureSidePane` would reuse, and focus that pane. A workspace with one
visible pane has nothing to cover, so the action does nothing. Pressing it again restores the layout.
The main view's header has no Full view button; the side pane's toolbar does.

The state is per workspace and never persisted, so it stays out of the saved layout schema and a
restart shows the layout as saved. It ends on its own in focus mode, when one visible pane is left,
and when its pane is removed (`shouldExitFullView` in `split-container-focus.ts`).

`Cmd+Shift+B` used to open a new browser. New browser is now `Cmd+Alt+B` (`Ctrl+Alt+B`) under new
binding ids, so shortcut overrides stored against the old ids no longer apply.

## Routing

Desktop **Settings → Layout → Open location** has two rows: where pull requests open (On the side
or Explorer sidebar; Explorer is the default) and how script service URLs open. There are no
per-source rows for files, diffs, subagents, or browser tabs: with one chat in the main view the
target decides, and the stored `openInSidePane` settings are read and kept but have no effect on
desktop. A saved pull request location of Main panel opens in the side pane. Compact layouts always
open pull requests in Explorer regardless of this desktop preference.

Browser tabs open in the side pane from every entry point that does not name a pane: the header
menu and the New browser shortcut, links and service URLs opened in the app, tabs an agent opens
through the browser MCP, and the plugin `navigation.openBrowser`. The agent and plugin opens add the
tab beside your work without moving focus. Choosing Browser in a pane's + menu still opens it in
that pane. Compact layouts have no side pane and open browser tabs where they always did.

A managed subagent is a chat, so it opens in the main view in place of its parent; a provider
subagent is a read-only timeline and opens in the side pane.

Panels request an implicit open through the narrow `openPreferredTarget(target, source)` pane
contract. Entry points outside panels use `openPreferredWorkspaceTarget`, or
`resolvePreferredSidePanePlacement` when the caller opens the tab itself. Do not branch on a
specific shell inside a panel.
