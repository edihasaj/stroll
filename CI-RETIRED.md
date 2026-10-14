# Stroll automation is off

Edi requires Stroll to remain off for GitHub Actions. This standing instruction
applies to every runner platform, including paid macOS jobs, and to CI, packaging,
release, rollout, deployment and synchronization workflows.

Repository Actions are disabled, all 12 existing workflows are individually
disabled, and no workflow run remains active as of 14 October 2026.

Do not enable Actions, enable a workflow, dispatch a run or substitute an external
runner while fixing or verifying this repository. A future request to work on
Stroll does not revoke this instruction. Only a new explicit instruction from
Edi to turn automation back on can change it.

The workflow source remains available for reference. The release procedures in
`docs/release.md` are dormant while this policy applies.

Read-only verification:

```sh
gh api repos/edihasaj/stroll/actions/permissions
gh api repos/edihasaj/stroll/actions/workflows --jq '.workflows[] | {name,state}'
gh api 'repos/edihasaj/stroll/actions/runs?per_page=100' --jq '[.workflow_runs[] | select(.status != "completed") | {id,name,status}]'
```

The expected repository setting is `enabled: false`, every workflow state is
`disabled_manually`, and the active-run list is empty.
