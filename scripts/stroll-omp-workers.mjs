#!/usr/bin/env node
// Point Oh My Pi (omp) at self-hosted OpenAI-compatible endpoints (vLLM / SGLang / LiteLLM on the
// DGX Sparks) and keep every model role local, so an omp agent started from Stroll never calls a
// cloud model by accident. See docs/custom-providers.md "Local Qwen on DGX Spark".
//
//   node scripts/stroll-omp-workers.mjs --check \
//     --endpoint spark-a=http://spark-689b:8000/v1 --endpoint spark-b=http://spark-e118:8000/v1 \
//     --model qwen3.8-flash-next
//
// Without --write it only probes the endpoints and prints the files it would write. With --write it
// merges its providers and settings into ~/.omp/agent/models.yml and config.yml and, when
// --stroll-home is given, enables the omp provider in Stroll and sets Stroll's metadata generation
// to the local model with the built-in cloud fallbacks off. Existing files are merged, never replaced; a YAML file this script cannot
// read as JSON is left alone and the snippet is printed instead.

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import path from "node:path";

const HELP = `Usage: stroll-omp-workers.mjs --endpoint <name>=<baseUrl> [--endpoint ...] --model <id> [options]

  --endpoint name=url   OpenAI-compatible base URL ending in /v1 (repeatable). The first serves the
                        default/housekeeping roles, the second (if any) serves omp subagents (task).
  --model id            Served model id, e.g. qwen3.8-flash-next
  --api-key-env VAR     Read the endpoint key from this env var (default: none, auth "none")
  --context n           Context window in tokens (default 131072; confirm against the served model)
  --max-tokens n        Output token cap per request (default 32768)
  --plan provider/model Model for omp's plan + slow roles (e.g. a subscription model). Default: local.
  --omp-dir dir         omp agent dir (default ~/.omp/agent)
  --stroll-home dir     Also set metadataGeneration in <dir>/config.json (e.g. ~/.stroll)
  --check               Probe each endpoint's /models before anything else
  --write               Write the files (default: print them)
`;

function parseArgs(argv) {
  const args = { endpoints: [], context: 131072, maxTokens: 32768, check: false, write: false };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = () => {
      const value = argv[++i];
      if (value === undefined) throw new Error(`${flag} needs a value`);
      return value;
    };
    if (flag === "--endpoint") {
      const raw = next();
      const eq = raw.indexOf("=");
      if (eq <= 0) throw new Error(`--endpoint expects name=url, got ${raw}`);
      args.endpoints.push({
        name: raw.slice(0, eq),
        baseUrl: raw.slice(eq + 1).replace(/\/+$/, ""),
      });
    } else if (flag === "--model") args.model = next();
    else if (flag === "--api-key-env") args.apiKeyEnv = next();
    else if (flag === "--context") args.context = Number(next());
    else if (flag === "--max-tokens") args.maxTokens = Number(next());
    else if (flag === "--plan") args.plan = next();
    else if (flag === "--omp-dir") args.ompDir = next();
    else if (flag === "--stroll-home") args.strollHome = next();
    else if (flag === "--check") args.check = true;
    else if (flag === "--write") args.write = true;
    else if (flag === "--help" || flag === "-h") args.help = true;
    else throw new Error(`Unknown flag ${flag}`);
  }
  return args;
}

function expandHome(p) {
  return p.startsWith("~/") ? path.join(homedir(), p.slice(2)) : p;
}

function apiKeyFor(args) {
  if (!args.apiKeyEnv) return null;
  const value = process.env[args.apiKeyEnv];
  if (!value) throw new Error(`${args.apiKeyEnv} is not set`);
  return value;
}

async function probe(endpoint, model, apiKey) {
  const started = Date.now();
  try {
    const res = await fetch(`${endpoint.baseUrl}/models`, {
      headers: apiKey ? { authorization: `Bearer ${apiKey}` } : {},
      signal: AbortSignal.timeout(5000),
    });
    const ms = Date.now() - started;
    if (!res.ok) return { ok: false, detail: `HTTP ${res.status} in ${ms}ms` };
    const body = await res.json();
    const ids = Array.isArray(body?.data) ? body.data.map((m) => m.id) : [];
    if (!ids.includes(model)) {
      return {
        ok: false,
        detail: `up in ${ms}ms but does not serve ${model} (serves: ${ids.join(", ") || "nothing"})`,
      };
    }
    return { ok: true, detail: `serves ${model}, ${ms}ms` };
  } catch (error) {
    return { ok: false, detail: error instanceof Error ? error.message : String(error) };
  }
}

// Model roles omp may use on its own (summaries, commit text, memory, subagents). All of them stay
// on the local endpoints; only --plan moves the planning roles elsewhere, and only on request.
const LOCAL_ROLES = ["default", "smol", "commit", "tiny", "memory", "advisor"];

function buildOmpModels(args) {
  const providers = {};
  for (const endpoint of args.endpoints) {
    providers[endpoint.name] = {
      baseUrl: endpoint.baseUrl,
      api: "openai-completions",
      // omp resolves a bare env var name to its value at request time (or `!command`).
      ...(args.apiKeyEnv ? { apiKey: args.apiKeyEnv, auth: "apiKey" } : { auth: "none" }),
      // vLLM / SGLang serve Qwen's thinking through the chat template (enable_thinking), not
      // through OpenAI's reasoning_effort, and reject the developer role.
      compat: { thinkingFormat: "qwen-chat-template", supportsDeveloperRole: false },
      models: [
        {
          id: args.model,
          name: `${args.model} (${endpoint.name})`,
          reasoning: true,
          input: ["text"],
          contextWindow: args.context,
          maxTokens: args.maxTokens,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
        },
      ],
    };
  }
  return { providers };
}

function buildOmpSettings(args) {
  const primary = `${args.endpoints[0].name}/${args.model}`;
  const workers = `${(args.endpoints[1] ?? args.endpoints[0]).name}/${args.model}`;
  const planning = args.plan ?? primary;
  const modelRoles = Object.fromEntries(LOCAL_ROLES.map((role) => [role, primary]));
  modelRoles.task = workers;
  modelRoles.plan = planning;
  modelRoles.slow = planning;
  return {
    modelRoles,
    startup: { checkUpdate: false },
    marketplace: { autoUpdate: "off" },
    telemetry: { otlpExportEnabled: false },
  };
}

function deepMerge(base, patch) {
  if (!base || typeof base !== "object" || Array.isArray(base)) return patch;
  const out = { ...base };
  for (const [key, value] of Object.entries(patch)) {
    out[key] =
      value && typeof value === "object" && !Array.isArray(value)
        ? deepMerge(base[key], value)
        : value;
  }
  return out;
}

// YAML is a superset of JSON, so omp reads a JSON document in models.yml / config.yml. An existing
// hand-written YAML file is not parsed here; the caller gets the snippet to merge by hand.
function mergeJsonFile(file, patch, { write }) {
  let current = {};
  if (existsSync(file)) {
    const text = readFileSync(file, "utf8").trim();
    if (text) {
      try {
        current = JSON.parse(text);
      } catch {
        return {
          file,
          status: "skipped",
          reason: "existing file is not JSON; merge by hand",
          snippet: patch,
        };
      }
    }
  }
  const next = deepMerge(current, patch);
  if (write) {
    mkdirSync(path.dirname(file), { recursive: true });
    const tmp = `${file}.tmp-${process.pid}`;
    writeFileSync(tmp, `${JSON.stringify(next, null, 2)}\n`);
    renameSync(tmp, file);
  }
  return { file, status: write ? "written" : "planned", content: next };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || args.endpoints.length === 0 || !args.model) {
    process.stdout.write(HELP);
    process.exit(args.help ? 0 : 1);
  }
  const apiKey = apiKeyFor(args);

  if (args.check) {
    let healthy = 0;
    for (const endpoint of args.endpoints) {
      const result = await probe(endpoint, args.model, apiKey);
      if (result.ok) healthy++;
      console.log(
        `${result.ok ? "ok  " : "FAIL"} ${endpoint.name} ${endpoint.baseUrl}: ${result.detail}`,
      );
    }
    if (healthy === 0) {
      console.error("No endpoint is serving the model; not writing anything.");
      process.exit(1);
    }
  }

  const ompDir = expandHome(args.ompDir ?? "~/.omp/agent");
  const results = [
    mergeJsonFile(path.join(ompDir, "models.yml"), buildOmpModels(args), args),
    mergeJsonFile(path.join(ompDir, "config.yml"), buildOmpSettings(args), args),
  ];
  if (args.strollHome) {
    results.push(
      mergeJsonFile(
        path.join(expandHome(args.strollHome), "config.json"),
        {
          agents: {
            // omp ships disabled; Stroll lists its models once it is enabled.
            providers: { omp: { enabled: true } },
            metadataGeneration: {
              providers: [{ provider: "omp", model: `${args.endpoints[0].name}/${args.model}` }],
              builtInFallbacks: false,
            },
          },
        },
        args,
      ),
    );
  }

  for (const result of results) {
    console.log(
      `\n# ${result.file} (${result.status}${result.reason ? `: ${result.reason}` : ""})`,
    );
    console.log(JSON.stringify(result.content ?? result.snippet, null, 2));
  }
  if (!args.write) console.log("\nDry run. Re-run with --write to apply.");
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
