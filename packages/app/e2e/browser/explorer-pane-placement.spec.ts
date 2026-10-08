// Locks two behaviours on web/desktop:
// 1) with the explorer pane focused, a newly appearing agent must auto-open into the
//    MAIN pane in the background — the explorer pane is a background surface and must
//    never swallow entity tabs or lose the user's focus, and
// 2) closing the last tab of the only ordinary pane leaves the New launcher, whether or
//    not Explorer is showing, and the workspace stays usable after a reload.
import { expect, type Locator, type Page } from "@playwright/test";
import { test } from "../support/fixtures";
import { gotoWorkspace } from "../support/helpers/launcher";
import {
  seedCorruptedWorkspaceLayout,
  seedSavedSplitLayout,
} from "../support/helpers/workspace-layout";
import {
  openChangesTreePanel,
  waitForWorkspaceTabsVisible,
} from "../support/helpers/workspace-tabs";

function visible(page: Page, testId: string): Locator {
  return page.getByTestId(testId).filter({ visible: true });
}

function agentTabChip(page: Page, agentId: string): Locator {
  return visible(page, `workspace-tab-agent_${agentId}`);
}

function draftTabChip(page: Page): Locator {
  return page.locator('[data-testid^="workspace-tab-draft_"]').filter({ visible: true });
}

/** Scope the shared tab row to the Explorer dock. */
function explorerTabRow(page: Page): Locator {
  return visible(page, "workspace-explorer-sidebar").getByTestId("workspace-tabs-row");
}

function mainTabRow(page: Page): Locator {
  return page
    .locator('[data-testid^="workspace-pane-"]')
    .getByTestId("workspace-tabs-row")
    .filter({ visible: true });
}

async function selectExplorerChanges(page: Page): Promise<void> {
  await openChangesTreePanel(page);
  await expect(visible(page, "changes-tree-panel").first()).toBeVisible();
}

async function closeSeededDraftInMainPane(page: Page): Promise<void> {
  const chip = draftTabChip(page).first();
  await chip.hover();
  await page
    .locator('[data-testid^="workspace-draft-close-"]')
    .filter({ visible: true })
    .first()
    .click();
  await expect(draftTabChip(page)).toHaveCount(0, { timeout: 15_000 });
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
  test("agents open in the main pane and the app stays usable", async ({
    page,
    withWorkspace,
    e2eWorkerClient,
  }, testInfo) => {
    const consoleErrors = collectConsoleErrors(page);

    const workspace = await withWorkspace({ prefix: "explorer-pane-placement-" });
    let agentId = "";

    await test.step("choose Agent from the empty workspace launcher", async () => {
      await gotoWorkspace(page, workspace.workspaceId);
      await waitForWorkspaceTabsVisible(page);
      await openAgentDraftFromLauncher(page);
      await expect(draftTabChip(page).first()).toBeVisible({ timeout: 30_000 });
    });

    await test.step("select Changes in Explorer", async () => {
      await selectExplorerChanges(page);
    });

    await test.step("an agent appearing now opens in the main pane, not the explorer pane", async () => {
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
      await expect(agentTabChip(page, agentId).first()).toBeVisible({ timeout: 30_000 });

      await expect(
        mainTabRow(page).first().getByTestId(`workspace-tab-agent_${agentId}`),
      ).toBeVisible();
      await expect(
        explorerTabRow(page).first().getByTestId(`workspace-tab-agent_${agentId}`),
      ).toHaveCount(0);
      // The background open must not change the selected Explorer view.
      await expect(visible(page, "changes-tree-panel").first()).toBeVisible();
    });

    await test.step("close the draft; the agent is the main pane's only tab", async () => {
      await closeSeededDraftInMainPane(page);
      await expect(mainTabRow(page).first().locator('[data-testid^="workspace-tab-"]')).toHaveCount(
        1,
      );
    });

    await test.step("app must stay interactive", async () => {
      // JS main thread alive?
      const pong = await page.evaluate("1 + 1");
      expect(pong).toBe(2);

      // Pointer interaction alive? Selecting the agent chip must still work.
      const chip = agentTabChip(page, agentId).first();
      await chip.click({ position: { x: 12, y: 13 }, timeout: 5_000 });
      await expect(chip).toHaveAttribute("aria-selected", "true", { timeout: 5_000 });

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
  await draftTabChip(page).hover();
  await page.getByRole("button", { name: "Close", exact: true }).click();
}

async function expectNewLauncher(page: Page): Promise<void> {
  await expect(
    page.getByTestId("workspace-new-tab-panel").getByRole("button", { name: "Agent", exact: true }),
  ).toBeVisible();
  await expect(draftTabChip(page)).toHaveCount(0);
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
  await expect(draftTabChip(page)).toHaveCount(1);
});

// Users can no longer split, but layouts saved before that still hold extra panes.
test("a saved layout with two panes still renders and its extra pane closes", async ({
  page,
  withWorkspace,
}) => {
  const workspace = await withWorkspace({ prefix: "saved-split-layout-" });
  await gotoWorkspace(page, workspace.workspaceId);
  await openAgentDraftFromLauncher(page);
  await seedSavedSplitLayout(page, workspace.workspaceId);
  await page.reload();

  await expect(mainTabRow(page)).toHaveCount(2, { timeout: 30_000 });
  const extraPane = page.getByTestId("workspace-pane-pane_saved_right");
  const extraPaneDraft = extraPane.locator('[data-testid^="workspace-tab-draft_"]');
  await expect(extraPaneDraft).toHaveCount(1);

  await extraPaneDraft.hover();
  await extraPane.getByRole("button", { name: "Close", exact: true }).click();

  await expect(extraPane).toHaveCount(0);
  await expect(mainTabRow(page)).toHaveCount(1);
  await expect(draftTabChip(page)).toHaveCount(1);
});
