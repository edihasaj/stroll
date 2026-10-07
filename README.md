<p align="center">
  <img src="packages/website/public/logo.svg" width="64" height="64" alt="Stroll logo">
</p>

<h1 align="center">Stroll</h1>

<p align="center">One place to run Claude Code, Codex, Copilot, OpenCode, Pi, Oh My Pi, Antigravity, Muse Code, and local models on your own computers.</p>

<p align="center">
  <em>A fork of <a href="https://github.com/getpaseo/paseo">Paseo</a> by Mohamed Boudra, under the Apache-2.0 license. See <a href="NOTICE">NOTICE</a>.</em>
</p>

Run agents in parallel on your own machines and follow them from your desk or your phone.

- **Self-hosted:** agents run on your machine with your dev environment, tools, configs, and skills.
- **Multi-provider:** Claude Code, Codex, Copilot, OpenCode, Pi, Oh My Pi, Antigravity, and Muse Code behind one interface.
- **Local models:** send work to models on your own hardware, with failover to subscription or API models.
- **Subagents on any of your computers:** an agent can start subagents on another machine and hears back when they finish.
- **Private by default:** no telemetry, no tracking, no forced log-ins. Local models stay local.

## What Stroll adds to Paseo

- **Routes and failover:** an ordered list of agent profiles per task. When one stops working mid-task, the next continues with a handoff, so you don't re-explain the work. See [docs/agent-routes.md](docs/agent-routes.md).
- **Cross-computer subagents:** daemons peer with each other, and `create_agent` takes a `computer`. See [docs/peers.md](docs/peers.md).
- **A Codex-style interface:** finished work folds behind "Worked for …", the live footer names the current step, subagents get their own panel, file and folder links open wherever they appear, and new or changed hooks get a review button.

## Getting started

Stroll runs a local server, the daemon, that manages your coding agents. The desktop app, web app, mobile app, and CLI connect to it.

You need at least one agent CLI installed and signed in, such as [Claude Code](https://docs.anthropic.com/en/docs/claude-code), [Codex](https://github.com/openai/codex), [GitHub Copilot](https://github.com/features/copilot/cli/), [OpenCode](https://github.com/anomalyco/opencode), or [Pi](https://pi.dev).

### Desktop app (macOS)

Download a macOS build from [Releases](https://github.com/edihasaj/stroll/releases) when one is published, or build it yourself:

```bash
npm ci
npm run build:desktop    # Stroll.app lands in packages/desktop/release
```

Open the app and the daemon starts. The app bundles the `stroll` CLI.

Stroll can run beside an upstream Paseo install. It keeps its own home (`~/.stroll`) and port (`6867`). On its first start it imports your Paseo settings, chat history, and projects from `~/.paseo` if there are any, and pauses imported schedules so they don't run twice. Paseo's own files are not changed.

### CLI

```bash
stroll ls                                   # list agents
stroll run --provider codex "implement X"   # start an agent
stroll attach <id>                          # stream its output
stroll send <id> "also add tests"           # follow-up task
stroll peer add studio ssh://you@studio     # let agents use another computer
```

Run `stroll --help` for the rest.

## Development

```bash
npm ci
npm run dev            # dev daemon on 127.0.0.1:6768 with state in .dev/paseo-home
npm run dev:app        # Expo web against the dev daemon
npm run dev:desktop    # Electron desktop against the dev daemon
npm run typecheck
npm run lint
```

Package map:

- `packages/server`: the daemon (agent processes, WebSocket API, MCP server)
- `packages/app`: Expo client (iOS, Android, web)
- `packages/cli`: the `stroll` CLI
- `packages/desktop`: Electron desktop app
- `packages/relay`: relay transport and encryption used by the daemon and clients
- `packages/protocol`, `packages/client`: wire schemas and the client library

Start with [CLAUDE.md](CLAUDE.md) for the docs map, and [docs/development.md](docs/development.md) for setup details. Package names stay `@getpaseo/*` so merging upstream stays cheap; see [docs/glossary.md](docs/glossary.md) for what keeps the Paseo name and why.

## Upstream

Stroll tracks Paseo and merges it regularly. Paseo is built by Mohamed Boudra and funded by the people who use it. If Stroll is useful to you, consider [sponsoring Paseo](https://github.com/sponsors/boudra).

## License

Apache-2.0. Stroll is a derivative work of Paseo; see [LICENSE](LICENSE) and [NOTICE](NOTICE).
