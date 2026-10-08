import { buildHostAgentDetailRoute, buildHostWorkspaceRoute } from "@/utils/host-routes";
import type { Locator, Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import { createIdleAgent } from "../support/helpers/archive-tab";
import { expectComposerVisible } from "../support/helpers/composer";
import { clickNewTerminal, terminalSurfaceLocator } from "../support/helpers/launcher";
import { renameModalInput } from "../support/helpers/rename";
import { seedWorkspace } from "../support/helpers/seed-client";
import { getServerId } from "../support/helpers/server-id";
import { clickSettingsBackToWorkspace, openCompactSettings } from "../support/helpers/settings";
import { openSettings } from "../support/helpers/app";
import { runWorkspaceActionFromCommandCenter } from "../support/helpers/command-center-workspace-actions";
import {
  expectTimelinePromptPositionPreserved,
  rememberTimelinePromptPosition,
  scrollTimelinePromptIntoView,
} from "../support/helpers/timeline-pagination";
import {
  clickFirstTerminalTab,
  waitForWorkspaceTabsVisible,
} from "../support/helpers/workspace-tabs";
import { expectTerminalSurfaceVisible } from "../support/helpers/terminal-perf";

/**
 * Every row (user message or one assistant Markdown block) wraps in its own
 * `[data-history-row-id]` div (strategy-web.tsx); a settled assistant response splits into one
 * row per block (presentation.ts's `nativeBlocks` — "streamed messages always behaved this way;
 * history now matches them") rather than one row for the whole response. Returns every block
 * row belonging to `turnRow`'s turn: siblings after it, stopping before the next row that
 * itself contains a user-message (the start of the next turn), or the end of the list if this
 * is the last turn.
 */
async function assistantBlockRowsForTurn(turnRow: Locator, page: Page): Promise<Locator> {
  const laterRows = turnRow.locator("xpath=following-sibling::*[@data-history-row-id]");
  const nextTurnRow = laterRows.filter({ has: page.getByTestId("user-message") }).first();
  if ((await nextTurnRow.count()) === 0) {
    return laterRows;
  }
  const boundaryIndex = await nextTurnRow.evaluate((element) =>
    Array.prototype.indexOf.call(element.parentElement!.children, element),
  );
  return turnRow.locator(
    `xpath=following-sibling::*[@data-history-row-id][count(preceding-sibling::*) < ${boundaryIndex}]`,
  );
}

async function captureRenderedNode(locator: Locator) {
  await expect(locator).toBeVisible({ timeout: 30_000 });
  const node = await locator.elementHandle();
  if (!node) {
    throw new Error("Expected rendered node");
  }
  return node;
}

async function expectSameRenderedNode(
  original: Awaited<ReturnType<typeof captureRenderedNode>>,
  locator: Locator,
) {
  const current = await captureRenderedNode(locator);
  await expect(original.evaluate((node, candidate) => node === candidate, current)).resolves.toBe(
    true,
  );
}

async function expectNodeConnected(node: Awaited<ReturnType<typeof captureRenderedNode>>) {
  expect(await node.evaluate((candidate) => candidate.isConnected)).toBe(true);
}

async function getSettingsShortcut(page: Page) {
  return page.evaluate(() =>
    navigator.platform.toLowerCase().includes("mac") ? "Meta+," : "Control+,",
  );
}

async function waitForWorkspaceRoute(page: Page, route: string) {
  await page.waitForURL((url) => url.pathname === route);
}

test.describe("Workspace pane mounting", () => {
  test("workspace navigation keeps the existing agent composer mounted", async ({ page }) => {
    test.setTimeout(90_000);
    const serverId = getServerId();

    const workspace = await seedWorkspace({ repoPrefix: "pane-remount-" });

    try {
      const agent = await createIdleAgent(workspace.client, {
        cwd: workspace.repoPath,
        workspaceId: workspace.workspaceId,
        title: `pane-remount-${Date.now()}`,
      });

      await page.goto(buildHostAgentDetailRoute(serverId, agent.id, agent.workspaceId));
      await page.waitForURL(
        (url) => url.pathname.includes("/workspace/") && !url.searchParams.has("open"),
        { timeout: 60_000 },
      );
      await waitForWorkspaceTabsVisible(page);
      await expectComposerVisible(page);

      const originalComposer = await page
        .getByTestId("message-input-root")
        .filter({ visible: true })
        .first()
        .elementHandle();
      expect(originalComposer).not.toBeNull();
      await test.step("opening the first split pane preserves the composer", async () => {
        const emptyPanesBeforeSplit = await page.getByTestId("workspace-new-tab-panel").count();

        await runWorkspaceActionFromCommandCenter(page, "Split pane right");
        await expect(page.getByTestId("workspace-new-tab-panel")).toHaveCount(
          emptyPanesBeforeSplit + 1,
          { timeout: 30_000 },
        );
        await expect(page.getByTestId("message-input-root").filter({ visible: true })).toHaveCount(
          1,
        );
        await expectNodeConnected(originalComposer!);
      });

      const composer = page.getByTestId("message-input-root").filter({ visible: true }).first();
      await test.step("desktop Settings closes overlays and preserves the composer", async () => {
        const tab = page.getByTestId(`workspace-tab-agent_${agent.id}`).first();
        await tab.click({ button: "right" });
        await page.getByTestId(`workspace-tab-context-agent_${agent.id}-rename`).click();
        const renameInput = renameModalInput(page, `workspace-tab-rename-modal-agent-${agent.id}`);
        await expect(renameInput).toBeVisible();

        const settingsShortcut = await getSettingsShortcut(page);
        await page.keyboard.press(settingsShortcut);
        await expect(page).toHaveURL(/\/settings\/general$/);
        await expect(renameInput).not.toBeVisible();
        await clickSettingsBackToWorkspace(page);
        await expectSameRenderedNode(originalComposer!, composer);
      });
    } finally {
      await workspace.cleanup();
    }
  });

  test("opening Settings on a compact layout keeps the agent composer mounted", async ({
    page,
  }) => {
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 480, height: 900 });
    const serverId = getServerId();
    const workspace = await seedWorkspace({ repoPrefix: "compact-settings-pane-retention-" });

    try {
      const agent = await createIdleAgent(workspace.client, {
        cwd: workspace.repoPath,
        workspaceId: workspace.workspaceId,
        title: `compact-settings-pane-retention-${Date.now()}`,
      });
      const agentRoute = buildHostAgentDetailRoute(serverId, agent.id, agent.workspaceId);

      await page.goto(agentRoute);
      await expectComposerVisible(page);
      const composer = page.getByTestId("message-input-root").filter({ visible: true }).first();
      const originalComposer = await captureRenderedNode(composer);

      const workspaceRoute = buildHostWorkspaceRoute(serverId, workspace.workspaceId);
      await openCompactSettings(page, workspaceRoute);
      await page.goBack();
      await waitForWorkspaceRoute(page, workspaceRoute);
      await expectSameRenderedNode(originalComposer, composer);
    } finally {
      await workspace.cleanup();
    }
  });

  test("workspace navigation keeps the terminal emulator mounted", async ({ page }) => {
    test.setTimeout(90_000);
    const serverId = getServerId();
    const workspace = await seedWorkspace({ repoPrefix: "terminal-pane-retention-" });

    try {
      const agent = await createIdleAgent(workspace.client, {
        cwd: workspace.repoPath,
        workspaceId: workspace.workspaceId,
        title: `terminal-pane-retention-${Date.now()}`,
      });

      await page.goto(buildHostAgentDetailRoute(serverId, agent.id, agent.workspaceId));
      await waitForWorkspaceTabsVisible(page);
      await clickNewTerminal(page);
      await expectTerminalSurfaceVisible(page);
      const terminalSurface = terminalSurfaceLocator(page);
      const originalTerminal = await captureRenderedNode(terminalSurface);

      await test.step("switching tabs preserves the terminal", async () => {
        await page.getByTestId(`workspace-tab-agent_${agent.id}`).click();
        await expectComposerVisible(page);
        await expectNodeConnected(originalTerminal);

        await clickFirstTerminalTab(page);
        await expectSameRenderedNode(originalTerminal, terminalSurface);
      });

      await test.step("opening Settings preserves the terminal", async () => {
        await openSettings(page);
        await clickSettingsBackToWorkspace(page);
        await expectSameRenderedNode(originalTerminal, terminalSurface);
      });
    } finally {
      await workspace.cleanup();
    }
  });

  test("opening several linked file tabs keeps the chat reading position", async ({ page }) => {
    // Regression for getpaseo/paseo#3271: a reader scrolled away from the live tail who
    // clicks enough file links to exceed the pane's tab LRU cap used to lose that spot —
    // the evicted chat tab remounted at "initial-entry" and jumped to the bottom. Anchor
    // on a specific turn's prompt rather than a raw pixel offset: history can legitimately
    // grow as more of the timeline hydrates, and the contract is "keep the anchored item
    // in view", not "never let content height change" (see docs on turn anchoring in
    // agent-timeline-pagination.spec.ts).
    test.setTimeout(240_000);
    const serverId = getServerId();
    const workspace = await seedWorkspace({
      repoPrefix: "reading-position-",
      repo: {
        files: [
          { path: "alpha.md", content: "# alpha\n" },
          { path: "beta.md", content: "# beta\n" },
          { path: "gamma.md", content: "# gamma\n" },
        ],
      },
    });
    const fileNames = ["alpha.md", "beta.md", "gamma.md"];
    const fileLink = (name: string) => `[${name}](file://${workspace.repoPath}/${name})`;
    const assistantResponse = [
      "Investigating across three modules.",
      "",
      `See ${fileLink("alpha.md")} for the first module.`,
      `See ${fileLink("beta.md")} for the second module.`,
      `See ${fileLink("gamma.md")} for the third module.`,
      "",
      "Repeating this analysis across turns builds up enough scrollback for the test.",
    ].join("\n");
    const turnPrompt = (index: number) => `reading-position-turn-${String(index).padStart(2, "0")}`;
    // A settled assistant response now renders one row per Markdown block instead of one row
    // for the whole response (presentation.ts's nativeBlocks), so fewer turns fit in the
    // virtualizer's fixed overscan window than before; anchor closer to the live tail so this
    // turn is still mounted.
    const anchorPrompt = turnPrompt(27);

    try {
      const agent = await workspace.client.createAgent({
        provider: "mock",
        cwd: workspace.repoPath,
        workspaceId: workspace.workspaceId,
        title: "reading-position-regression",
        modeId: "load-test",
        model: "e2e-fast-stream",
        featureValues: { mockAssistantResponse: assistantResponse },
      });
      for (let index = 0; index < 30; index += 1) {
        await workspace.client.sendAgentMessage(agent.id, turnPrompt(index));
        await workspace.client.waitForFinish(agent.id, 15_000);
      }

      await page.goto(buildHostAgentDetailRoute(serverId, agent.id, workspace.workspaceId));
      await waitForWorkspaceTabsVisible(page);
      await expectComposerVisible(page);

      await scrollTimelinePromptIntoView(page, anchorPrompt);
      const readingPosition = await rememberTimelinePromptPosition(page, anchorPrompt);

      const chatTab = page.getByTestId(`workspace-tab-agent_${agent.id}`).first();
      const chatScroll = page.locator('[data-testid="agent-chat-scroll"]:visible').first();
      const originalTranscript = await captureRenderedNode(chatScroll);

      // Every turn's assistant response repeats the same three file links, so a
      // locator that just grabs "the first alpha.md link in the page" resolves to
      // whichever turn happens to be first in DOM order — not the one sitting at the
      // reader's current position. A real reader can only click what is in front of
      // them, at the anchor turn; scope the locator to that turn's own assistant
      // row so the click lands on the link actually near `readingPosition`, instead
      // of one from turn 0 whose distance from the anchor is exactly the kind of
      // large, arbitrary scroll this test must not produce on its own.
      const anchorRow = page
        .locator("[data-history-row-id]")
        .filter({ has: page.getByTestId("user-message").filter({ hasText: anchorPrompt }) });
      // The settled response's three file links each sit in their own block row now
      // (assistantBlockRowsForTurn's doc comment); span every block row this turn renders,
      // bounded to before the next turn's prompt, rather than just the immediate sibling.
      const anchorAssistantRow = await assistantBlockRowsForTurn(anchorRow, page);

      const fileTabs = page.locator('[data-testid^="workspace-tab-file_"]');
      for (const [index, fileName] of fileNames.entries()) {
        // Mirror the real repro: click a link from the chat tab, then return to
        // chat (as the bug report describes) before opening the next file link.
        await chatTab.click();
        await expect(chatTab).toHaveAttribute("aria-selected", "true");
        // AssistantMarkdownLink (assistant-file-links/link.tsx) wraps the real,
        // positioned link element in a native `<a>` used only to keep the browser's
        // own "copy link address" affordance; that `<a>` is `display: contents` (no
        // box of its own) and still exposes an ARIA "link" role even though its
        // navigation is fully suppressed, so `getByRole("link")` matches it *and*
        // the real inner element, in that order. Taking `.first()` grabs the
        // geometry-less outer `<a>`, whose empty bounding box sends Playwright's
        // click-time scroll-into-view to an arbitrary position instead of this
        // link's actual location — exactly the kind of unrelated scroll this test
        // exists to rule out. `.last()` is the real, positioned element.
        const link = anchorAssistantRow.getByRole("link", { name: fileName, exact: true }).last();
        await expect(link).toBeVisible({ timeout: 15_000 });
        await link.click();
        await expect(fileTabs).toHaveCount(index + 1, { timeout: 15_000 });
      }

      await chatTab.click();
      await expect(chatTab).toHaveAttribute("aria-selected", "true");

      await expectSameRenderedNode(originalTranscript, chatScroll);
      await expectTimelinePromptPositionPreserved(page, readingPosition);
    } finally {
      await workspace.cleanup();
    }
  });
});
