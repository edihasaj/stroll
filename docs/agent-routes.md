# Agent routes

A route is an ordered list of agent profiles a thread runs on. The daemon starts the thread on the
first usable profile and, when that profile stops working mid-thread, continues on the next one with
a handoff packet, so the user does not re-explain the work. Read this before changing anything under
`packages/server/src/server/agent/routes/`, `packages/server/src/server/agent/brief/`, the
`agent.route.*` / `agent.brief.*` RPCs, or the route UI in the app.

Protocol shapes live in `packages/protocol/src/agent-route.ts`. The proposal that led here is
[proposals/agent-routing.md](proposals/agent-routing.md).

## Configuration

Routes live in the daemon config next to agent profiles. Each entry names an agent profile by id.

```json
{
  "daemon": {
    "agentProfiles": [
      {
        "id": "qwen",
        "name": "Qwen (Spark)",
        "provider": "omp",
        "model": "spark-a/qwen3.8-flash-next"
      },
      {
        "id": "codex-a",
        "name": "Codex (personal)",
        "provider": "codex",
        "model": "gpt-5.5",
        "accountProfileId": "pac_…"
      },
      { "id": "claude", "name": "Claude", "provider": "claude", "model": "claude-sonnet-5" }
    ],
    "agentRoutes": [
      {
        "id": "worker",
        "name": "Worker",
        "description": "Implements and fixes code on the local Spark model.",
        "entries": [
          { "profileId": "qwen", "privacy": "local", "probeUrl": "http://spark-689b:8000/v1" }
        ]
      },
      {
        "id": "planner",
        "name": "Planner",
        "description": "Plans and reviews work on cloud models.",
        "privacy": "cloud",
        "failover": "auto",
        "entries": [{ "profileId": "claude" }, { "profileId": "codex-a" }]
      }
    ],
    "defaultAgentRoute": "worker"
  }
}
```

- `privacy` on a route defaults to `local`. A local route only uses entries marked
  `"privacy": "local"`; an entry without the field counts as cloud. Data on a local route never
  leaves the machines its local entries point at.
- `failover` defaults to `auto`: the thread continues on the next entry by itself, and the user can
  undo. `ask` stops and offers the next entry instead.
- `probeUrl` is checked before a self-hosted entry is used (see Preflight).
- `defaultAgentRoute` is the route new chats use when the client does not pick a model.

There is no spending limit. A paid API entry is used while it answers; when it runs out of credits,
it fails like any other entry, and when no entry is left the thread pauses with its context kept.

## Preflight

Before a thread starts on an entry, and before failing over to one, the daemon checks it. The first
failing check decides the reason:

| Reason                 | Check                                                                                                             |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------- |
| `profile_missing`      | The profile id exists in `agentProfiles`.                                                                         |
| `privacy`              | A local route and an entry that is not marked local.                                                              |
| `provider_unavailable` | The provider is installed and enabled (`AgentManager.getProviderAvailability`).                                   |
| `signed_out`           | A profile pinned to a managed account: the account still exists and is signed in.                                 |
| `quota`                | The account's usage report shows a window at 100% used or a balance at zero. Best effort: no report means usable. |
| `unreachable`          | `GET {probeUrl}/models` answers 2xx within 5 seconds. Only for entries with `probeUrl`.                           |

Skipped entries leave no trace in the chat. `agent.route.preflight.request` runs the same checks for
every entry of a route and is what Settings → Routes → Test shows.

## Creating a routed agent

`route` on a create request (WebSocket `create_agent_request` / `agent.create.request`, the MCP
`create_agent` tool, `paseo run --route <id>`) replaces the client's provider choice: the daemon runs
preflight in entry order, applies the first usable entry's profile (provider, model, mode,
thinking, feature values, account), and stamps the agent's labels:

| Label                 | Value                                                                        |
| --------------------- | ---------------------------------------------------------------------------- |
| `stroll.route`        | Route id.                                                                    |
| `stroll.route.entry`  | Index of the entry the agent runs on.                                        |
| `stroll.route.thread` | Id of the thread's first agent. The brief and route history are keyed by it. |
| `stroll.route.state`  | `active`, `awaiting_choice`, `continued`, or `paused`.                       |

A mode or thinking level the profile leaves unset comes from the request's `settings`. Without
one, a subagent on a different provider than its caller fails to create, because the caller's mode
cannot carry across providers.

When no entry is usable, creation fails with the per-entry preflight reasons in the error.

## Spawning subagents by role

`create_agent`'s `route` parameter spawns a subagent by role instead of by provider/model: pass a
route id (for example `worker`) and the daemon resolves it the same way as any other routed
agent — preflight in entry order, first usable entry wins. `provider` is optional on `create_agent`;
omit it when you pass `route`, and pass it (provider/model, for example `codex/gpt-5.4`) only when
no route fits.

A call with neither `route` nor `provider` falls back to the daemon config's `defaultAgentRoute`,
when one is set: `create_agent` behaves exactly as if `route: defaultAgentRoute` had been passed,
including the route labels in [Creating a routed agent](#creating-a-routed-agent). A call with
neither and no default route fails before creating anything, naming both ways to fix it.

A thread on a local route is local-only by default, so its subagents must stay local too: when the
calling agent is itself on a route resolving to `privacy: "local"`, `create_agent` rejects an
explicit `provider`, and rejects `route` (explicit or defaulted) when that route's resolved privacy
is not `"local"`, naming the offending route in the error. Unrouted callers, callers on a cloud
route, and top-level calls (no caller agent) are unaffected.

`list_profiles` returns `routes` alongside `profiles`: each route's `id`, `name`, `description`,
resolved `privacy` and `failover`, and its entries with the resolved profile name/provider/model,
the entry's resolved `privacy`, and `allowed` (false when a local route has a non-local entry — the
same check as Preflight's `privacy` reason, computed without running preflight). It also returns
`defaultRoute`. A route's `description` is one sentence on what the route is for; an agent choosing
a role for a subagent reads it, and the `create_agent` tool description lists configured routes by
id and description so a model can often pick one without a separate `list_profiles` call.

## Failover

A failed turn on a routed agent is classified from the turn failure's text and code:

- `auth`: `authState: "expired"` on the event, or `isProviderAuthError` matches.
- `quota`: rate or usage limits and exhausted credits — HTTP 429, "rate limit", "usage limit",
  "quota", "insufficient credits", "credit balance", "billing", "exceeded your current".
- `unreachable`: the endpoint is down — `ECONNREFUSED`, `ENOTFOUND`, `ETIMEDOUT`, `ECONNRESET`,
  "fetch failed", "socket hang up", "network error", HTTP 502/503/504, "connection error".

Any other failure is an ordinary failure and stays visible as one; failover never hides a real error.

### Stalled turns

An endpoint that drops packets (a powered-off or firewalled Spark) does not fail a turn: the
provider waits on the connection and retries for minutes. The route service watches every running
turn; when a routed turn on an entry with `probeUrl` has produced no event for 60 seconds, it runs
that entry's probe. If the probe says `unreachable`, the turn is canceled and fails over as
`unreachable`; if the endpoint answers, the turn is left alone and checked again after another
quiet minute. An entry without `probeUrl` is never canceled for silence, because silence alone
cannot tell a dead endpoint from a long-running tool.

Give every self-hosted entry a `probeUrl`, and keep the harness's own retries short so a dead
endpoint fails within seconds. `scripts/stroll-omp-workers.mjs` sets OMP to two retries with a
10-second ceiling (OMP's default of ten retries waits about 8.5 minutes), and with two or more
Sparks it adds OMP `retry.fallbackChains` between them, so losing one Spark switches inside the
same OMP session without a Stroll handoff.

On a classified failure, the daemon looks for the next usable entry after the agent's own, in order:

- **Found, `failover: "auto"`.** It creates a continuation agent in the same workspace and directory,
  titled like the original, on that entry, with the handoff packet as its first message. The new
  agent gets `stroll.route.continues = <old id>` and the same thread label; the old agent gets
  `stroll.route.state = continued`, `stroll.route.continued-by = <new id>`, and
  `stroll.route.reason`. Both timelines get a notification row naming the two profiles and the
  reason.
- **Found, `failover: "ask"`.** The agent gets `stroll.route.state = awaiting_choice`,
  `stroll.route.next-profile = <profile id>`, and `stroll.route.reason`, plus a notification row.
  `agent.route.continue.request` then does what auto failover would have done.
- **None left.** The agent gets `stroll.route.state = paused` and `stroll.route.reason`, plus a
  notification row saying the context is kept. `agent.route.continue.request` on a paused agent
  runs preflight from the route's first entry and continues on the first usable one.

`agent.route.switch_back.request` is the undo. On an idle continuation agent, it checks the entry of
the agent it continues; when that entry passes preflight, it sends that agent a handoff packet built
from the continuation's work, marks it `active` again, and marks the continuation `continued`. When
the entry is still unusable it returns an error naming the reason, and nothing changes.

Every move appends an `AgentRouteEvent` to the thread's history.

## The brief and the handoff packet

The brief is the thread's running summary: goal, current state, decisions, open items, and files
touched. After every completed turn of a routed agent, the daemon regenerates it with structured
generation (`generateStructuredAgentResponseWithFallback`) from the previous brief and the activity
since the last update. The agent's own provider generates it, which already sees this content, so
the brief adds no exposure; only a route explicitly marked cloud uses the configured metadata
providers instead. Generations for one thread never overlap; a turn that
completes during a generation queues one more.

A user edit (`agent.brief.update.request`) replaces the stored fields and sets `editedByUser`; the
next regeneration starts from the edited brief.

The handoff packet is built when it is needed, so it is current even if the brief lags a turn:

```
<handoff from="Qwen (Spark)" reason="unreachable">
This work continues from another model. Pick up where it left off; do not redo finished steps.

## Brief
Goal: …
State: …
Decisions:
- …
Open items:
- …
Files: …

## Original request
…

## Latest user message
…

## Last tool calls
1. bash: npm test — failed. Output (trimmed): …
…

## Workspace
git status --short:
…
git diff --stat:
…
</handoff>
```

It carries the last five tool calls, with arguments and output trimmed to 600 characters each, and the
git sections only when the directory is a repository. `agent.brief.get.request` returns the stored
brief, the route history, and the packet the next profile would receive now.

Briefs and route history are stored per thread under `$PASEO_HOME/agent-briefs/<threadId>.json`,
outside the agent record directory.
