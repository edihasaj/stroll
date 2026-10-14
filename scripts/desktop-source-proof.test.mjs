import { test, expect } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { stampRollout } from "./stamp-rollout.mjs";
import { validateDesktopManifests } from "./validate-desktop-manifests.mjs";
import { mergeMacManifest } from "./merge-mac-manifest.mjs";

const sourceSha = "a".repeat(40);
const version = "1.0.0";
const releaseDate = "2026-10-14T00:00:00.000Z";
const expected = { sourceSha, version, releaseDate, rolloutHours: 36 };

test("reused platform manifests require the exact built commit and version", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "stroll-source-proof-"));
  try {
    const files = ["latest-mac.yml", "latest-linux.yml", "latest.yml"].map((name) =>
      path.join(dir, name),
    );
    for (const file of files) {
      writeFileSync(file, `version: ${version}\nminimumSystemVersion: 22.0.0\n`);
      stampRollout(expected, [file]);
    }
    expect(() => validateDesktopManifests(expected, files)).not.toThrow();
    const original = readFileSync(files[1], "utf8");
    for (const bad of [
      original.replace(sourceSha, "b".repeat(40)),
      original.replace(`version: ${version}`, "version: 0.9.0"),
      original.replace(/^sourceSha:.*\n/m, ""),
    ]) {
      writeFileSync(files[1], bad);
      expect(() => validateDesktopManifests(expected, files)).toThrow(/source SHA or version/);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Mac manifests cannot merge architectures from different source commits", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "stroll-mixed-arch-"));
  try {
    const arm = path.join(dir, "arm.yml");
    const intel = path.join(dir, "intel.yml");
    writeFileSync(arm, `version: ${version}\nsourceSha: ${sourceSha}\n`);
    writeFileSync(intel, `version: ${version}\nsourceSha: ${"b".repeat(40)}\n`);
    expect(() => mergeMacManifest(arm, intel, path.join(dir, "out.yml"))).toThrow(
      /same source SHA/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
