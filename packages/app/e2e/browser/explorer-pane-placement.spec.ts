// Locks two behaviours on web/desktop:
// 1) with the Explorer showing a view, a newly appearing agent takes the untouched new-chat
//    composer's place in the main view: the Explorer is a background surface and must never
//    swallow chats or lose the user's selected view, and
// 2) closing the main view's only chat brings back the new-chat composer, whether or not Explorer
//    is showing, and the workspace stays usable after a reload.
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
  test("a new agent stays out of Explorer and the app stays usable", async ({
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
      await expect(draftHeader(page)).toHaveCount(1, { timeout: 30_000 });
    });

    await test.step("select Changes in Explorer", async () => {
      await selectExplorerChanges(page);
    });

    await test.step("an agent appearing now takes the empty draft's place in main, not Explorer", async () => {
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
      // The untouched composer gives way to the chat that appeared after it opened.
      await expect(sidebarChatRow(page, agentId)).toBeVisible({ timeout: 30_000 });
      await expectMainChat(page, agentId);
      await expect(draftHeader(page)).toHaveCount(0);

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
      await expectMainChat(page, agentId);

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

/** The empty workspace shows the new-chat composer, never the launcher or an error. */
async function expectEmptyWorkspaceComposer(page: Page): Promise<void> {
  await expect(draftHeader(page)).toHaveCount(1, { timeout: 30_000 });
  await expect(page.getByRole("textbox", { name: "Message agent..." })).toBeVisible();
  await expect(page.getByTestId("workspace-new-tab-panel").filter({ visible: true })).toHaveCount(
    0,
  );
  await expect(page.getByText("Stroll ran into a problem.", { exact: true })).toHaveCount(0);
}

// Explorer cannot replace the ordinary workspace canvas, including on restore.
test("closing the last tab with hidden Explorer keeps a usable workspace", async ({
  page,
  withWorkspace,
}) => {
  const workspace = await withWorkspace({ prefix: "last-pane-hidden-explorer-" });
  await gotoWorkspace(page, workspace.workspaceId);
  await expectEmptyWorkspaceComposer(page);
  await closeOnlyDraft(page);
  await expectEmptyWorkspaceComposer(page);
  await page.reload();
  await expectEmptyWorkspaceComposer(page);
});

test("visible Explorer does not replace the last ordinary workspace pane", async ({
  page,
  withWorkspace,
}) => {
  const workspace = await withWorkspace({ prefix: "last-pane-visible-explorer-" });
  await gotoWorkspace(page, workspace.workspaceId);
  await page.getByRole("button", { name: "Open Explorer sidebar", exact: true }).click();
  await expectEmptyWorkspaceComposer(page);
  await closeOnlyDraft(page);
  await expectEmptyWorkspaceComposer(page);
  await page.reload();
  await expectEmptyWorkspaceComposer(page);
});

test("reloading a saved hidden generated Explorer recovers a usable workspace", async ({
  page,
  withWorkspace,
}) => {
  const otherWorkspace = await withWorkspace({ prefix: "uncorrupted-explorer-" });
  await gotoWorkspace(page, otherWorkspace.workspaceId);
  await expectEmptyWorkspaceComposer(page);

  const workspace = await withWorkspace({ prefix: "saved-hidden-explorer-" });
  await gotoWorkspace(page, workspace.workspaceId);
  await expectEmptyWorkspaceComposer(page);
  await seedCorruptedWorkspaceLayout(page, workspace.workspaceId);
  await page.reload();
  await expectEmptyWorkspaceComposer(page);
  await gotoWorkspace(page, otherWorkspace.workspaceId);
  await expect(draftHeader(page)).toHaveCount(1);
});
