# Agent hooks review

Codex runs a hook only after you trust it. Read this before changing `agent.hooks.*`, the Codex
hooks code in `packages/server/src/server/agent/providers/codex/hooks.ts`, or the review button in
`packages/app/src/agent-hooks/`.

## Trust records

Codex keeps one trust record per hook slot in `~/.codex/config.toml` (or `CODEX_HOME`), under
`[hooks.state]`. The key is `<file>:<event>:<group>:<hook>`, the hook's position in its hooks file.
The value is the hash of the hook's content when it was trusted. A hook with no record is
untrusted, a hook whose content changed since is modified, and neither runs until it is reviewed.
Managed hooks (admin or plugin) carry their own trust and never need review.

Because keys are positional, rewriting a hooks file so that a group moves changes the key of every
hook after it, and Codex asks for review again. Paseo's terminal-activity hooks are upserted in
place for this reason (`packages/server/src/terminal/agent-hooks/hook-group-upsert.ts`, see
[terminal-activity.md](terminal-activity.md)).

## Review in the composer

The composer shows an anchor between the mode and model controls only while the agent's harness
reports an enabled hook that is untrusted or modified (`hooksNeedingReview` in
`packages/protocol/src/agent-hooks.ts`). It opens a sheet that lists each hook's event, source file,
and command, with Not now, Allow selected, and Allow all. Not now changes nothing; the anchor stays
until the hooks are allowed or removed.

- The app asks when the chat opens and after each finished turn. The daemon answers only for a
  running session (`AgentManager.getHookControls`). It never resumes a closed agent to answer,
  because that would start the harness just to read config files.
- Allowing writes the same record Codex's own review writes: `config/value/write` with
  `keyPath: "hooks.state"` and `mergeStrategy: "upsert"`. The slot keys are absolute paths with
  colons, so they go in the value, not in the key path.
- The session lists hooks again before it writes and trusts each key at its current hash. A hook
  edited after the sheet opened shows up as modified again instead of being trusted at content the
  user never saw.

Listing needs `workspace.read`. Allowing needs `workspace.write`: an allowed hook runs a command on
the host, the same authority as running a workspace script.

## Hook runs in the chat

A `hook/completed` run becomes a timeline notification only when it failed, blocked, or stopped the
agent, or left an error, warning, stop, or feedback entry. Quiet successful runs show nothing, so a
stop hook that passes on every turn does not fill the transcript.

## Other providers

A provider supports review by implementing `AgentSession.listHooks` and `trustHooks`. Claude Code
runs hooks from its settings files without a trust record, so Claude agents never show the anchor.
Hosts advertise the RPCs with `server_info.features.agentHooks`.
