import { expect, type Locator, type Page } from "@playwright/test";
import { expectInlineWorkingIndicator, expectTurnCopyButton } from "./agent-stream";

/**
 * The main view has no tab for a chat, so its running state shows on the chat's row in the
 * sidebar (`sidebar-chat-status-running`) and in the composer and transcript.
 */
function sidebarChatRowByTitle(page: Page, title: string): Locator {
  return page
    .locator('[data-testid^="sidebar-chat-row-"]')
    .filter({ visible: true })
    .filter({ hasText: title })
    .first();
}

/** The chat's sidebar row shows it running, and the composer offers Stop with a working footer. */
export async function expectRunningChatChrome(page: Page, title: string): Promise<void> {
  const row = sidebarChatRowByTitle(page, title);

  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row.getByTestId("sidebar-chat-status-running")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /stop agent|canceling agent/i })).toBeVisible({
    timeout: 30_000,
  });
  await expectInlineWorkingIndicator(page);
}

/** The chat's sidebar row, composer and transcript all show it idle. */
export async function expectChatSurfacesIdle(page: Page, title: string): Promise<void> {
  const row = sidebarChatRowByTitle(page, title);

  await expect(row).toBeVisible({ timeout: 30_000 });
  await expect(row.getByTestId("sidebar-chat-status-running")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /stop agent|canceling agent/i })).toHaveCount(0);
  await expect(page.getByTestId("turn-working-indicator")).toHaveCount(0);
  await expect(page.getByTestId("turn-working-elapsed")).toHaveCount(0);
  await expectTurnCopyButton(page);
}
