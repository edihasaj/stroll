# Peers

A peer is another daemon this daemon can dial to spawn agents on another computer. Read this
before touching `packages/server/src/server/peers/`, `packages/server/src/server/host-connection/`,
or the `paseo peer` CLI commands.

The proposal that led here is [proposals/cross-host-subagents.md](proposals/cross-host-subagents.md).
This covers step 1: config, the connection pool, and the CLI. `create_agent` does not use peers yet.

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
  The local-route guard will extend to peers once `create_agent` can target one — an agent running
  on a local route will only be able to spawn on a `local` peer.

## What a peer connection is for

The daemon dials a peer with the same client code the CLI uses to dial a daemon
(`packages/server/src/server/host-connection/connect-host.ts`, exported as `connectDaemonHost`).
`packages/server/src/server/peers/peer-pool.ts` keeps one connection per peer, reconnects when the
cached client drops or the peer's target changes in config, and is how a daemon will reach another
computer to create a subagent there.

Today the pool is constructed and closed by the daemon bootstrap and nothing calls into it. The
next step wires it into `create_agent`'s `computer` argument.

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
