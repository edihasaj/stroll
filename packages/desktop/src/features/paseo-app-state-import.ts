import path from "node:path";

/**
 * What a first Stroll start copies from Paseo's renderer storage (origin `paseo://app`) into
 * Stroll's own renderer storage (origin `stroll://app`), so moving from Paseo does not mean
 * redoing model/profile defaults, settings, shortcuts, and dismissed callouts. This mirrors
 * `packages/server/src/server/paseo-import.ts`, which does the same for the daemon home; this
 * module covers the part of app state that only ever lived in the renderer's localStorage.
 *
 * Desktop does not depend on `@getpaseo/app`, so each key below is a literal copy of the
 * constant the app package defines at the cited path, not an import.
 *
 * Included — device-local UI state and defaults, sanitized where a key can carry a host id:
 * - `@paseo:create-agent-preferences` (packages/app/src/create-agent-preferences/storage.ts):
 *   provider/model/launch-target defaults for the New Workspace composer. A pre-rename shape of
 *   this key carried a `serverId`; `sanitizePaseoAppStateValue` strips a top-level one so an old
 *   Paseo install's host id never reaches Stroll's copy, even though the app's own read path
 *   already drops it the same way before use.
 * - `@paseo:settings` / `@paseo:app-settings` (packages/app/src/hooks/use-settings/keys.ts): the
 *   settings blob, current key and its pre-rename predecessor. Both nest `usage.serverId` — "the
 *   host the user picked to show usage for" — which names a specific daemon.
 *   `sanitizePaseoAppStateValue` nulls it so Stroll's usage sidebar picks its own host instead of
 *   pointing at a server id it never registered.
 * - `@paseo:settings-migrations` (same file): the applied-migration marker. Carrying it over
 *   keeps Stroll from re-applying migrations the imported settings already reflect. It is a list
 *   of migration ids, never a host id.
 * - `@paseo:keyboard-shortcut-overrides`, `@paseo:preferred-editor`, `@paseo:changes-preferences`,
 *   `@paseo:sidebar-callout-dismissals`: binding overrides, an editor id, diff-viewer flags, and
 *   dismissed callout ids. None of them name a host.
 *
 * Excluded — anything that names a Paseo host, server, or device, or is a rebuildable cache:
 * - `@paseo:daemon-registry`: the saved host list, including Paseo's own `localhost:6767` entry;
 *   importing it would add Paseo's daemon as a connection target inside Stroll.
 * - `@paseo:client-id-v1`: this installation's device id.
 * - `@paseo:expo-push-token:*`, `paseo:last-workspace-route-selection` (embeds `serverId` and
 *   `workspaceId`), `@paseo:legacy-favorites-to-agent-profiles:v1:<serverId>` (a migration marker
 *   keyed by Paseo's server id), `@paseo:e2e`: each names a specific host, device, or is
 *   test-only.
 * - `@paseo/provider-snapshot*` (v1 and v2), `@paseo:project-icon-cache`, `@paseo:replica-cache`,
 *   `@paseo:review-draft-store`: caches and drafts that rebuild from the daemon; copying stale
 *   ones risks showing Paseo-era state Stroll's own daemon has already superseded.
 */
const CREATE_AGENT_PREFERENCES_KEY = "@paseo:create-agent-preferences";
const LEGACY_SETTINGS_KEY = "@paseo:settings";
const APP_SETTINGS_KEY = "@paseo:app-settings";
const SETTINGS_MIGRATIONS_KEY = "@paseo:settings-migrations";
const KEYBOARD_SHORTCUT_OVERRIDES_KEY = "@paseo:keyboard-shortcut-overrides";
const PREFERRED_EDITOR_KEY = "@paseo:preferred-editor";
const CHANGES_PREFERENCES_KEY = "@paseo:changes-preferences";
const SIDEBAR_CALLOUT_DISMISSALS_KEY = "@paseo:sidebar-callout-dismissals";

export const PASEO_APP_STATE_ALLOWLIST = [
  CREATE_AGENT_PREFERENCES_KEY,
  LEGACY_SETTINGS_KEY,
  APP_SETTINGS_KEY,
  SETTINGS_MIGRATIONS_KEY,
  KEYBOARD_SHORTCUT_OVERRIDES_KEY,
  PREFERRED_EDITOR_KEY,
  CHANGES_PREFERENCES_KEY,
  SIDEBAR_CALLOUT_DISMISSALS_KEY,
] as const;

export type PaseoAppStateKey = (typeof PASEO_APP_STATE_ALLOWLIST)[number];

/**
 * Scheme the temp session serves Paseo's copied storage from, so a hidden window can read it
 * under the same origin (`paseo://app`) Paseo's renderer used. Registered as privileged alongside
 * `stroll` in `main.ts`'s `protocol.registerSchemesAsPrivileged` call, which must happen before
 * `app.whenReady()`.
 */
export const PASEO_PROTOCOL_SCHEME = "paseo";

/**
 * Reserved path on Stroll's own scheme that loads a blank page instead of the app bundle, so a
 * hidden window can read and write `stroll://app`'s localStorage before the real window boots.
 */
export const STROLL_APP_STATE_IMPORT_PATH = "/__paseo-import";

/** Lives in Stroll's userData, next to (not inside) `imported-from-paseo.json`. */
export const PASEO_APP_STATE_IMPORT_MARKER_FILE = "imported-paseo-app-state.json";

/** Upper bound on the whole import step; startup continues past it either way. */
export const PASEO_APP_STATE_IMPORT_TIMEOUT_MS = 5_000;

export function buildPaseoAppStateImportBlankPageHtml(): string {
  return '<!doctype html><html><head><meta charset="utf-8"></head><body></body></html>';
}

export interface PaseoAppStateImportPaths {
  paseoAppDataDir: string;
  paseoLocalStorageDir: string;
  markerPath: string;
}

/**
 * `appDataDir` is Electron's `app.getPath("appData")`; `strollUserDataDir` is Stroll's own
 * `app.getPath("userData")`. Paseo's userData sits at `<appData>/Paseo` on every platform because
 * its productName is "Paseo" and it never overrides the userData path (same assumption `main.ts`
 * already makes for dev-worktree isolation).
 */
export function resolvePaseoAppStateImportPaths(input: {
  appDataDir: string;
  strollUserDataDir: string;
}): PaseoAppStateImportPaths {
  const paseoAppDataDir = path.join(input.appDataDir, "Paseo");
  return {
    paseoAppDataDir,
    paseoLocalStorageDir: path.join(paseoAppDataDir, "Local Storage"),
    markerPath: path.join(input.strollUserDataDir, PASEO_APP_STATE_IMPORT_MARKER_FILE),
  };
}

export type PaseoAppStateImportSkipReason = "not-packaged" | "marker-exists" | "no-paseo-data";

export type PaseoAppStateImportDecision =
  | { shouldImport: false; reason: PaseoAppStateImportSkipReason }
  | { shouldImport: true };

/**
 * Decided from facts the caller gathers (packaged state, marker presence, source directory
 * presence) rather than from paths directly, so the decision is testable without touching disk.
 * Dev runs (`!isPackaged`) always skip: they serve the renderer from the Expo dev server
 * (`EXPO_DEV_URL`, default `http://localhost:8081`), never from `stroll://app`, so there is no
 * matching origin to write into.
 */
export function decidePaseoAppStateImport(input: {
  isPackaged: boolean;
  markerExists: boolean;
  paseoLocalStorageExists: boolean;
}): PaseoAppStateImportDecision {
  if (!input.isPackaged) {
    return { shouldImport: false, reason: "not-packaged" };
  }
  if (input.markerExists) {
    return { shouldImport: false, reason: "marker-exists" };
  }
  if (!input.paseoLocalStorageExists) {
    return { shouldImport: false, reason: "no-paseo-data" };
  }
  return { shouldImport: true };
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** Drops `serverId` from `value` itself, or from a nested object at `value[nestedUnder]`. */
function stripServerId(value: unknown, nestedUnder?: string): unknown {
  if (!isPlainObject(value)) {
    return value;
  }
  if (!nestedUnder) {
    if (!("serverId" in value)) {
      return value;
    }
    const { serverId: _serverId, ...rest } = value;
    return rest;
  }
  const nested = value[nestedUnder];
  if (!isPlainObject(nested) || !("serverId" in nested)) {
    return value;
  }
  const { serverId: _serverId, ...restNested } = nested;
  return { ...value, [nestedUnder]: restNested };
}

const KEY_SANITIZERS: Readonly<Record<string, (value: unknown) => unknown>> = {
  [CREATE_AGENT_PREFERENCES_KEY]: (value) => stripServerId(value),
  [LEGACY_SETTINGS_KEY]: (value) => stripServerId(value, "usage"),
  [APP_SETTINGS_KEY]: (value) => stripServerId(value, "usage"),
};

/**
 * Returns the value to write, with any embedded Paseo host id stripped, or null when the stored
 * value cannot be parsed and sanitized safely — dropped rather than copied opaquely.
 */
export function sanitizePaseoAppStateValue(key: string, rawValue: string): string | null {
  const sanitize = KEY_SANITIZERS[key];
  if (!sanitize) {
    return rawValue;
  }
  try {
    return JSON.stringify(sanitize(JSON.parse(rawValue)));
  } catch {
    return null;
  }
}

export interface PaseoAppStateEntry {
  key: string;
  value: string;
}

/**
 * Keeps only allowlisted keys Paseo actually has and Stroll does not already have, sanitized.
 * `strollHasKey` lets the caller answer from a snapshot read once from the renderer instead of
 * passing a live storage handle into otherwise pure logic. Any key in `sourceEntries` that is not
 * on `PASEO_APP_STATE_ALLOWLIST` is ignored, regardless of what the caller passes in.
 */
export function selectPaseoAppStateEntriesToImport(input: {
  sourceEntries: Readonly<Record<string, string | null | undefined>>;
  strollHasKey: (key: string) => boolean;
}): PaseoAppStateEntry[] {
  const entries: PaseoAppStateEntry[] = [];
  for (const key of PASEO_APP_STATE_ALLOWLIST) {
    const rawValue = input.sourceEntries[key];
    if (rawValue == null) {
      continue;
    }
    if (input.strollHasKey(key)) {
      continue;
    }
    const value = sanitizePaseoAppStateValue(key, rawValue);
    if (value == null) {
      continue;
    }
    entries.push({ key, value });
  }
  return entries;
}

export interface PaseoAppStateImportMarker {
  from: string;
  importedAt: string;
  keys: string[];
}

/** `keys` records key names only, matching the no-values rule the daemon-side marker follows. */
export function buildPaseoAppStateImportMarker(input: {
  from: string;
  keys: readonly string[];
  now?: Date;
}): PaseoAppStateImportMarker {
  return {
    from: input.from,
    importedAt: (input.now ?? new Date()).toISOString(),
    keys: [...input.keys],
  };
}
