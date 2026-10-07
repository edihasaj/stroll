import {
  constants,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * What a first Stroll start takes from an upstream Paseo home: settings, chat history, projects,
 * schedules, attachments and uploads, and downloaded models. Everything else stays behind on
 * purpose: the server id, keypair, local credential, and push tokens are Paseo's identity (copying
 * them would make Stroll pose as the Paseo host), and logs, receipts, and runtime state are
 * rebuilt. Worktrees stay where they are; chats keep pointing at them by absolute path.
 *
 * Adding an entry here also reaches homes imported before it existed: the next start copies it
 * in (`catchUpPaseoImport`), so the list can grow without a manual migration.
 */
const IMPORTED_ENTRIES = [
  "config.json",
  "agents",
  "projects",
  "schedules",
  "desktop-attachments",
  "uploads",
  "models",
  "loops",
  "opencode-home",
] as const;

const MARKER_FILE = "imported-from-paseo.json";

export interface PaseoImportResult {
  from: string;
  entries: string[];
  pausedSchedules: number;
}

/**
 * Imports only into the default Stroll home (`~/.stroll`), only once, and only when there is a Paseo
 * home to read. It goes by the resolved path, not by which env var chose it: the desktop app hands
 * the daemon its home through `PASEO_HOME`, while dev checkouts, tests, and second daemons use other
 * paths and never import.
 */
export function shouldImportPaseoHome(input: {
  strollHome: string;
  paseoHome: string;
  defaultStrollHome: string;
}): boolean {
  if (path.resolve(input.strollHome) !== path.resolve(input.defaultStrollHome)) return false;
  if (!existsSync(path.join(input.paseoHome, "config.json"))) return false;
  const alreadySetUp = ["config.json", "agents", MARKER_FILE].some((entry) =>
    existsSync(path.join(input.strollHome, entry)),
  );
  return !alreadySetUp;
}

/**
 * Copies the Paseo entries into the Stroll home (APFS clones where the filesystem supports them,
 * so the models do not take the disk twice), drops Paseo's pinned listen address so Stroll keeps
 * its own port, and pauses active schedules so a job does not run in both daemons.
 */
export function importPaseoHome(input: {
  strollHome: string;
  paseoHome: string;
  now?: Date;
}): PaseoImportResult {
  const now = input.now ?? new Date();
  mkdirSync(input.strollHome, { recursive: true });
  const entries: string[] = [];
  for (const entry of IMPORTED_ENTRIES) {
    const source = path.join(input.paseoHome, entry);
    if (!existsSync(source)) continue;
    cpSync(source, path.join(input.strollHome, entry), {
      recursive: true,
      mode: constants.COPYFILE_FICLONE,
      force: false,
    });
    entries.push(entry);
  }
  dropPinnedListen(path.join(input.strollHome, "config.json"));
  const pausedSchedules = pauseActiveSchedules(path.join(input.strollHome, "schedules"), now);
  const result: PaseoImportResult = { from: input.paseoHome, entries, pausedSchedules };
  writeFileSync(
    path.join(input.strollHome, MARKER_FILE),
    `${JSON.stringify({ ...result, importedAt: now.toISOString() }, null, 2)}\n`,
  );
  return result;
}

/**
 * Copies entries that joined `IMPORTED_ENTRIES` after this home was imported. Only homes that came
 * from an import (they carry the marker) are touched, and an entry is copied only when Paseo has
 * it and Stroll does not, so nothing Stroll wrote since is overwritten. Every entry checked is
 * recorded in the marker, so each one is considered once.
 */
export function catchUpPaseoImport(input: {
  strollHome: string;
  now?: Date;
}): PaseoImportResult | null {
  const markerPath = path.join(input.strollHome, MARKER_FILE);
  if (!existsSync(markerPath)) return null;
  const marker: unknown = JSON.parse(readFileSync(markerPath, "utf8"));
  if (!isRecord(marker) || typeof marker.from !== "string") return null;
  const paseoHome = marker.from;
  const recorded = Array.isArray(marker.entries) ? marker.entries : [];
  const pending = IMPORTED_ENTRIES.filter((entry) => !recorded.includes(entry));
  if (pending.length === 0) return null;

  const copied: string[] = [];
  for (const entry of pending) {
    const source = path.join(paseoHome, entry);
    const target = path.join(input.strollHome, entry);
    if (!existsSync(source) || existsSync(target)) continue;
    cpSync(source, target, { recursive: true, mode: constants.COPYFILE_FICLONE, force: false });
    copied.push(entry);
  }
  const now = input.now ?? new Date();
  writeFileSync(
    markerPath,
    `${JSON.stringify(
      { ...marker, entries: [...recorded, ...pending], caughtUpAt: now.toISOString() },
      null,
      2,
    )}\n`,
  );
  return copied.length > 0 ? { from: paseoHome, entries: copied, pausedSchedules: 0 } : null;
}

/**
 * Runs the import on a daemon's first start in the default home, or catches an earlier import up
 * with entries added since; null when there is nothing to do.
 */
export function importPaseoHomeOnFirstRun(input: {
  strollHome: string;
  homeDir?: string;
}): PaseoImportResult | null {
  const homeDir = input.homeDir ?? os.homedir();
  const paseoHome = path.join(homeDir, ".paseo");
  const defaultStrollHome = path.join(homeDir, ".stroll");
  if (!shouldImportPaseoHome({ strollHome: input.strollHome, paseoHome, defaultStrollHome })) {
    return catchUpPaseoImport({ strollHome: input.strollHome });
  }
  return importPaseoHome({ strollHome: input.strollHome, paseoHome });
}

function dropPinnedListen(configPath: string): void {
  if (!existsSync(configPath)) return;
  const config: unknown = JSON.parse(readFileSync(configPath, "utf8"));
  if (!isRecord(config) || !isRecord(config.daemon) || !("listen" in config.daemon)) return;
  const { listen: _paseoListen, ...daemon } = config.daemon;
  writeFileSync(configPath, `${JSON.stringify({ ...config, daemon }, null, 2)}\n`, {
    mode: 0o600,
  });
}

function pauseActiveSchedules(schedulesDir: string, now: Date): number {
  if (!existsSync(schedulesDir)) return 0;
  let paused = 0;
  for (const name of readdirSync(schedulesDir)) {
    if (!name.endsWith(".json")) continue;
    const file = path.join(schedulesDir, name);
    const schedule: unknown = JSON.parse(readFileSync(file, "utf8"));
    if (!isRecord(schedule) || schedule.status !== "active") continue;
    const next = { ...schedule, status: "paused", pausedAt: now.toISOString() };
    writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
    paused += 1;
  }
  return paused;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
