import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildPaseoAppStateImportMarker,
  decidePaseoAppStateImport,
  PASEO_APP_STATE_ALLOWLIST,
  resolvePaseoAppStateImportPaths,
  sanitizePaseoAppStateValue,
  selectPaseoAppStateEntriesToImport,
} from "./paseo-app-state-import.js";

describe("paseo-app-state-import", () => {
  describe("PASEO_APP_STATE_ALLOWLIST", () => {
    it("is exactly the reviewed set of device-local keys", () => {
      expect(PASEO_APP_STATE_ALLOWLIST).toEqual([
        "@paseo:create-agent-preferences",
        "@paseo:settings",
        "@paseo:app-settings",
        "@paseo:settings-migrations",
        "@paseo:keyboard-shortcut-overrides",
        "@paseo:preferred-editor",
        "@paseo:changes-preferences",
        "@paseo:sidebar-callout-dismissals",
      ]);
    });

    it("never includes a key known to carry a Paseo host or device id", () => {
      const excluded = [
        "@paseo:daemon-registry",
        "@paseo:client-id-v1",
        "@paseo:e2e",
        "paseo:last-workspace-route-selection",
        "@paseo:project-icon-cache",
        "@paseo:replica-cache",
        "@paseo:review-draft-store",
      ];
      for (const key of excluded) {
        expect(PASEO_APP_STATE_ALLOWLIST).not.toContain(key);
      }
    });
  });

  describe("resolvePaseoAppStateImportPaths", () => {
    it("places Paseo's userData, its Local Storage dir, and Stroll's marker consistently", () => {
      const paths = resolvePaseoAppStateImportPaths({
        appDataDir: "/Users/edi/Library/Application Support",
        strollUserDataDir: "/Users/edi/Library/Application Support/Stroll",
      });

      expect(paths).toEqual({
        paseoAppDataDir: path.join("/Users/edi/Library/Application Support", "Paseo"),
        paseoLocalStorageDir: path.join(
          "/Users/edi/Library/Application Support",
          "Paseo",
          "Local Storage",
        ),
        markerPath: path.join(
          "/Users/edi/Library/Application Support/Stroll",
          "imported-paseo-app-state.json",
        ),
      });
    });
  });

  describe("decidePaseoAppStateImport", () => {
    it("imports once packaged, un-marked, and Paseo data exists", () => {
      expect(
        decidePaseoAppStateImport({
          isPackaged: true,
          markerExists: false,
          paseoLocalStorageExists: true,
        }),
      ).toEqual({ shouldImport: true });
    });

    it("skips dev runs even if Paseo data exists and no marker is present", () => {
      expect(
        decidePaseoAppStateImport({
          isPackaged: false,
          markerExists: false,
          paseoLocalStorageExists: true,
        }),
      ).toEqual({ shouldImport: false, reason: "not-packaged" });
    });

    it("skips once the marker exists", () => {
      expect(
        decidePaseoAppStateImport({
          isPackaged: true,
          markerExists: true,
          paseoLocalStorageExists: true,
        }),
      ).toEqual({ shouldImport: false, reason: "marker-exists" });
    });

    it("skips when there is no Paseo Local Storage to read", () => {
      expect(
        decidePaseoAppStateImport({
          isPackaged: true,
          markerExists: false,
          paseoLocalStorageExists: false,
        }),
      ).toEqual({ shouldImport: false, reason: "no-paseo-data" });
    });
  });

  describe("sanitizePaseoAppStateValue", () => {
    it("passes keys with no sanitizer through unchanged", () => {
      const raw = JSON.stringify({ "cmd+k": "cmd+j" });
      expect(sanitizePaseoAppStateValue("@paseo:keyboard-shortcut-overrides", raw)).toBe(raw);
    });

    it("strips usage.serverId from app-settings", () => {
      const raw = JSON.stringify({
        theme: "dark",
        usage: { displayAs: "remaining", pins: [], serverId: "srv_paseo_host" },
      });

      const sanitized = sanitizePaseoAppStateValue("@paseo:app-settings", raw);

      expect(JSON.parse(sanitized as string)).toEqual({
        theme: "dark",
        usage: { displayAs: "remaining", pins: [] },
      });
    });

    it("strips usage.serverId from the legacy settings key the same way", () => {
      const raw = JSON.stringify({ usage: { displayAs: "used", serverId: "srv_paseo_host" } });

      const sanitized = sanitizePaseoAppStateValue("@paseo:settings", raw);

      expect(JSON.parse(sanitized as string)).toEqual({ usage: { displayAs: "used" } });
    });

    it("leaves app-settings alone when usage has no serverId", () => {
      const raw = JSON.stringify({ theme: "dark", usage: { displayAs: "used", pins: null } });
      expect(JSON.parse(sanitizePaseoAppStateValue("@paseo:app-settings", raw) as string)).toEqual({
        theme: "dark",
        usage: { displayAs: "used", pins: null },
      });
    });

    it("strips a top-level serverId from create-agent-preferences' legacy shape", () => {
      const raw = JSON.stringify({ provider: "anthropic", serverId: "srv_paseo_host" });

      const sanitized = sanitizePaseoAppStateValue("@paseo:create-agent-preferences", raw);

      expect(JSON.parse(sanitized as string)).toEqual({ provider: "anthropic" });
    });

    it("drops a value under a sanitized key that is not valid JSON", () => {
      expect(sanitizePaseoAppStateValue("@paseo:app-settings", "{not json")).toBeNull();
    });
  });

  describe("selectPaseoAppStateEntriesToImport", () => {
    it("imports allowlisted keys Paseo has and Stroll lacks, sanitized", () => {
      const entries = selectPaseoAppStateEntriesToImport({
        sourceEntries: {
          "@paseo:preferred-editor": "vscode",
          "@paseo:app-settings": JSON.stringify({ usage: { serverId: "srv_paseo_host" } }),
        },
        strollHasKey: () => false,
      });

      expect(entries).toEqual([
        { key: "@paseo:app-settings", value: JSON.stringify({ usage: {} }) },
        { key: "@paseo:preferred-editor", value: "vscode" },
      ]);
    });

    it("skips keys Paseo never set", () => {
      const entries = selectPaseoAppStateEntriesToImport({
        sourceEntries: { "@paseo:preferred-editor": null },
        strollHasKey: () => false,
      });
      expect(entries).toEqual([]);
    });

    it("skips keys Stroll already has", () => {
      const entries = selectPaseoAppStateEntriesToImport({
        sourceEntries: { "@paseo:preferred-editor": "vscode" },
        strollHasKey: (key) => key === "@paseo:preferred-editor",
      });
      expect(entries).toEqual([]);
    });

    it("ignores a non-allowlisted key even if present in sourceEntries", () => {
      const entries = selectPaseoAppStateEntriesToImport({
        sourceEntries: { "@paseo:daemon-registry": JSON.stringify([{ port: 6767 }]) },
        strollHasKey: () => false,
      });
      expect(entries).toEqual([]);
    });

    it("drops an entry whose sanitized value is malformed JSON", () => {
      const entries = selectPaseoAppStateEntriesToImport({
        sourceEntries: { "@paseo:app-settings": "{not json" },
        strollHasKey: () => false,
      });
      expect(entries).toEqual([]);
    });
  });

  describe("buildPaseoAppStateImportMarker", () => {
    it("records the source dir, an ISO timestamp, and key names only", () => {
      const marker = buildPaseoAppStateImportMarker({
        from: "/Users/edi/Library/Application Support/Paseo",
        keys: ["@paseo:preferred-editor", "@paseo:app-settings"],
        now: new Date("2026-01-02T03:04:05.000Z"),
      });

      expect(marker).toEqual({
        from: "/Users/edi/Library/Application Support/Paseo",
        importedAt: "2026-01-02T03:04:05.000Z",
        keys: ["@paseo:preferred-editor", "@paseo:app-settings"],
      });
    });
  });
});
