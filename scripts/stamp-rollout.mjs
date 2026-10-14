import fs from "node:fs";
import { dump, load } from "js-yaml";
import { isMainModule } from "./is-main-module.mjs";

export function stampRollout({ releaseDate, rolloutHours, sourceSha }, paths) {
  if (sourceSha !== undefined && !/^[0-9a-f]{40}$/.test(sourceSha)) {
    throw new Error("sourceSha must be a full commit SHA");
  }
  if (releaseDate === undefined && rolloutHours === undefined && sourceSha === undefined) {
    throw new Error("stampRollout requires releaseDate, rolloutHours or sourceSha");
  }
  for (const filePath of paths) {
    const manifest = load(fs.readFileSync(filePath, "utf8")) ?? {};
    const next = { ...manifest };
    if (releaseDate !== undefined) next.releaseDate = releaseDate;
    if (rolloutHours !== undefined) next.rolloutHours = rolloutHours;
    if (sourceSha !== undefined) next.sourceSha = sourceSha;
    fs.writeFileSync(filePath, dump(next, { lineWidth: -1, noRefs: true }));
  }
}

function parseArgs(argv) {
  const opts = {};
  const paths = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--release-date") {
      opts.releaseDate = argv[++i];
    } else if (arg === "--source-sha") {
      opts.sourceSha = argv[++i];
    } else if (arg === "--rollout-hours") {
      const raw = argv[++i];
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed < 0) {
        throw new Error(`--rollout-hours must be a non-negative number, got ${raw}`);
      }
      opts.rolloutHours = parsed;
    } else {
      paths.push(arg);
    }
  }
  return { opts, paths };
}

if (isMainModule(import.meta.url)) {
  const { opts, paths } = parseArgs(process.argv.slice(2));
  if (
    paths.length === 0 ||
    (opts.releaseDate === undefined &&
      opts.rolloutHours === undefined &&
      opts.sourceSha === undefined)
  ) {
    throw new Error(
      "Usage: node scripts/stamp-rollout.mjs [--source-sha <sha>] [--release-date <iso>] [--rollout-hours <n>] <yaml-path>...",
    );
  }
  stampRollout(opts, paths);
}
