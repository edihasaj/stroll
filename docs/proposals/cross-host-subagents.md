# Proposal: subagents on any of your computers

Status: step 1 (peers: config, connection pool, `paseo peer` commands) and step 2 (`create_agent`
`computer`, `list_computers`, the remote-child watch and notifications, follow-up tool routing)
built — see [peers.md](../peers.md). Builds on [agent-routing.md](agent-routing.md) and
[agent-routes.md](../agent-routes.md).

The app can already start a chat on any computer it is connected to: the new-chat tray picks a
folder and a computer, and the daemon on that computer runs the agent. An agent cannot do the same
for its subagents. `create_agent` only creates agents on the agent's own daemon, so a planner on the
Mac Studio cannot hand work to the MacBook, and a worker cannot reach a Spark that runs its own
daemon.

## Model

Every computer that runs agents runs a Stroll daemon. A daemon that should spawn elsewhere lists its
**peers** in its config:

```json
{
  "daemon": {
    "peers": [
      { "id": "studio", "name": "Mac Studio", "target": "ssh://edi@edis-mac-studio" },
      { "id": "macbook", "name": "MacBook", "target": "tcp://100.64.0.12:6767", "privacy": "local" }
    ]
  }
}
```

- `target` takes any form `paseo --host` accepts: `ssh://` (tunnel to the peer's local daemon),
  `tcp://host:port` with an optional password, or a pairing link. The daemon dials peers with the
  same client code the CLI uses, keeps one connection per peer, and reconnects on demand.
- `privacy` defaults to `local`: the peer is one of your machines. A peer marked `cloud` is a
  machine you rent. The local-route guard extends to peers: an agent on a local route can only
  spawn on local peers.
- `paseo peer add <id> <target>`, `paseo peer ls`, and `paseo peer test <id>` manage the list.
  Settings → Computers shows it with a Test button, next to the hosts the app is connected to.

## Spawning on another computer

`create_agent` gains `computer`, a peer id. Omitted, the agent runs locally as today.

1. The daemon dials the peer and checks the cwd exists there: the same absolute path, resolved
   against the caller's own cwd when it's relative. A worktree, or an existing `workspaceId`, is
   refused for now — see [peers.md](../peers.md) for the exact error.
2. It creates the agent on the peer with the same `route`, `provider`, and `settings` arguments. The
   peer resolves routes and profiles from its own config, because each computer knows which models
   it can reach.
3. The child gets two labels, `stroll.parent.computer` (the calling daemon's server id) and
   `stroll.parent.agent` (the calling agent's id) — not `paseo.parent-agent-id`, which would make
   the peer treat the child as the child of an agent it has no record of.

The calling daemon keeps a small record of the remote child (peer id and agent id) and watches its
status on the peer. When the child finishes, fails, or asks for permission, the parent gets the same
notification as for a local subagent, so `notifyOnFinish` behaves the same across computers.

A route entry can also name a computer: `{ "profileId": "qwen", "computer": "spark-a" }`. A route can
then mean "Qwen on the Spark's daemon, then Codex on the Mac Studio", with failover across
computers.

## In the app

- The new-chat tray's computer chip lists This computer, then every other host the app is
  connected to (already built).
- Subagent rows, the summary card, and the Subagents panel show a child's computer when it is not
  the parent's. The app joins children across the hosts it is connected to by
  `stroll.parent.computer` and the parent agent id. Clicking one opens it on its own host. When the
  app is not connected to that host, the row shows the status the parent's daemon mirrors and offers
  to add the host.

## Order of work

1. Peers: config, connection pool, `paseo peer` commands, reachability check.
2. `create_agent` `computer`, the remote-child watch, and notifications.
3. Route entries with `computer`.
4. App: cross-host subagent rows, panel, and opening.

## Open questions

- Workspace placement on a peer when the path differs (for example `/Users/edi/Projects/x` on macOS
  and `/home/edi/x` on a Spark): map by repository remote URL, or require an explicit path per peer.
- Whether peers should be shared with the app's host list or stay daemon-only. They are separate
  today because the daemon dials peers even when no app is open.
