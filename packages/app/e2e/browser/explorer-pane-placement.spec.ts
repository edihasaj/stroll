// Locks two behaviours on web/desktop:
// 1) with the Explorer showing a view, a newly appearing agent must auto-open as the main view's
//    chat in the background: the Explorer is a background surface and must never swallow chats
//    or lose the user's selected view, and
// 2) closing the main view's only chat leaves the New launcher, whether or not Explorer is
//    showing, and the workspace stays usable after a reload.
import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "../support/fixtures";
import { gotoWorkspace } from "../support/helpers/launcher";
import { seedCorruptedWorkspaceLayout } from "../support/helpers/workspace-layout";
import {
  expectMainChat,
  openChangesTreePanel,
  sidebarChatRow,
  waitForWorkspaceTabsVisible,
} from "../support/helpers/workspace-tabs";

// Cmd/Ctrl+W is the desktop app's; a browser tab keeps it for itself, so web closes with Alt+Shift+W.
const CLOSE_TAB_SHORTCUT = "Alt+Shift+W";

function visible(page: Page, testId: string): Locator {
  return page.getByTestId(testId).filter({ visible: true });
}

/** The main view's header while it holds a draft: it carries the draft id, an empty view does not. */
function draftHeader(page: Page): Locator {
  return page.locator('[data-testid="main-pane-draft-header"][data-draft-id]').filter({
    visible: true,
  });
}

async function selectExplorerChanges(page: Page): Promise<void> {
  await openChangesTreePanel(page);
  await expect(visible(page, "changes-tree-panel").first()).toBeVisible();
}

function collectConsoleErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") errors.push(message.text());
  });
  page.on("pageerror", (error) => errors.push(`pageerror: ${String(error)}`));
  return errors;
}

test.describe("explorer pane tab placement", () => {
  test("a new agent opens as the main chat and the app stays usable", async ({
    page,
    withWorkspace,
    e2eWorkerClient,
  }, testInfo) => {
    const consoleErrors = collectConsoleErrors(page);

    const workspace = await withWorkspace({ prefix: "explorer-pane-placement-" });
    let agentId = "";

    await test.step("open the empty workspace", async () => {
      await gotoWorkspace(page, workspace.workspaceId);
      await waitForWorkspaceTabsVisible(page);
      await expect(visible(page, "workspace-new-tab-panel").first()).toBeVisible({
        timeout: 30_000,
      });
    });

    await test.step("select Changes in Explorer", async () => {
      await selectExplorerChanges(page);
    });

    await test.step("an agent appearing now opens in the main view, not the Explorer", async () => {
      const agent = await e2eWorkerClient.createAgent({
        provider: "mock",
        cwd: workspace.repoPath,
        workspaceId: workspace.workspaceId,
        title: "Explorer Placement Agent",
        modeId: "load-test",
        model: "ten-second-stream",
        // Keep the agent streaming through the drag so pane contents are live,
        // matching the reporter's "spinners were still going" environment.
        initialPrompt: "stream please",
      });
      agentId = agent.id;
      await expectMainChat(page, agentId);

      await expect(
        visible(page, "workspace-explorer-sidebar").getByTestId(`workspace-tab-agent_${agentId}`),
      ).toHaveCount(0);
      await expect(page.locator('[data-testid^="workspace-tab-agent_"]')).toHaveCount(0);
      // The background open must not change the selected Explorer view.
      await expect(visible(page, "changes-tree-panel").first()).toBeVisible();
    });

    await test.step("app must stay interactive", async () => {
      // JS main thread alive?
      const pong = await page.evaluate("1 + 1");
      expect(pong).toBe(2);

      // Pointer interaction alive? Selecting the agent's sidebar row must still work.
      const row = sidebarChatRow(page, agentId);
      await row.click({ timeout: 5_000 });
      await expect(row).toHaveAttribute("aria-selected", "true", { timeout: 5_000 });

      // The explorer toggle must still respond.
      await visible(page, "workspace-explorer-toggle").first().click({ timeout: 5_000 });
      await testInfo.attach("after-interactions", {
        body: await page.screenshot(),
        contentType: "image/png",
      });
    });

    await testInfo.attach("console-errors", {
      body: JSON.stringify(consoleErrors, null, 2),
      contentType: "application/json",
    });
  });
});

async function closeOnlyDraft(page: Page): Promise<void> {
  await page.keyboard.press(CLOSE_TAB_SHORTCUT);
}

async function expectNewLauncher(page: Page): Promise<void> {
  await expect(
    page.getByTestId("workspace-new-tab-panel").getByRole("button", { name: "Agent", exact: true }),
  ).toBeVisible();
  await expect(draftHeader(page)).toHaveCount(0);
  await expect(page.getByRole("textbox", { name: "Message agent..." })).toHaveCount(0);
  await expect(page.getByText("Stroll ran into a problem.", { exact: true })).toHaveCount(0);
}

async function openAgentDraftFromLauncher(page: Page): Promise<void> {
  await expectNewLauncher(page);
  await page
    .getByTestId("workspace-new-tab-panel")
    .getByRole("button", { name: "Agent", exact: true })
    .click();
  await expect(page.getByRole("textbox", { name: "Message agent..." })).toBeVisible();
  await expect(draftHeader(page)).toHaveCount(1);
}

// Explorer cannot replace the ordinary workspace canvas, including on restore.
test("closing the last tab with hidden Explorer keeps a usable workspace", async ({
  page,
  withWorkspace,
}) => {
  const workspace = await withWorkspace({ prefix: "last-pane-hidden-explorer-" });
  await gotoWorkspace(page, workspace.workspaceId);
  await openAgentDraftFromLauncher(page);
  await closeOnlyDraft(page);
  await expectNewLauncher(page);
  await page.reload();
  await expectNewLauncher(page);
});

test("visible Explorer does not replace the last ordinary workspace pane", async ({
  page,
  withWorkspace,
}) => {
  const workspace = await withWorkspace({ prefix: "last-pane-visible-explorer-" });
  await gotoWorkspace(page, workspace.workspaceId);
  await page.getByRole("button", { name: "Open Explorer sidebar", exact: true }).click();
  await openAgentDraftFromLauncher(page);
  await closeOnlyDraft(page);
  await expectNewLauncher(page);
  await page.reload();
  await expectNewLauncher(page);
});

test("reloading a saved hidden generated Explorer recovers a usable workspace", async ({
  page,
  withWorkspace,
}) => {
  const otherWorkspace = await withWorkspace({ prefix: "uncorrupted-explorer-" });
  await gotoWorkspace(page, otherWorkspace.workspaceId);
  await openAgentDraftFromLauncher(page);

  const workspace = await withWorkspace({ prefix: "saved-hidden-explorer-" });
  await gotoWorkspace(page, workspace.workspaceId);
  await expectNewLauncher(page);
  await seedCorruptedWorkspaceLayout(page, workspace.workspaceId);
  await page.reload();
  await expectNewLauncher(page);
  await gotoWorkspace(page, otherWorkspace.workspaceId);
  await expect(draftHeader(page)).toHaveCount(1);
});
