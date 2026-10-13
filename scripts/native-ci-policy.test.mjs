import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { load } from "js-yaml";

const repoRoot = new URL("../", import.meta.url);
const pullRequestTypes = ["opened", "synchronize", "reopened", "edited"];
const nativeContexts = [
  ["main push", { name: "push", ref: "refs/heads/main" }, false],
  ["production push", { name: "push", ref: "refs/heads/production" }, true],
  ["tag push", { name: "push", ref: "refs/tags/v1.2.3" }, false],
  ["main pull request", { name: "pull_request", baseRef: "main" }, false],
  ["production PR opened", { name: "pull_request", baseRef: "production", action: "opened" }, true],
  ["production PR edited", { name: "pull_request", baseRef: "production", action: "edited" }, true],
  ["manual native opt-in", { name: "workflow_dispatch", runNative: true }, true],
  [
    "manual native opt-out on production",
    { name: "workflow_dispatch", ref: "refs/heads/production", runNative: false },
    false,
  ],
  [
    "manual native input missing on production",
    { name: "workflow_dispatch", ref: "refs/heads/production" },
    false,
  ],
  ["schedule on production", { name: "schedule", ref: "refs/heads/production" }, false],
  ["merge queue", { name: "merge_group", ref: "refs/heads/production" }, false],
];

const workflows = [
  {
    path: new URL(".github/workflows/ci.yml", repoRoot),
    nativeJobs: ["server-tests-macos"],
    triggerNames: ["merge_group", "pull_request", "push", "workflow_dispatch"],
  },
  {
    path: new URL(".github/workflows/nix.yml", repoRoot),
    nativeJobs: ["build-desktop-darwin"],
    triggerNames: ["pull_request", "push", "workflow_dispatch"],
  },
];

function loadWorkflow(path) {
  return load(readFileSync(path, "utf8"));
}

function isMacosOrXcode(value) {
  if (typeof value === "string") return /macos|xcode/i.test(value);
  if (Array.isArray(value)) return value.some(isMacosOrXcode);
  return false;
}

function evaluateGithubExpression(expression, context) {
  const body = expression.replace(/^\s*\$\{\{\s*|\s*\}\}\s*$/g, "");
  assert.match(body, /^[\s!()&|=.'_a-zA-Z0-9/:-]+$/, `unsupported native guard: ${expression}`);

  const values = {
    "github.event_name": context.name,
    "github.base_ref": context.baseRef ?? "",
    "github.ref_name": context.ref?.replace(/^refs\/heads\//, "") ?? "",
    "github.ref": context.ref ?? "",
    "inputs.run_native": context.runNative,
  };
  const javascript = body
    .replaceAll("!cancelled()", "true")
    .replace(
      /github\.event_name|github\.base_ref|github\.ref_name|github\.ref|inputs\.run_native/g,
      (reference) => JSON.stringify(values[reference]),
    );

  return Function(`"use strict"; return Boolean(${javascript});`)();
}

function pullRequestTriggers(filter, context) {
  return filter.branches.includes(context.baseRef) && filter.types.includes(context.action);
}

function assertNativePolicy(workflow, policy) {
  const trigger = workflow.on;
  assert.deepEqual(Object.keys(trigger).sort(), policy.triggerNames);
  assert.ok(trigger.push.branches.includes("production"));
  assert.ok(trigger.pull_request.branches.includes("production"));
  assert.deepEqual(trigger.pull_request.types, pullRequestTypes);
  assert.ok(trigger.pull_request.types.includes("edited"));
  assert.equal(
    pullRequestTriggers(trigger.pull_request, { baseRef: "production", action: "edited" }),
    true,
  );
  assert.equal(
    pullRequestTriggers(trigger.pull_request, { baseRef: "production", action: "closed" }),
    false,
  );
  assert.deepEqual(trigger.workflow_dispatch.inputs.run_native, {
    description: policy.manualDescription,
    required: false,
    type: "boolean",
    default: false,
  });

  const nativeJobs = Object.entries(workflow.jobs)
    .filter(([, job]) => isMacosOrXcode(job["runs-on"]))
    .map(([jobId]) => jobId)
    .sort();
  assert.deepEqual(nativeJobs, [...policy.nativeJobs].sort());

  for (const jobId of nativeJobs) {
    const guard = workflow.jobs[jobId].if;
    assert.equal(typeof guard, "string", `${jobId} must have a job-level native guard`);
    assert.doesNotMatch(guard, /github\.event\.inputs/);
    assert.match(guard, /inputs\.run_native\s*==\s*true/);
    for (const [name, context, expected] of nativeContexts) {
      assert.equal(evaluateGithubExpression(guard, context), expected, `${jobId}: ${name}`);
    }
  }
}

function policyFor(workflow) {
  return {
    ...workflow,
    manualDescription:
      workflow.nativeJobs[0] === "server-tests-macos"
        ? "Run paid macOS native checks"
        : "Run paid macOS Nix desktop validation",
  };
}

test("actual workflow YAML admits hosted macOS only through the native policy", () => {
  for (const workflow of workflows) {
    assertNativePolicy(loadWorkflow(workflow.path), policyFor(workflow));
  }
});

test("policy checker rejects common hosted-macOS routing regressions", () => {
  for (const workflow of workflows) {
    const parsed = loadWorkflow(workflow.path);
    const policy = policyFor(workflow);
    const mutations = [
      (definition) => {
        definition.on.schedule = [{ cron: "0 0 * * *" }];
      },
      (definition) => {
        definition.on.workflow_dispatch.inputs.run_native.type = "string";
      },
      (definition) => {
        definition.jobs.unconditional_macos = { "runs-on": "macos-14" };
      },
      (definition) => {
        delete definition.on.workflow_dispatch;
      },
      (definition) => {
        definition.on.pull_request.branches = ["main"];
      },
      (definition) => {
        definition.on.pull_request.types = ["opened", "synchronize", "reopened"];
      },
      (definition) => {
        for (const jobId of policy.nativeJobs) {
          definition.jobs[jobId].if = "${{ github.ref_name == 'production' }}";
        }
      },
    ];

    for (const mutate of mutations) {
      const mutated = structuredClone(parsed);
      mutate(mutated);
      assert.throws(() => assertNativePolicy(mutated, policy));
    }
  }
});
