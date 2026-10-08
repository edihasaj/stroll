import path from "node:path";
import { expect, type Locator, type Page } from "@playwright/test";
import { openSettings } from "./app";
import { clickSettingsBackToWorkspace, openSettingsSection } from "./settings";

const APP_SETTINGS_KEY = "@paseo:app-settings";

/** Persisted nav key -> the testID the app shell renders that item with. */
const SHELL_ROW_TEST_IDS = {
  "new-workspace": "sidebar-global-new-workspace",
  "new-chat": "sidebar-global-new-chat",
  history: "sidebar-sessions",
  search: "sidebar-search",
  schedules: "sidebar-schedules",
} as const;

export type SidebarNavKey = keyof typeof SHELL_ROW_TEST_IDS;

export interface SidebarNavPreference {
  key: string;
  visible: boolean;
}

function shellRow(page: Page, key: SidebarNavKey): Locator {
  // `:visible` rather than a plain testID: the shell keeps a compact copy of the
  // sidebar mounted, so the pinned row is the first visible match.
  return page.locator(`[data-testid="${SHELL_ROW_TEST_IDS[key]}"]:visible`).first();
}

function settingsRow(page: Page, key: SidebarNavKey): Locator {
  return page.getByTestId(`sidebar-nav-item-${key}`);
}

function itemLabel(key: SidebarNavKey): string {
  return {
    "new-workspace": "New workspace",
    "new-chat": "New chat",
    history: "History",
    search: "Search",
    schedules: "Schedules",
  }[key];
}

async function rowTop(locator: Locator): Promise<number | null> {
  const box = await locator.boundingBox();
  return box?.y ?? null;
}

export async function seedSidebarNavPreferences(
  page: Page,
  preferences: SidebarNavPreference[],
): Promise<void> {
  await page.addInitScript(
    ({ key, sidebarNavItems }) => {
      localStorage.setItem(key, JSON.stringify({ sidebarNavItems }));
    },
    { key: APP_SETTINGS_KEY, sidebarNavItems: preferences },
  );
}

/** Seeds stored footer rows once; a reload keeps whatever the app wrote since. */
export async function seedSidebarFooterPreferences(
  page: Page,
  preferences: SidebarNavPreference[],
): Promise<void> {
  await page.addInitScript(
    ({ key, sidebarFooterItems }) => {
      if (localStorage.getItem(key)) return;
      localStorage.setItem(key, JSON.stringify({ sidebarFooterItems }));
    },
    { key: APP_SETTINGS_KEY, sidebarFooterItems: preferences },
  );
}

export async function openSidebarNavSettings(page: Page): Promise<void> {
  await openSettings(page);
  await openSettingsSection(page, "sidebar");
  await expect(page.getByTestId("sidebar-nav-section-header")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("sidebar-nav-section-footer")).toBeVisible();
}

export async function leaveSettings(page: Page): Promise<void> {
  await clickSettingsBackToWorkspace(page);
}

export async function moveSidebarNavItemUp(page: Page, key: SidebarNavKey): Promise<void> {
  await settingsRow(page, key).getByRole("button", { name: "Move up", exact: true }).click();
}

export async function setSidebarNavItemVisible(
  page: Page,
  key: SidebarNavKey,
  visible: boolean,
): Promise<void> {
  const toggle = settingsRow(page, key).getByRole("switch", {
    name: itemLabel(key),
    exact: true,
  });
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", String(visible));
}

export async function expectSidebarNavSettingsRow(
  page: Page,
  expected: { key: SidebarNavKey; label: string; visible: boolean },
): Promise<void> {
  const row = settingsRow(page, expected.key);
  await expect(row).toBeVisible();
  await expect(row.getByText(expected.label, { exact: true })).toBeVisible();
  const toggle = row.getByRole("switch", { name: expected.label, exact: true });
  await expect(toggle).toHaveAccessibleName(expected.label);
  await expect(toggle).toHaveAttribute("aria-checked", String(expected.visible));
}

export async function expectSidebarNavSettingsOrder(
  page: Page,
  keys: SidebarNavKey[],
): Promise<void> {
  await expectVerticalOrder(keys, (key) => settingsRow(page, key), "sidebar nav settings rows");
}

/** Where each header item renders on desktop: the rail, the panel, or (History only) inside
 * the rail's closed `•••` overflow, which has no row of its own to place. */
const DESKTOP_HEADER_PLACEMENT: Record<SidebarNavKey, "rail" | "panel" | "overflow"> = {
  "new-workspace": "panel",
  "new-chat": "panel",
  history: "overflow",
  search: "panel",
  schedules: "rail",
};

/** The rail renders Schedules under its own testID, distinct from the mobile nav row. */
function desktopRailTestID(key: SidebarNavKey): string {
  return key === "schedules" ? "sidebar-rail-schedules" : SHELL_ROW_TEST_IDS[key];
}

/**
 * On desktop the rail and panel are two fixed-layout pieces side by side (`docs/design.md`
 * §9): a stored sidebar-items order no longer moves anything between them, so there is no
 * single Y order left to assert across the five header items. This checks each visible item
 * renders inside its fixed container instead of comparing Y positions across containers that
 * do not share an axis — Schedules in the rail, History inside the rail's `•••` overflow (it
 * has no row of its own while closed), and New workspace/New chat/Search in the panel.
 */
async function expectDesktopSidebarPlacement(page: Page, keys: SidebarNavKey[]): Promise<void> {
  const rail = page.locator('[data-testid="sidebar-rail"]:visible');
  const panel = page.locator('[data-testid="sidebar-panel"]:visible');
  for (const key of keys) {
    const placement = DESKTOP_HEADER_PLACEMENT[key];
    if (placement === "overflow") {
      await expect(rail.locator('[data-testid="sidebar-rail-more"]')).toBeVisible();
      continue;
    }
    const container = placement === "rail" ? rail : panel;
    await expect(container.locator(`[data-testid="${desktopRailTestID(key)}"]`)).toBeVisible();
  }
}

export async function expectSidebarOrder(page: Page, keys: SidebarNavKey[]): Promise<void> {
  const isDesktop = (await page.locator('[data-testid="sidebar-rail"]:visible').count()) > 0;
  if (isDesktop) {
    await expectDesktopSidebarPlacement(page, keys);
    return;
  }
  await expectVerticalOrder(keys, (key) => shellRow(page, key), "app shell sidebar rows");
}

export async function expectSidebarItemHidden(page: Page, key: SidebarNavKey): Promise<void> {
  await expect(page.locator(`[data-testid="${SHELL_ROW_TEST_IDS[key]}"]:visible`)).toHaveCount(0);
  // Schedules renders under a different testID in the desktop rail (sidebar-rail.tsx); check
  // that one too so this assertion still means something at a desktop viewport. History has no
  // desktop testID to check the same way — it is a row inside the rail's closed `•••` overflow,
  // not a persistent element, hidden or not.
  if (key === "schedules") {
    await expect(page.locator(`[data-testid="${desktopRailTestID(key)}"]:visible`)).toHaveCount(0);
  }
}

export async function expectStoredSidebarNav(
  page: Page,
  expected: SidebarNavPreference[],
): Promise<void> {
  await expect
    .poll(
      () =>
        page.evaluate((key) => {
          const raw = localStorage.getItem(key);
          return raw ? (JSON.parse(raw).sidebarNavItems ?? null) : null;
        }, APP_SETTINGS_KEY),
      { timeout: 15_000 },
    )
    .toEqual(expected);
}

async function expectVerticalOrder<Key extends string>(
  keys: Key[],
  locate: (key: Key) => Locator,
  subject: string,
): Promise<void> {
  await expect
    .poll(
      async () => {
        const measured = await Promise.all(
          keys.map(async (key) => ({ key, top: await rowTop(locate(key)) })),
        );
        if (!measured.every((entry): entry is { key: Key; top: number } => entry.top !== null))
          return null;
        return measured.sort((a, b) => a.top - b.top).map((entry) => entry.key);
      },
      { message: `Expected ${subject} in order`, timeout: 15_000 },
    )
    .toEqual(keys);
}

/** Persisted footer row key -> the testID the app shell renders that row with. */
function shellFooterTestID(key: string): string {
  if (key === "usage") return "sidebar-usage";
  const [, pluginId, itemId] = key.split(":");
  return `plugin-sidebar-footer-${pluginId}-${itemId}`;
}

function shellFooterRow(page: Page, key: string): Locator {
  return page.locator(`[data-testid="${shellFooterTestID(key)}"]:visible`).first();
}

function footerSettingsRows(page: Page): Locator {
  return page
    .getByTestId("sidebar-nav-section-footer")
    .locator('[data-testid^="sidebar-nav-item-"]');
}

export async function expectFooterSettingsKeys(page: Page, keys: string[]): Promise<void> {
  await expect
    .poll(async () =>
      (
        await footerSettingsRows(page).evaluateAll((rows) =>
          rows.map((row) => row.getAttribute("data-testid")),
        )
      ).map((testID) => testID?.replace("sidebar-nav-item-", "")),
    )
    .toEqual(keys);
}

export async function moveFooterItemUp(page: Page, key: string): Promise<void> {
  await page
    .getByTestId("sidebar-nav-section-footer")
    .getByTestId(`sidebar-nav-move-up-${key}`)
    .click();
}

function footerItemSwitch(page: Page, key: string): Locator {
  return page.getByTestId("sidebar-nav-section-footer").getByTestId(`sidebar-nav-toggle-${key}`);
}

export async function setFooterItemVisible(
  page: Page,
  key: string,
  visible: boolean,
): Promise<void> {
  const toggle = footerItemSwitch(page, key);
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-checked", String(visible));
}

/** Whether Settings > Sidebar shows a footer item as on. */
export async function expectFooterItemSetting(
  page: Page,
  key: string,
  visible: boolean,
): Promise<void> {
  await expect(footerItemSwitch(page, key)).toHaveAttribute("aria-checked", String(visible));
}

export async function expectFooterOrder(page: Page, keys: string[]): Promise<void> {
  await expectVerticalOrder(keys, (key) => shellFooterRow(page, key), "sidebar footer rows");
}

export async function expectFooterItemHidden(page: Page, key: string): Promise<void> {
  await expect(page.locator(`[data-testid="${shellFooterTestID(key)}"]:visible`)).toHaveCount(0);
}

/**
 * Every fixed footer control, visible wherever the current layout places it. There is no single
 * "five icons in a row" invariant any more — on compact the mobile footer's bottom line still
 * holds the identity trigger plus the Import/Usage/Help/Settings icons, but on desktop the rail
 * carries Import (inside its `•••` overflow), Usage, and Settings while the panel footer keeps
 * only the identity trigger (`docs/design.md` §9). Add project has no icon of its own on either
 * layout: the Command Center is its one entry point (commit 65350836f).
 */
export async function expectFooterControlsVisible(page: Page): Promise<void> {
  await expect(page.locator('[data-testid="sidebar-hosts-trigger"]:visible')).toBeVisible();
  await expect(page.locator('[data-testid="sidebar-usage-icon"]:visible')).toBeVisible();
  await expect(page.locator('[data-testid="sidebar-settings"]:visible')).toBeVisible();
  const railMore = page.locator('[data-testid="sidebar-rail-more"]:visible');
  if ((await railMore.count()) > 0) {
    // Desktop: Import session and Help live inside the rail's overflow menu, not as their own
    // always-visible icons.
    await expect(railMore).toBeVisible();
  } else {
    await expect(page.locator('[data-testid="sidebar-import-session"]:visible')).toBeVisible();
    await expect(page.locator('[data-testid="sidebar-help"]:visible')).toBeVisible();
  }
}

/**
 * The icon line's own top border is the footer's permanent divider from whatever is above it
 * — "an in-surface divider, not the sidebar's outer edge" (`left-sidebar.tsx`'s `sidebarFooter`
 * style, docs/design.md "Finish"). The outer footer wrapper carries no border of its own; the
 * optional `sidebar-footer-separator` is the extra divider under the opt-in rows, when there
 * are any.
 */
export async function expectFooterSeparator(page: Page, shown: boolean): Promise<void> {
  await expect(page.locator('[data-testid="sidebar-footer-bottom-line"]:visible')).toHaveCSS(
    "border-top-width",
    "1px",
  );
  await expect(page.locator('[data-testid="sidebar-footer"]:visible')).toHaveCSS(
    "border-top-width",
    "0px",
  );
  const separator = page.locator('[data-testid="sidebar-footer-separator"]:visible');
  await expect(separator).toHaveCount(shown ? 1 : 0);
  expect(
    await separator.evaluateAll((elements) =>
      elements.map((element) => getComputedStyle(element).borderBottomWidth),
    ),
  ).toEqual(shown ? ["1px"] : []);
}

/**
 * Hovers the Usage icon, wherever it lives (the desktop rail or the mobile footer), and
 * confirms its tooltip names it. Scoped by `role="tooltip"` rather than a fixed testID: the
 * rail's tooltip content (`SidebarHeaderRowRail`) carries no testID of its own.
 */
export async function hoverFooterUsageIcon(page: Page): Promise<void> {
  await page.locator('[data-testid="sidebar-usage-icon"]:visible').hover();
  await expect(page.getByRole("tooltip").getByText("Usage", { exact: true })).toBeVisible();
}

export async function footerScreenshot(page: Page, name: string): Promise<void> {
  const directory = process.env.PASEO_QA_SCREENSHOT_DIR;
  if (!directory) return;
  await page.waitForTimeout(600);
  await page.addStyleTag({ content: ".__expo_fast_refresh { display: none !important; }" });
  await page.screenshot({ path: path.join(directory, `${name}.png`) });
}
