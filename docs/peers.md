# Peers

A peer is another daemon this daemon can dial to spawn agents on another computer. Read this
before touching `packages/server/src/server/peers/`, `packages/server/src/server/host-connection/`,
or the `paseo peer` CLI commands.

The proposal that led here is [proposals/cross-host-subagents.md](proposals/cross-host-subagents.md).
Step 1 is the config, the connection pool, and the CLI. Step 2, below, is `create_agent`'s
`computer` argument, the `list_computers` tool, and finish notifications across computers.

## Configuration

Peers live in the daemon config, next to agent routes:

```json
{
  "daemon": {
    "peers": [
      { "id": "studio", "name": "Mac Studio", "target": "ssh://edi@edis-mac-studio" },
      { "id": "macbook", "target": "tcp://100.64.0.12:6767", "privacy": "local" }
    ]
  }
}
```

- `id` is lowercase letters, digits, and hyphens, and cannot start with a hyphen.
- `name` defaults to `id`.
- `target` takes any form `paseo --host` accepts: `ssh://user@host` (tunneled through SSH),
  `tcp://host:port`, optionally with `?password=…`, a bare `host:port`, or a pairing-offer URL.
- `privacy` defaults to `local`: the peer is one of your machines. Mark a rented machine `cloud`.
  The same local-route guard that applies to `route` (docs/agent-routes.md) applies to a peer: an
  agent running on a local route can only spawn on a peer marked `local`.

## What a peer connection is for

The daemon dials a peer with the same client code the CLI uses to dial a daemon
(`packages/server/src/server/host-connection/connect-host.ts`, exported as `connectDaemonHost`).
`packages/server/src/server/peers/peer-pool.ts` keeps one connection per peer, reconnects when the
cached client drops or the peer's target changes in config, and is how a daemon reaches another
computer to create a subagent there. The daemon bootstrap constructs and closes the pool.

## Spawning a subagent on a peer

`create_agent` takes an optional `computer`, a peer id from `list_computers` or `list_profiles`.
Omitted, the agent runs locally as before.

- **cwd.** The explicit `cwd` argument, or the caller's own cwd when omitted; a relative `cwd`
  joins onto whichever of those applies. Before creating anything, the daemon lists that directory
  on the peer (`DaemonClient.listDirectory`) and fails with `No directory <cwd> on <peer name>.
Pass a cwd that exists there.` if it isn't there — workspace placement across computers (see
  [Open questions](proposals/cross-host-subagents.md#open-questions)) isn't solved, so this is the
  one thing the caller must get right. An explicit `workspaceId`, or a worktree request, is refused
  with a clear error naming the field to drop; neither is supported with `computer` yet.
- **route / provider / settings.** Passed straight through to the peer's own `createAgent` call,
  the same mapping `paseo run` uses (`packages/cli/src/commands/agent/run.ts`). The peer resolves
  `route` and profiles from its own config, because each computer knows which models it can reach.
- **Labels.** The child gets the caller's own labels plus `stroll.parent.computer` (the calling
  daemon's server id) and `stroll.parent.agent` (the calling agent's id). It does **not** get
  `paseo.parent-agent-id`: the peer has no record of that agent, and stamping its own
  parent-agent-id label would make the peer treat the child as the child of an agent it doesn't
  have.
- **Waiting.** Agent-scoped creation is always asynchronous (docs/agent-lifecycle.md) and returns
  at once. A top-level call without `background` waits on the peer for the same 30s the local path
  waits, then reports the agent is still running instead of failing.

### Finish notifications

With `notifyOnFinish` set (the agent-scoped default), the creating daemon records the child —
`$PASEO_HOME/remote-subagents.json`, one entry per child, re-armed on daemon restart — and watches
it with the peer's `waitForFinish` RPC until a terminal state, notifying the caller exactly like a
local subagent (docs/agent-lifecycle.md): finished, errored, needs permission (the request travels
in the notification body; the watch waits for it to resolve instead of re-polling the same pending
state), or was closed. The notification body names the computer. A dropped peer connection retries
with backoff from 2s up to a 60s cap; the watch stops once the child reaches a terminal state or
the parent is archived.

`send_agent_prompt`, `get_agent_status`, `cancel_agent`, `archive_agent`, and
`respond_to_permission` recognize a remote child from that same record and route to its peer
instead of looking for a local agent, returning the same shape the local tool would.
`send_agent_prompt` re-arms the finish watch when its own `notifyOnFinish` is set, even for a child
created with notifications off.

### `list_computers`

Lists this computer (server id, hostname) and every configured peer (id, name, privacy); pass
`test: true` to also dial each peer and report reachable/latency/error, the same facts `paseo peer
test` prints. Gated by the same per-provider tool policy as `create_agent` and `list_profiles`.

## Password at rest

A `tcp://` target can carry a password: `tcp://host:port?password=…`. It is stored in
`config.json` the same way a provider API key is — in plain text, in a file the daemon already
treats as private. `daemon config get` redacts a field named `password`; it does not know a target
string contains one, so every command that prints a target redacts it itself.

## Commands

```bash
paseo peer add <id> <target> [--name <name>] [--privacy local|cloud]
paseo peer rm <id>
paseo peer ls
paseo peer test <id>
```

`add` and `rm` edit the local `config.json` and apply the change to a running daemon the same way
`paseo daemon config set` does; with no daemon running, the change is saved and applied on next
start. `ls` prints `id`, `name`, `target`, and `privacy`, with any password in the target redacted.
`test` dials the peer directly from the machine running the command and prints the peer's
`serverId`, `hostname`, `version`, and round-trip latency, or a clear error naming the peer when it
is unreachable.

All four commands are local operations and take `--home`, matching `paseo daemon config`.
