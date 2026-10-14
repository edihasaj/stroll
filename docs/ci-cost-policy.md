---
summary: "All Stroll GitHub Actions are disabled repository-wide to stop CI spending."
read_when:
  - Changing GitHub Actions runners or release triggers.
  - Requesting a production native build or investigating Actions charges.
---

# CI cost policy

## All Actions are disabled

Edi requested that Stroll CI be disabled completely on October 14, 2026.
The GitHub repository Actions setting is `enabled=false`. This blocks every
workflow on every branch, including Linux, Windows, macOS, manual dispatches,
release packaging and scheduled jobs. No new workflow file can bypass it.

Do not enable Actions to test a change or perform a release. A future re-enable
requires a new explicit owner request. Run validation locally instead. Existing
artifacts/cache storage are not deleted by this setting and can still count
toward GitHub storage usage.

The guards below remain in the checked-in workflows as defense in depth if
the owner later chooses to re-enable Actions.

A branch push, tag push, production PR, schedule, or ordinary dispatch must not
allocate a paid Mac. Native job guards require an explicit dispatch of
`production` with the typed native opt-in enabled. The opt-in defaults to false.
Publication additionally requires its own affirmative publish input where
present; a diagnostic is never a substitute for release verification.

Promote the reviewed workflow changes to `production` before requesting a
build. Do not dispatch historical tags that contain old workflow definitions,
rerun old paid jobs, or enable a workflow merely to check its configuration.
Release/package workflows remain disabled after this change. Explicit native
builds still incur normal GitHub charges; this is not a zero-dollar account cap.

The Darwin filesystem-observation lane is optional manual coverage. Desktop release defaults to Linux and nonpublication; macOS additionally requires `run_native=true`. Desktop source overrides were removed, and the version tag must match production before Mac allocation.

## Local verification

Run `ruby scripts/test-ci-cost-policy.rb`. It parses the actual workflow YAML,
rejects automatic/default or nonproduction native allocation, and exercises
existing production-tag identity checks when present. Keep the existing
repository-specific CI/signing contracts as well. Configuration verification
must not dispatch paid hosted jobs.
