# Proposal: routes, Codex-style subagents, and context handoff

Status: proposal, 2026-10-06. Nothing here is built yet except where marked **exists**.

The goal is one opinionated harness: local Qwen on the Sparks does the implementation work,
stronger models plan and review, and when any model is unavailable the work moves to the next
one without the user re-explaining it.

## What Stroll already has

- **A provider-independent ledger (exists).** The daemon records every agent's timeline as
  normalized rows — user messages, assistant messages, tool calls with arguments and results —
  for every provider (Claude, Codex, OMP, Pi, OpenCode, ACP). Nothing has to intercept tool calls;
  they are already in `$PASEO_HOME/agents/…`.
- **Accounts and profiles (exists).** Provider account profiles hold several subscriptions per
  provider (two Codex sign-ins, a Claude sign-in) with per-account usage meters. Agent profiles
  bundle provider, model, mode, thinking, and account. See [provider-accounts](../provider-accounts.md).
- **Linked continuation (exists).** Switching account or provider on a live thread opens a
  linked draft carrying the conversation as a `chat_history` attachment built from the ledger
  (`buildAgentForkContextAttachment` in `packages/server/src/server/agent/activity-curator.ts`).
  Today it carries the whole history, and the user has to trigger it.
- **Auth-failure classification (exists).** `isProviderAuthError` marks a turn failed by expired
  credentials.
- **OMP as the workhorse (exists after the upstream sync).** OMP's task tool spawns subagents that
  show in the parent's subagents track, and its model roles (`task`, `plan`, `slow`, `smol`, …)
  split one session across models. `scripts/stroll-omp-workers.mjs` points every role at the
  Sparks.

What is missing is the automatic part: choosing the next model when one fails, a compact
summary to hand over instead of the whole history, and a subagent UI that stays inside the
parent thread.

## 1. Routes: ordered fallback chains

A **route** is an ordered list of agent profiles for one role. A thread runs on a route, not on
a single model.

```
worker:   qwen-spark (OMP, local) → codex (account A) → codex (account B) → claude → deepseek API (OMP)
planner:  claude → codex (account A) → kimi API (OMP)
reviewer: codex (account B) → claude → glm API (OMP)
```

- **Preflight before start.** Before a session is created on a profile, check it cheaply: the
  endpoint's `/models` answers (local), the account is signed in, and its usage meter is not at
  its limit (subscriptions, from the usage plugins). A profile that fails preflight is skipped
  silently, so no failed session appears in the chat. The thread shows which profile it ended
  up on.
- **Failover mid-turn.** Classify a failed turn as `auth` (exists), `quota` (429, "usage
  limit", "insufficient credits"), or `unreachable` (connection refused, 5xx, timeout). For those
  three, continue on the next profile in the route with a handoff packet (section 3). Any other
  failure stays a normal failure; failover must not hide real errors.
- **Privacy per profile.** Each profile is marked `local` or `cloud`. A route can be marked
  local-only, and then it never fails over to a cloud profile. This is the switch between "data
  never leaves the Sparks" and "fall back to my subscriptions". Falling back to Codex sends the
  handoff packet to OpenAI; the route has to say so explicitly.
- **Settings.** Settings → Routes: one list per role, drag to reorder, a Test button that runs
  preflight on every entry and shows the result per row.

## 2. Subagents the way Codex does them

Codex keeps subagents inside the parent thread: the model spawns them by role with a tool, they
run in parallel, and the parent waits for their results. They are not separate conversations
the user has to manage. Stroll has two kinds today: managed Stroll subagents spawned through the
Paseo MCP tools, which become full agents opened as tabs, and provider-native subagents (Claude
Task, Codex multi-agent, OMP task) shown read-only in the subagents track.

Proposal:

- **Native first, no MCP.** For OMP, subagents use its own task tool, with the `task` role on the
  local Qwen route. Claude and Codex use their own subagent tools. Stroll's MCP spawn tools stay
  for one case only: a cross-provider child, such as a Claude planner handing work to Qwen
  workers. For OMP, that spawn becomes a native OMP extension tool (`stroll_spawn(role, task)`)
  instead of an MCP server, so local workers need no MCP at all.
- **Spawn by role, not by model.** A spawn names a role (`worker`, `reviewer`); the daemon resolves
  the role's route. The model never picks providers.
- **Shown in place.** Subagents appear as rows inside the parent's turn (name, status, one-line
  progress, elapsed time), and nested under the parent's row in the sidebar, collapsed by
  default. Opening one shows it in a side panel next to the parent. A new tab only opens when
  asked (⌘-click). This replaces "every subagent is a tab".

## 3. The brief and the handoff packet

The ledger already holds everything; what fails over is a small, current summary of it.

- **The brief.** After every completed turn, a local model (the `smol` role on the Sparks, with
  `builtInFallbacks: false`) updates a per-thread brief: the goal, decisions made, current
  state, open items, and files touched. It is a few hundred words, stored next to the timeline.
  When the provider produces its own compaction summary (Claude, Codex, and OMP all do), that
  summary is an input to the brief rather than a replacement for it. The brief costs one small
  local call per turn.
- **The handoff packet** is what a fallback profile receives: the brief, the original request,
  the latest user message, the last five tool calls with arguments and trimmed results, and the
  workspace's `git status` and diff stat. It is built from the ledger at the moment of failover,
  so it is current even if the brief lags a turn.
- **The Context button.** The thread header gets a Context button. It opens a sheet that shows the
  brief (editable; an edit is kept and used in the next handoff), a preview of the packet the
  next profile would receive, and the history of failovers on the thread. The user does not have
  to maintain it; it is there to read and correct.

## Order of work

1. **Upstream sync and OMP readiness.** In progress: brings OMP as a first-class provider and the
   Spark setup script. Done when an OMP session completes against a Spark.
2. **Routes with preflight**, applied when a thread starts. This alone gives "skip what is down
   or out of credits" without touching running sessions.
3. **The brief and the Context button.**
4. **Mid-turn failover** using the handoff packet.
5. **Subagents in place**: native-first spawning, in-turn rows, sidebar nesting, side panel.

Each step ships on its own and is useful without the next.

## Decisions needed

- **Cloud fallback and privacy.** The original requirement was that nothing reaches OpenAI.
  Falling back to Codex subscriptions sends the handoff packet to OpenAI. Proposed default: the
  `worker` route is local-only, and planner/reviewer routes may use subscriptions. Confirm or
  change.
- **Automatic or confirmed failover.** Proposed: automatic, with a line in the thread
  ("Continued on Codex (account B): Qwen endpoint unreachable") and an undo that returns to the
  previous profile once it is healthy again.
- **Paid API fallbacks.** DeepSeek, Kimi, and GLM run through OMP with an API key. Which ones, in
  which order, and with what spending cap per day.
