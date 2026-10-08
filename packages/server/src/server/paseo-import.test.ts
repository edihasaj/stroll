import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  catchUpPaseoImport,
  importPaseoHome,
  importPaseoHomeOnFirstRun,
  shouldImportPaseoHome,
} from "./paseo-import.js";

const NOW = new Date("2026-10-07T18:00:00.000Z");

function write(file: string, value: unknown): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, typeof value === "string" ? value : JSON.stringify(value));
}

function readJson(file: string): Record<string, unknown> {
  return JSON.parse(readFileSync(file, "utf8")) as Record<string, unknown>;
}

/** A home directory with a Paseo setup in `.paseo` and nothing yet in `.stroll`. */
function createHomes() {
  const homeDir = mkdtempSync(path.join(os.tmpdir(), "stroll-import-"));
  const paseoHome = path.join(homeDir, ".paseo");
  const strollHome = path.join(homeDir, ".stroll");
  write(path.join(paseoHome, "config.json"), {
    version: 1,
    daemon: { listen: "127.0.0.1:6767", mcp: { injectIntoAgents: true } },
  });
  write(path.join(paseoHome, "agents", "repo", "a1.json"), { id: "a1" });
  write(path.join(paseoHome, "projects", "projects.json"), []);
  write(path.join(paseoHome, "schedules", "s-active.json"), { id: "s1", status: "active" });
  write(path.join(paseoHome, "schedules", "s-done.json"), { id: "s2", status: "completed" });
  write(path.join(paseoHome, "server-id"), "srv_paseo");
  write(path.join(paseoHome, "daemon-keypair.json"), { secret: "x" });
  write(path.join(paseoHome, "local-credential"), "token");
  write(path.join(paseoHome, "daemon.log"), "log");
  write(path.join(paseoHome, "agent-requests", "r1.json"), {});
  return { homeDir, paseoHome, strollHome };
}

describe("importPaseoHome", () => {
  it("copies history and settings but not Paseo's identity, logs, or receipts", () => {
    const { paseoHome, strollHome } = createHomes();
    const result = importPaseoHome({ strollHome, paseoHome, now: NOW });

    expect(result.entries).toEqual(["config.json", "agents", "projects", "schedules"]);
    expect(existsSync(path.join(strollHome, "agents", "repo", "a1.json"))).toBe(true);
    for (const skipped of [
      "server-id",
      "daemon-keypair.json",
      "local-credential",
      "daemon.log",
      "agent-requests",
    ]) {
      expect(existsSync(path.join(strollHome, skipped))).toBe(false);
    }
  });

  it("drops Paseo's pinned listen address and keeps the other settings", () => {
    const { paseoHome, strollHome } = createHomes();
    importPaseoHome({ strollHome, paseoHome, now: NOW });

    expect(readJson(path.join(strollHome, "config.json"))).toEqual({
      version: 1,
      daemon: { mcp: { injectIntoAgents: true } },
    });
  });

  it("pauses active schedules so they do not also run in Stroll", () => {
    const { paseoHome, strollHome } = createHomes();
    const result = importPaseoHome({ strollHome, paseoHome, now: NOW });

    expect(result.pausedSchedules).toBe(1);
    expect(readJson(path.join(strollHome, "schedules", "s-active.json"))).toMatchObject({
      status: "paused",
      pausedAt: NOW.toISOString(),
    });
    expect(readJson(path.join(strollHome, "schedules", "s-done.json")).status).toBe("completed");
    expect(readJson(path.join(paseoHome, "schedules", "s-active.json")).status).toBe("active");
  });
});

describe("importPaseoHomeOnFirstRun", () => {
  it("imports once into the default home and then leaves it alone", () => {
    const { homeDir, strollHome } = createHomes();

    expect(importPaseoHomeOnFirstRun({ strollHome, homeDir })).not.toBeNull();
    expect(existsSync(path.join(strollHome, "imported-from-paseo.json"))).toBe(true);
    expect(importPaseoHomeOnFirstRun({ strollHome, homeDir })).toBeNull();
  });

  it("never imports into a home other than the default", () => {
    const { homeDir } = createHomes();

    expect(
      importPaseoHomeOnFirstRun({ strollHome: path.join(homeDir, "dev-home"), homeDir }),
    ).toBeNull();
  });
});

describe("catchUpPaseoImport", () => {
  /** A Stroll home imported before `uploads` joined the import list. */
  function createEarlierImport() {
    const homes = createHomes();
    write(path.join(homes.paseoHome, "uploads", "upload_1", "photo.png"), "png");
    write(path.join(homes.strollHome, "imported-from-paseo.json"), {
      from: homes.paseoHome,
      entries: ["config.json", "agents", "projects", "schedules"],
      pausedSchedules: 1,
      importedAt: NOW.toISOString(),
    });
    return homes;
  }

  it("copies entries added to the import since, once", () => {
    const { strollHome } = createEarlierImport();

    const result = catchUpPaseoImport({ strollHome, now: NOW });

    expect(result?.entries).toEqual(["uploads"]);
    expect(existsSync(path.join(strollHome, "uploads", "upload_1", "photo.png"))).toBe(true);
    expect(readJson(path.join(strollHome, "imported-from-paseo.json")).entries).toContain(
      "uploads",
    );
    expect(catchUpPaseoImport({ strollHome, now: NOW })).toBeNull();
  });

  it("never overwrites what the Stroll home already has", () => {
    const { strollHome } = createEarlierImport();
    write(path.join(strollHome, "uploads", "upload_2", "own.png"), "mine");

    expect(catchUpPaseoImport({ strollHome, now: NOW })).toBeNull();
    expect(existsSync(path.join(strollHome, "uploads", "upload_1"))).toBe(false);
    expect(existsSync(path.join(strollHome, "uploads", "upload_2", "own.png"))).toBe(true);
  });

  it("never brings an archived or deleted chat back from the Paseo home", () => {
    const { paseoHome, strollHome } = createEarlierImport();
    const archived = { id: "a1", archivedAt: "2026-10-01T00:00:00.000Z" };
    write(path.join(strollHome, "agents", "repo", "a1.json"), archived);
    write(path.join(paseoHome, "agents", "repo", "a1.json"), { id: "a1", archivedAt: null });
    write(path.join(paseoHome, "agents", "repo", "a2.json"), { id: "a2" });

    catchUpPaseoImport({ strollHome, now: NOW });

    expect(readJson(path.join(strollHome, "agents", "repo", "a1.json"))).toEqual(archived);
    expect(existsSync(path.join(strollHome, "agents", "repo", "a2.json"))).toBe(false);
  });

  it("leaves homes that were never imported alone", () => {
    const { strollHome } = createHomes();
    mkdirSync(strollHome, { recursive: true });

    expect(catchUpPaseoImport({ strollHome, now: NOW })).toBeNull();
    expect(existsSync(path.join(strollHome, "imported-from-paseo.json"))).toBe(false);
  });
});

describe("shouldImportPaseoHome", () => {
  it("skips a Stroll home that already has a config", () => {
    const { paseoHome, strollHome } = createHomes();
    write(path.join(strollHome, "config.json"), {});

    expect(shouldImportPaseoHome({ strollHome, paseoHome, defaultStrollHome: strollHome })).toBe(
      false,
    );
  });

  it("skips when there is no Paseo setup to read", () => {
    const { homeDir, strollHome } = createHomes();

    expect(
      shouldImportPaseoHome({
        strollHome,
        paseoHome: path.join(homeDir, "missing"),
        defaultStrollHome: strollHome,
      }),
    ).toBe(false);
  });
});
