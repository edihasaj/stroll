# Proposal: sync chats, workspaces, and files across machines

Status: proposal. Builds on [peers](../peers.md) and the Paseo import (`packages/server/src/server/paseo-import.ts`).

## What already works

- The app lists workspaces and chats from every connected host in one sidebar, and any device can
  open and continue a chat on the machine that runs it. This matches Codex Remote, where a session
  stays on the machine that started it.
- Daemons dial each other as [peers](../peers.md) over Tailscale, SSH, or a direct address, and an
  agent can start a subagent on another machine.
- A first Stroll start imports a Paseo home once, so chats, projects, and settings arrive without any
  setup.

## What is missing

1. **Read anywhere.** A chat is only readable while its machine is awake and reachable.
2. **Move work.** A chat, its branch, and its uncommitted changes cannot move to another machine.
   Codex users ask for the same thing ([openai/codex#34804](https://github.com/openai/codex/issues/34804)).
3. **No setup per chat.** Whatever syncs has to behave like the import: it appears by itself, opens
   on the same agent profile, and never asks the user to pick a profile again.

Non-goals: a live two-way mirror of working trees (both sides editing the same files conflicts), and
several machines writing to one chat.

## Design

### A sync hub on a machine you own

Any Stroll daemon can act as the hub (`daemon.sync.role: "hub"`). The recommended hub is an always-on
machine on your Tailscale network. Other daemons name it (`daemon.sync.hub: "<peer>"`) and push to it
over the existing peer link, with the same authentication. Nothing leaves machines you own; there is
no new service or database. The hub keeps replicas as files under `$STROLL_HOME/sync/<serverId>/`,
laid out like a daemon home, so the existing stores can read them.

### What replicates

| Data                                    | Why                                                  |
| --------------------------------------- | ---------------------------------------------------- |
| Agent records and their timelines       | Read and search any chat while its machine is asleep |
| Provider session files for each chat    | Resume the chat on another machine (see Move work)   |
| Project and workspace registries        | The sidebar shows every machine's workspaces         |
| Uploads and desktop attachments         | Images and files in a chat still open                |
| Agent profiles, routes, default profile | A moved chat opens on the same profile               |

Each chat has one owner: the machine that runs it. Replicas are read-only. When the owner is offline,
the app reads the hub's replica and labels the chat with its machine and "read only".

### Move work

"Move to `<machine>`" in a chat's menu does the handoff in one step:

1. The owner packs a git bundle of the workspace branch, a patch of uncommitted and untracked
   changes, the agent record, the provider session file, and the chat's attachments.
2. The target creates a worktree from the bundle and applies the patch, writes the provider session
   file where its provider looks for sessions, and registers the chat through the same path the
   session import uses, so the provider resumes the conversation natively.
3. The source keeps a read-only copy that points to the new owner.

Profiles are synced, so the chat continues on the profile it used; if the target lacks that profile,
the move fails before anything is copied and names the missing profile.

### Phases

1. Read anywhere: replication to the hub, read-only fallback in the app, search across replicas.
2. Move work: handoff between two machines over a peer link.
3. Settings: profiles, routes, and the default profile on every machine.

## Open questions

- Should a phone reach the hub without Tailscale (through the relay)?
- Retention: does the hub keep archived chats forever, or prune them with the owner's archive?
