import { cpSync, existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { BrowserWindow, session } from "electron";
import log from "electron-log/main";
import {
  buildPaseoAppStateImportBlankPageHtml,
  buildPaseoAppStateImportMarker,
  decidePaseoAppStateImport,
  PASEO_APP_STATE_ALLOWLIST,
  PASEO_APP_STATE_IMPORT_TIMEOUT_MS,
  PASEO_PROTOCOL_SCHEME,
  resolvePaseoAppStateImportPaths,
  selectPaseoAppStateEntriesToImport,
  STROLL_APP_STATE_IMPORT_PATH,
  type PaseoAppStateEntry,
  type PaseoAppStateImportPaths,
} from "./paseo-app-state-import.js";

/** No preload, context isolation on, sandboxed — these windows only ever run our own script. */
const HIDDEN_WINDOW_WEB_PREFERENCES = {
  contextIsolation: true,
  nodeIntegration: false,
  sandbox: true,
} as const;

function readAllowlistedEntriesScript(): string {
  return `(() => {
    const keys = ${JSON.stringify(PASEO_APP_STATE_ALLOWLIST)};
    const result = {};
    for (const key of keys) {
      result[key] = window.localStorage.getItem(key);
    }
    return result;
  })()`;
}

function writeEntriesScript(entries: readonly PaseoAppStateEntry[]): string {
  return `(() => {
    const entries = ${JSON.stringify(entries)};
    const written = [];
    for (const entry of entries) {
      if (window.localStorage.getItem(entry.key) === null) {
        window.localStorage.setItem(entry.key, entry.value);
        written.push(entry.key);
      }
    }
    return written;
  })()`;
}

async function readAllowlistedEntries(
  contents: Electron.WebContents,
): Promise<Record<string, string | null>> {
  const result = await contents.executeJavaScript(readAllowlistedEntriesScript());
  return (result ?? {}) as Record<string, string | null>;
}

/** Copies Paseo's "Local Storage" leveldb into a fresh temp dir (Paseo.app may be running and
 * hold the LevelDB LOCK on the original) and reads the allowlisted keys from it. */
async function readPaseoEntries(
  paseoLocalStorageDir: string,
): Promise<Record<string, string | null>> {
  const tempDir = mkdtempSync(path.join(os.tmpdir(), "stroll-paseo-import-"));
  let win: BrowserWindow | null = null;
  try {
    cpSync(paseoLocalStorageDir, path.join(tempDir, "Local Storage"), { recursive: true });
    const tempSession = session.fromPath(tempDir);
    tempSession.protocol.handle(
      PASEO_PROTOCOL_SCHEME,
      () =>
        new Response(buildPaseoAppStateImportBlankPageHtml(), {
          headers: { "content-type": "text/html" },
        }),
    );

    win = new BrowserWindow({
      show: false,
      webPreferences: { ...HIDDEN_WINDOW_WEB_PREFERENCES, session: tempSession },
    });
    await win.loadURL(`${PASEO_PROTOCOL_SCHEME}://app/`);
    return await readAllowlistedEntries(win.webContents);
  } finally {
    win?.destroy();
    rmSync(tempDir, { recursive: true, force: true });
  }
}

/** Reads Stroll's own already-set allowlisted keys, then writes only the ones it still lacks. */
async function importIntoStroll(input: {
  appScheme: string;
  sourceEntries: Record<string, string | null>;
}): Promise<string[]> {
  const win = new BrowserWindow({ show: false, webPreferences: HIDDEN_WINDOW_WEB_PREFERENCES });
  try {
    await win.loadURL(`${input.appScheme}://app${STROLL_APP_STATE_IMPORT_PATH}`);
    const existingEntries = await readAllowlistedEntries(win.webContents);
    const toImport = selectPaseoAppStateEntriesToImport({
      sourceEntries: input.sourceEntries,
      strollHasKey: (key) => existingEntries[key] != null,
    });
    if (toImport.length === 0) {
      return [];
    }
    const written = await win.webContents.executeJavaScript(writeEntriesScript(toImport));
    return Array.isArray(written) ? (written as string[]) : [];
  } finally {
    win.destroy();
  }
}

async function runImport(input: {
  appScheme: string;
  paths: PaseoAppStateImportPaths;
}): Promise<void> {
  const sourceEntries = await readPaseoEntries(input.paths.paseoLocalStorageDir);
  const importedKeys = await importIntoStroll({ appScheme: input.appScheme, sourceEntries });
  const marker = buildPaseoAppStateImportMarker({
    from: input.paths.paseoAppDataDir,
    keys: importedKeys,
  });
  writeFileSync(input.paths.markerPath, `${JSON.stringify(marker, null, 2)}\n`);
  log.info("[paseo-app-state-import] imported Paseo renderer state", {
    from: marker.from,
    keys: importedKeys,
  });
}

/**
 * Runs once, before the real main window loads, so its first paint already reflects imported
 * settings. Never throws and never outlives `PASEO_APP_STATE_IMPORT_TIMEOUT_MS`: on timeout the
 * import keeps running in the background (and still writes the marker when it finishes) but this
 * call returns immediately so a slow or locked Paseo install can never delay startup.
 *
 * Callers must keep window-all-closed quit-on-empty suppressed for the duration of this call:
 * the hidden windows it opens and destroys can otherwise drop Electron's window count to zero
 * before the real main window exists, which quits the app on Windows/Linux (`main.ts`'s
 * `suppressWindowAllClosedQuit` flag does this).
 */
export async function runPaseoAppStateImportIfNeeded(input: {
  appScheme: string;
  isPackaged: boolean;
  appDataDir: string;
  strollUserDataDir: string;
}): Promise<void> {
  try {
    const paths = resolvePaseoAppStateImportPaths(input);
    const decision = decidePaseoAppStateImport({
      isPackaged: input.isPackaged,
      markerExists: existsSync(paths.markerPath),
      paseoLocalStorageExists: existsSync(paths.paseoLocalStorageDir),
    });
    if (!decision.shouldImport) {
      return;
    }

    const task = runImport({ appScheme: input.appScheme, paths }).catch((error) => {
      log.error("[paseo-app-state-import] failed", error);
    });
    const timedOut = await Promise.race([
      task.then(() => false),
      new Promise<boolean>((resolve) =>
        setTimeout(() => resolve(true), PASEO_APP_STATE_IMPORT_TIMEOUT_MS),
      ),
    ]);
    if (timedOut) {
      log.warn("[paseo-app-state-import] exceeded its time box; continuing startup", {
        timeoutMs: PASEO_APP_STATE_IMPORT_TIMEOUT_MS,
      });
    }
  } catch (error) {
    log.error("[paseo-app-state-import] failed", error);
  }
}
