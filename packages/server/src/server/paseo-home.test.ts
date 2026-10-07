import { existsSync, mkdtempSync, rmSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { resolvePaseoHome } from "./paseo-home.js";
describe("resolvePaseoHome", () => {
  test("resolves PASEO_HOME without creating it", () => {
    const parent = mkdtempSync(path.join(tmpdir(), "paseo-home-parent-"));
    const paseoHome = path.join(parent, "home");
    try {
      expect(resolvePaseoHome({ PASEO_HOME: paseoHome })).toBe(paseoHome);
      expect(existsSync(paseoHome)).toBe(false);
    } finally {
      rmSync(parent, { recursive: true, force: true });
    }
  });

  test("ignores a PASEO_HOME that names upstream Paseo's default home", () => {
    expect(resolvePaseoHome({ PASEO_HOME: "~/.paseo" })).toBe(path.join(homedir(), ".stroll"));
    expect(resolvePaseoHome({ PASEO_HOME: path.join(homedir(), ".paseo") })).toBe(
      path.join(homedir(), ".stroll"),
    );
  });

  test("lets STROLL_HOME choose any home, upstream Paseo's included", () => {
    expect(resolvePaseoHome({ STROLL_HOME: "~/.paseo", PASEO_HOME: "/tmp/dev-home" })).toBe(
      path.join(homedir(), ".paseo"),
    );
  });
});
