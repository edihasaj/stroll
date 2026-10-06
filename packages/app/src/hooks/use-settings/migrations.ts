import { z } from "zod";
import { readValidatedJson } from "@/storage/validated-storage";
import { APP_SETTINGS_KEY, SETTINGS_MIGRATIONS_KEY } from "./keys";
import type { AppSettings, KeyValueStorage, PersistedAppSettings } from "./storage";

const AppliedMigrationsSchema = z.strictObject({ applied: z.array(z.string()) });

/**
 * `sendBehavior` defaulted to "interrupt" for the months before steering existed, and defaults
 * are materialized into storage on first load, so a stored "interrupt" cannot be told apart from
 * a deliberate one. This flips every stored "interrupt" to "steer" exactly once; picking
 * "interrupt" afterwards sticks.
 */
const STEER_DEFAULT_MIGRATION = "steer-default";

/** Existing mobile installs materialized the old 15px content default in storage. */
const MOBILE_CONTENT_16_MIGRATION = "mobile-content-16";

/**
 * `proseFont` defaulted to "serif" on web/desktop before Geist made "system" (the UI font)
 * read well as prose too, and that default materializes into storage on first load — so a
 * stored "serif" cannot be told apart from a deliberate pick. This flips every stored
 * "serif" to "system" exactly once; picking "Serif" afterwards sticks.
 * COMPAT(proseFontModern): remove after 2027-04-01.
 */
const PROSE_FONT_MODERN_MIGRATION = "prose-font-modern";

/**
 * `sidebarWorkspaceTrailing` defaulted to "diff" before the sidebar's Codex-parity pass, and
 * that default materializes into storage on first load — so a stored "diff" cannot be told
 * apart from a deliberate pick. This flips every stored "diff" to "none" exactly once;
 * picking diff stats again afterwards sticks.
 * COMPAT(sidebarCodexDefaults): remove after 2027-04-01.
 */
const SIDEBAR_CODEX_DEFAULTS_MIGRATION = "sidebar-codex-defaults";

/**
 * `openInSidePane.subagents` defaulted to `false` before subagents opened beside their parent by
 * default, and that default materializes into storage on first load — so a stored `false` cannot
 * be told apart from a deliberate pick. This flips every stored `false` to `true` exactly once;
 * turning it off again afterwards sticks.
 * COMPAT(subagentsOpenBesideDefault): remove after 2027-04-01.
 */
const SUBAGENTS_OPEN_BESIDE_DEFAULT_MIGRATION = "subagents-open-beside-default";

/**
 * Brings stored settings up to date, returning what the caller should use. Owns both writes so
 * the marker can only ever be written after the settings it describes: a failed marker write
 * leaves the migration to re-run harmlessly, while a failed settings write must leave the marker
 * unwritten or the migration is lost for good.
 */
export async function migrateAppSettings(
  settings: AppSettings,
  storage: KeyValueStorage,
  stored?: PersistedAppSettings,
  options: { native?: boolean } = {},
): Promise<AppSettings> {
  const migrationMarker = await readValidatedJson(
    storage,
    SETTINGS_MIGRATIONS_KEY,
    AppliedMigrationsSchema,
  );
  const applied = new Set(migrationMarker?.applied ?? []);
  let addedMigration = false;

  let migrated = settings;
  if (!applied.has(STEER_DEFAULT_MIGRATION)) {
    migrated =
      migrated.sendBehavior === "interrupt" ? { ...migrated, sendBehavior: "steer" } : migrated;
    applied.add(STEER_DEFAULT_MIGRATION);
    addedMigration = true;
  }

  if (options.native && !applied.has(MOBILE_CONTENT_16_MIGRATION)) {
    migrated = migrated.contentFontSize === 15 ? { ...migrated, contentFontSize: 16 } : migrated;
    applied.add(MOBILE_CONTENT_16_MIGRATION);
    addedMigration = true;
  }

  if (!applied.has(PROSE_FONT_MODERN_MIGRATION)) {
    migrated = migrated.proseFont === "serif" ? { ...migrated, proseFont: "system" } : migrated;
    applied.add(PROSE_FONT_MODERN_MIGRATION);
    addedMigration = true;
  }

  if (!applied.has(SIDEBAR_CODEX_DEFAULTS_MIGRATION)) {
    migrated =
      migrated.sidebarWorkspaceTrailing === "diff"
        ? { ...migrated, sidebarWorkspaceTrailing: "none" }
        : migrated;
    applied.add(SIDEBAR_CODEX_DEFAULTS_MIGRATION);
    addedMigration = true;
  }

  if (!applied.has(SUBAGENTS_OPEN_BESIDE_DEFAULT_MIGRATION)) {
    migrated =
      migrated.openInSidePane.subagents === false
        ? { ...migrated, openInSidePane: { ...migrated.openInSidePane, subagents: true } }
        : migrated;
    applied.add(SUBAGENTS_OPEN_BESIDE_DEFAULT_MIGRATION);
    addedMigration = true;
  }

  if (!addedMigration) {
    return settings;
  }

  if (migrated !== settings) {
    const storedSidebarRowItems = stored?.sidebarRowItems ?? {};
    await storage.setItem(
      APP_SETTINGS_KEY,
      JSON.stringify({
        ...stored,
        ...migrated,
        sidebarRowItems: { ...storedSidebarRowItems, ...migrated.sidebarRowItems },
      }),
    );
  }

  await storage.setItem(SETTINGS_MIGRATIONS_KEY, JSON.stringify({ applied: [...applied] }));
  return migrated;
}
