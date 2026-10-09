import { expect, type Locator, type Page } from "@playwright/test";
import { getServerId } from "./server-id";

export async function getWorkspaceTabTestIds(page: Page): Promise<string[]> {
  const tabs = page.locator('[data-testid^="workspace-tab-"]');
  const count = await tabs.count();
  const ids: string[] = [];
  for (let index = 0; index < count; index += 1) {
    const testId = await tabs.nth(index).getAttribute("data-testid");
    if (testId && !ids.includes(testId)) {
      ids.push(testId);
    }
  }
  return ids;
}

function setupTabTestId(workspaceId: string): string {
  return `workspace-tab-setup_${workspaceId}`;
}

async function waitForSetupToReachWorkspace(page: Page): Promise<void> {
  const actionsButton = page.getByTestId("workspace-header-menu-trigger");
  await expect(actionsButton).toBeVisible({ timeout: 30_000 });
  await actionsButton.click();
  await expect(page.getByTestId("workspace-header-show-setup")).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Escape");
}

export async function expectSetupTabNotSeeded(page: Page, workspaceId: string): Promise<void> {
  await waitForSetupToReachWorkspace(page);
  const tab = page.getByTestId(setupTabTestId(workspaceId));
  for (let attempt = 0; attempt < 5; attempt += 1) {
    await expect(tab).toHaveCount(0);
    await page.waitForTimeout(100);
  }
}

export async function expectFailedSetupTabSeededInMainPane(
  page: Page,
  workspaceId: string,
): Promise<void> {
  const tabId = setupTabTestId(workspaceId);
  await expect(page.getByTestId(tabId).filter({ visible: true }).first()).toBeVisible({
    timeout: 30_000,
  });
  const explorer = await ensureExplorerSidebar(page);
  await expect(explorer.getByTestId(tabId)).toHaveCount(0);
}

export async function closeSetupTab(page: Page, workspaceId: string): Promise<void> {
  const tabId = setupTabTestId(workspaceId);
  await page.getByTestId(tabId).filter({ visible: true }).first().click({ button: "right" });
  await page.getByTestId(`workspace-tab-context-setup_${workspaceId}-close`).click();
  await expect(page.getByTestId(tabId)).toHaveCount(0);
}

function visibleTestId(page: Page, testId: string) {
  return page.getByTestId(testId).filter({ visible: true });
}

function explorerSidebar(page: Page) {
  return visibleTestId(page, "workspace-explorer-sidebar").first();
}

async function selectWorkspaceTab(tab: Locator): Promise<void> {
  if ((await tab.getAttribute("aria-selected")) !== "true") {
    // The close action overlays the chip's trailing edge on hover. Click the
    // leading icon area so Playwright does not target that separate control.
    await tab.click({ position: { x: 12, y: 13 } });
  }
  await expect(tab).toHaveAttribute("aria-selected", "true");
}

/** Reveal the Explorer sidebar without changing its selected view. */
export async function ensureExplorerSidebar(page: Page): Promise<Locator> {
  const toggle = page.getByTestId("workspace-explorer-toggle").first();
  await expect(toggle).toBeVisible({ timeout: 30_000 });
  const explorer = explorerSidebar(page);
  if ((await explorer.count()) === 0) {
    await toggle.click();
  }
  await expect(explorer).toBeVisible({ timeout: 30_000 });
  return explorer;
}

/** Reveals the Explorer sidebar and selects one of its fixed navigation views. */
async function openExplorerView(
  page: Page,
  view: { tabTestId: string; contentTestId: string; timeout?: number },
): Promise<void> {
  const explorer = await ensureExplorerSidebar(page);
  const tab = explorer.getByTestId(view.tabTestId);
  await selectWorkspaceTab(tab);
  await expect(visibleTestId(page, view.contentTestId).first()).toBeVisible({
    timeout: view.timeout ?? 30_000,
  });
}

export async function openChangesTreePanel(page: Page): Promise<void> {
  await openExplorerView(page, {
    tabTestId: "workspace-tab-changes_tree",
    contentTestId: "changes-tree-panel",
  });
}

export async function openChangesPanel(page: Page, timeout = 30_000): Promise<void> {
  await openChangesTreePanel(page);
  const changedFile = page
    .locator('[data-testid^="diff-tree-file-"][data-testid$="-toggle"]')
    .filter({ visible: true })
    .first();
  await expect(changedFile).toBeVisible({ timeout });
  await changedFile.click();
  await expect(visibleTestId(page, "working-diff-panel").first()).toBeVisible({
    timeout,
  });
}

export async function openFilesPanel(page: Page): Promise<void> {
  await openExplorerView(page, {
    tabTestId: "workspace-tab-files",
    contentTestId: "file-explorer-tree-scroll",
  });
}

export async function openPullRequestPanel(page: Page): Promise<void> {
  const existingTab = visibleTestId(page, "workspace-tab-pull_request").first();
  if ((await existingTab.count()) > 0) {
    await selectWorkspaceTab(existingTab);
    await expect(visibleTestId(page, "pr-pane").first()).toBeVisible({ timeout: 15_000 });
    return;
  }
  const trigger = visibleTestId(page, "workspace-new-tab-button").first();
  await trigger.click();
  await visibleTestId(page, "workspace-new-tab-menu-pull-request").first().click();
  await expect(visibleTestId(page, "pr-pane").first()).toBeVisible({ timeout: 15_000 });
}

/**
 * Waits until the workspace is on screen. The main view shows one chat and has no tab row, so this
 * waits for its header; tabs live in the side pane and the Explorer.
 */
export async function waitForWorkspaceTabsVisible(page: Page): Promise<void> {
  await expect(visibleTestId(page, "main-pane-header").first()).toBeVisible({
    timeout: 30_000,
  });
}

/** Starts a new chat from the main view's header. It replaces the chat in the main view. */
export async function createAgentTabFromMenu(page: Page): Promise<void> {
  const button = visibleTestId(page, "main-pane-new-chat").first();
  await expect(button).toBeVisible({ timeout: 10_000 });
  await button.click();
}

/** The header over the main view's chat, or none while it shows a draft. */
export function mainChatHeader(page: Page): Locator {
  return visibleTestId(page, "chat-pane-header").first();
}

/** The agent id of the chat in the main view, or null when it shows a draft or nothing. */
export async function getMainChatAgentId(page: Page): Promise<string | null> {
  const header = mainChatHeader(page);
  if ((await header.count()) === 0) {
    return null;
  }
  return header.getAttribute("data-agent-id");
}

/** The main view shows this chat: its header carries the agent id. */
export async function expectMainChat(page: Page, agentId: string, timeout = 30_000): Promise<void> {
  await expect(mainChatHeader(page)).toHaveAttribute("data-agent-id", agentId, { timeout });
}

/** The main view is not showing this chat. */
export async function expectNotMainChat(
  page: Page,
  agentId: string,
  timeout = 30_000,
): Promise<void> {
  await expect(
    page.locator(`[data-testid="chat-pane-header"][data-agent-id="${agentId}"]`).filter({
      visible: true,
    }),
  ).toHaveCount(0, { timeout });
}

/** The main view holds a draft: a plain header and the composer, no chat header. */
export async function expectMainDraft(page: Page): Promise<void> {
  await expect(visibleTestId(page, "main-pane-draft-header").first()).toBeVisible({
    timeout: 30_000,
  });
}

/** The sidebar's row for one of a workspace's chats. */
export function sidebarChatRow(page: Page, agentId: string): Locator {
  return page.getByTestId(`sidebar-chat-row-${getServerId()}:${agentId}`);
}

/** Opens a chat by pressing its sidebar row; it replaces the chat in the main view. */
export async function openChatFromSidebar(page: Page, agentId: string): Promise<void> {
  const row = sidebarChatRow(page, agentId);
  await expect(row).toBeVisible({ timeout: 30_000 });
  await row.click();
  await expectMainChat(page, agentId);
}

/** Archives the main view's chat from the header menu and answers the confirmation. */
export async function archiveMainChatFromHeader(page: Page): Promise<string> {
  await visibleTestId(page, "chat-pane-menu-trigger").first().click();
  const messages: string[] = [];
  page.once("dialog", (dialog) => {
    messages.push(dialog.message());
    void dialog.accept();
  });
  await visibleTestId(page, "chat-pane-menu-archive").first().click();
  await expect.poll(() => messages.length).toBe(1);
  return messages[0];
}

export async function ensureWorkspaceAgentPaneVisible(page: Page): Promise<void> {
  const toggle = page.getByTestId("workspace-explorer-toggle").first();
  if (!(await toggle.isVisible().catch(() => false))) {
    return;
  }
  const isExpanded = (await toggle.getAttribute("aria-expanded")) === "true";
  if (isExpanded) {
    await toggle.click();
    await expect(toggle).toHaveAttribute("aria-expanded", "false", {
      timeout: 10_000,
    });
  }
}

/** No tab row is on screen. The main view never has one; the side pane and Explorer have their own. */
export async function expectWorkspaceTabsAbsent(page: Page): Promise<void> {
  await expect(page.getByTestId("workspace-tabs-row")).toHaveCount(0);
}

export async function expectNoTerminalTabs(page: Page): Promise<void> {
  await expect(page.locator('[data-testid^="workspace-tab-terminal_"]')).toHaveCount(0);
}

export async function clickFirstTerminalTab(
  page: Page,
  options?: { timeout?: number },
): Promise<void> {
  const tab = page.locator('[data-testid^="workspace-tab-terminal_"]').first();
  await expect(tab).toBeVisible({ timeout: options?.timeout ?? 30_000 });
  await tab.click();
}

export async function expectFirstTerminalTabContains(page: Page, text: string): Promise<void> {
  await expect(page.locator('[data-testid^="workspace-tab-terminal_"]').first()).toContainText(
    text,
  );
}

export async function expectTerminalTabOpen(
  page: Page,
  options?: { timeout?: number },
): Promise<void> {
  await expect(
    page.locator('[data-testid^="workspace-tab-terminal_"]').filter({ visible: true }).first(),
  ).toBeVisible({ timeout: options?.timeout ?? 30_000 });
}

export async function sampleWorkspaceTabIds(
  page: Page,
  options: { durationMs?: number; intervalMs?: number } = {},
): Promise<string[][]> {
  const durationMs = options.durationMs ?? 2_500;
  const intervalMs = options.intervalMs ?? 50;
  const snapshots: string[][] = [];
  const start = Date.now();
  while (Date.now() - start <= durationMs) {
    snapshots.push(await getWorkspaceTabTestIds(page));
    await page.waitForTimeout(intervalMs);
  }
  return snapshots;
}
