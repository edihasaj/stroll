import { expect, test, type Page } from "../support/fixtures";
import {
  fillComposerDraft,
  expectComposerDraft,
  expectComposerVisible,
} from "../support/helpers/composer";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import { seedWorkspace } from "../support/helpers/seed-client";
import { getServerId } from "../support/helpers/server-id";
import {
  archiveMainChatFromHeader,
  createAgentTabFromMenu,
  expectMainChat,
  expectMainDraft,
  expectNotMainChat,
  openChatFromSidebar,
  sidebarChatRow,
  waitForWorkspaceTabsVisible,
} from "../support/helpers/workspace-tabs";
import { mainPane, sidePane } from "../support/helpers/side-pane";
import { buildHostWorkspaceRoute } from "../../src/utils/host-routes";

// The e2e fixtures pin navigator.platform to Win32, so Cmd shortcuts are Ctrl here.
const PREVIOUS_CHAT_SHORTCUT = "Control+Alt+ArrowLeft";
const NEXT_CHAT_SHORTCUT = "Control+Alt+ArrowRight";
// Cmd/Ctrl+W is the desktop app's; a browser tab keeps it for itself, so web closes with Alt+Shift+W.
const CLOSE_TAB_SHORTCUT = "Alt+Shift+W";
const LAYOUT_STORAGE_KEY = "workspace-layout-state";

interface SeededLayoutInput {
  workspaceKey: string;
  firstAgentId: string;
  secondAgentId: string;
  terminalId: string;
}

/**
 * The layout a version 2 build saved for a workspace that had two chats and a terminal open in its
 * main pane: tabs for all three in one pane, the chat tabs first, the second chat focused.
 */
function buildVersionTwoLayoutBlob(input: SeededLayoutInput): string {
  const tab = (tabId: string, target: Record<string, string>) => ({
    tabId,
    target,
    createdAt: 1,
  });
  const tabs = [
    tab(`agent_${input.firstAgentId}`, { kind: "agent", agentId: input.firstAgentId }),
    tab(`agent_${input.secondAgentId}`, { kind: "agent", agentId: input.secondAgentId }),
    tab(`terminal_${input.terminalId}`, { kind: "terminal", terminalId: input.terminalId }),
  ];
  const explorerTabs = [
    tab("files", { kind: "files" }),
    tab("changes_tree", { kind: "changes_tree" }),
  ];
  const pane = (id: string, paneTabs: typeof tabs, focusedTabId: string, hidden = false) => ({
    kind: "pane",
    pane: {
      id,
      tabIds: paneTabs.map((entry) => entry.tabId),
      tabs: paneTabs,
      focusedTabId,
      ...(hidden ? { hidden: true } : {}),
    },
  });
  return JSON.stringify({
    state: {
      layoutByWorkspace: {
        [input.workspaceKey]: {
          root: {
            kind: "group",
            group: {
              id: "group_saved_root",
              direction: "horizontal",
              sizes: [0.78, 0.22],
              children: [
                pane("main", tabs, `agent_${input.secondAgentId}`),
                pane("explorer", explorerTabs, "files", true),
              ],
            },
          },
          focusedPaneId: "main",
        },
      },
      splitSizesByWorkspace: {},
      explorerPaneIdByWorkspace: { [input.workspaceKey]: "explorer" },
      explorerSidebarWidthByWorkspace: {},
      sidePaneIdByWorkspace: {},
    },
    version: 2,
  });
}

/** Saves the blob before the app boots, once, so a reload sees the migrated layout. */
async function seedLayoutBeforeBoot(page: Page, blob: string): Promise<void> {
  await page.addInitScript(
    ({ key, value }) => {
      if (localStorage.getItem(key) === null) {
        localStorage.setItem(key, value);
      }
    },
    { key: LAYOUT_STORAGE_KEY, value: blob },
  );
}

test("a saved layout with two chats and a terminal opens as one chat beside a side pane", async ({
  page,
}) => {
  const workspace = await seedMockAgentWorkspace({
    repoPrefix: "single-chat-main-",
    title: "Alpha chat",
  });

  try {
    const second = await workspace.client.createAgent({
      provider: "mock",
      cwd: workspace.cwd,
      workspaceId: workspace.workspaceId,
      title: "Beta chat",
      modeId: "load-test",
      model: "e2e-fast-stream",
    });
    const terminal = await workspace.client.createTerminal(
      workspace.cwd,
      "saved-terminal",
      undefined,
      {
        workspaceId: workspace.workspaceId,
      },
    );
    if (!terminal.terminal) throw new Error(terminal.error ?? "Failed to seed a terminal");
    await seedLayoutBeforeBoot(
      page,
      buildVersionTwoLayoutBlob({
        workspaceKey: `${getServerId()}:${workspace.workspaceId}`,
        firstAgentId: workspace.agentId,
        secondAgentId: second.id,
        terminalId: terminal.terminal.id,
      }),
    );
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(buildHostWorkspaceRoute(getServerId(), workspace.workspaceId));
    await waitForWorkspaceTabsVisible(page);

    await test.step("the main view shows the focused chat and no tab row", async () => {
      await expectMainChat(page, second.id);
      await expect(mainPane(page).getByTestId("main-pane-header")).toBeVisible();
      await expect(mainPane(page).getByTestId("workspace-tabs-row")).toHaveCount(0);
      await expect(mainPane(page).locator('[data-testid^="workspace-tab-agent_"]')).toHaveCount(0);
    });

    await test.step("the terminal moved to the side pane", async () => {
      await expect(sidePane(page)).toHaveCount(1, { timeout: 30_000 });
      await expect(
        sidePane(page).getByTestId(`workspace-tab-terminal_${terminal.terminal?.id}`),
      ).toBeVisible();
      await expect(sidePane(page).locator('[data-testid^="workspace-tab-agent_"]')).toHaveCount(0);
    });

    await test.step("the other chat is listed in the sidebar, not closed", async () => {
      await expect(sidebarChatRow(page, workspace.agentId)).toBeVisible({ timeout: 30_000 });
      await expect(sidebarChatRow(page, second.id)).toHaveAttribute("aria-selected", "true");
      await expect(sidebarChatRow(page, workspace.agentId)).toHaveAttribute(
        "aria-selected",
        "false",
      );
    });

    await test.step("opening the other chat from the sidebar replaces the main view's chat", async () => {
      await openChatFromSidebar(page, workspace.agentId);

      await expectNotMainChat(page, second.id);
      await expect(sidebarChatRow(page, second.id)).toBeVisible();
      await expect(sidePane(page).locator('[data-testid^="workspace-tab-terminal_"]')).toHaveCount(
        1,
      );
    });

    await test.step("Previous chat goes back and Next chat goes forward", async () => {
      await page.keyboard.press(PREVIOUS_CHAT_SHORTCUT);
      await expectMainChat(page, second.id);

      await page.keyboard.press(NEXT_CHAT_SHORTCUT);
      await expectMainChat(page, workspace.agentId);
    });

    await test.step("closing the main chat asks before archiving it", async () => {
      await page.keyboard.press(PREVIOUS_CHAT_SHORTCUT);
      await expectMainChat(page, second.id);

      const dismissed: string[] = [];
      page.once("dialog", (dialog) => {
        dismissed.push(dialog.message());
        void dialog.dismiss();
      });
      await page.keyboard.press(CLOSE_TAB_SHORTCUT);
      await expect.poll(() => dismissed.length).toBe(1);
      expect(dismissed[0]).toContain("Archive this chat?");
      await expectMainChat(page, second.id);
      await expect(sidebarChatRow(page, second.id)).toBeVisible();

      const confirmed = await archiveMainChatFromHeader(page);
      expect(confirmed).toContain("Archive this chat?");
      await expect(sidebarChatRow(page, second.id)).toHaveCount(0, { timeout: 15_000 });
      await expectNotMainChat(page, second.id);
    });
  } finally {
    await workspace.cleanup();
  }
});

test("the migrated layout is saved once and survives a reload", async ({ page }) => {
  const workspace = await seedMockAgentWorkspace({
    repoPrefix: "single-chat-main-reload-",
    title: "Alpha chat",
  });

  try {
    const second = await workspace.client.createAgent({
      provider: "mock",
      cwd: workspace.cwd,
      workspaceId: workspace.workspaceId,
      title: "Beta chat",
      modeId: "load-test",
      model: "e2e-fast-stream",
    });
    const terminal = await workspace.client.createTerminal(
      workspace.cwd,
      "saved-terminal",
      undefined,
      {
        workspaceId: workspace.workspaceId,
      },
    );
    if (!terminal.terminal) throw new Error(terminal.error ?? "Failed to seed a terminal");
    const blob = buildVersionTwoLayoutBlob({
      workspaceKey: `${getServerId()}:${workspace.workspaceId}`,
      firstAgentId: workspace.agentId,
      secondAgentId: second.id,
      terminalId: terminal.terminal.id,
    });
    await seedLayoutBeforeBoot(page, blob);
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(buildHostWorkspaceRoute(getServerId(), workspace.workspaceId));
    await waitForWorkspaceTabsVisible(page);
    await expectMainChat(page, second.id);

    await expect
      .poll(async () =>
        page.evaluate(
          (key) => JSON.parse(localStorage.getItem(key) ?? "{}").version,
          LAYOUT_STORAGE_KEY,
        ),
      )
      .toBe(3);
    const backup = await page.evaluate(() =>
      localStorage.getItem("workspace-layout-state.v2-backup"),
    );
    expect(backup).toBe(blob);

    await page.reload();
    await waitForWorkspaceTabsVisible(page);

    await expectMainChat(page, second.id);
    await expect(sidePane(page).locator('[data-testid^="workspace-tab-terminal_"]')).toHaveCount(1);
    expect(
      await page.evaluate(() => localStorage.getItem("workspace-layout-state.v2-backup")),
    ).toBe(blob);
  } finally {
    await workspace.cleanup();
  }
});

test("Previous chat and Next chat cross workspaces", async ({ page }) => {
  const first = await seedMockAgentWorkspace({
    repoPrefix: "single-chat-history-a-",
    title: "Alpha chat",
  });
  const second = await seedMockAgentWorkspace({
    repoPrefix: "single-chat-history-b-",
    title: "Gamma chat",
  });

  try {
    await page.setViewportSize({ width: 1400, height: 900 });
    await openAgentRoute(page, { workspaceId: first.workspaceId, agentId: first.agentId });
    await waitForWorkspaceTabsVisible(page);
    await expectMainChat(page, first.agentId);

    await test.step("opening a chat in another workspace switches to it", async () => {
      await openChatFromSidebar(page, second.agentId);

      await expect(page).toHaveURL(new RegExp(`/workspace/${second.workspaceId}`));
      await expectMainChat(page, second.agentId);
    });

    await test.step("Previous chat returns to the first workspace's chat", async () => {
      await page.keyboard.press(PREVIOUS_CHAT_SHORTCUT);

      await expect(page).toHaveURL(new RegExp(`/workspace/${first.workspaceId}`));
      await expectMainChat(page, first.agentId);
    });

    await test.step("Next chat goes forward again", async () => {
      await page.keyboard.press(NEXT_CHAT_SHORTCUT);

      await expect(page).toHaveURL(new RegExp(`/workspace/${second.workspaceId}`));
      await expectMainChat(page, second.agentId);
    });
  } finally {
    await second.cleanup();
    await first.cleanup();
  }
});

test("archiving the main chat opens the previous chat from the history, then the composer", async ({
  page,
}) => {
  const workspace = await seedMockAgentWorkspace({
    repoPrefix: "single-chat-archive-fallback-",
    title: "First chat",
  });
  const createChat = (title: string) =>
    workspace.client.createAgent({
      provider: "mock",
      cwd: workspace.cwd,
      workspaceId: workspace.workspaceId,
      title,
      modeId: "load-test",
      model: "e2e-fast-stream",
    });

  try {
    const second = await createChat("Second chat");
    const third = await createChat("Third chat");
    await page.setViewportSize({ width: 1400, height: 900 });
    await openAgentRoute(page, { workspaceId: workspace.workspaceId, agentId: workspace.agentId });
    await waitForWorkspaceTabsVisible(page);
    await expectMainChat(page, workspace.agentId);
    await openChatFromSidebar(page, second.id);
    await expectMainChat(page, second.id);
    await openChatFromSidebar(page, third.id);
    await expectMainChat(page, third.id);

    await test.step("archiving the newest chat returns to the one opened before it", async () => {
      await archiveMainChatFromHeader(page);

      await expectMainChat(page, second.id);
    });

    await test.step("archiving that one returns to the chat opened before it", async () => {
      await archiveMainChatFromHeader(page);

      await expectMainChat(page, workspace.agentId);
    });

    await test.step("archiving the last chat shows the new-chat composer", async () => {
      await archiveMainChatFromHeader(page);

      await expect(
        mainPane(page).getByTestId("main-pane-draft-header").filter({ visible: true }),
      ).toBeVisible({ timeout: 30_000 });
    });
  } finally {
    await workspace.cleanup();
  }
});

test("an agent created elsewhere takes an empty draft's place, but never a draft with text", async ({
  page,
}) => {
  const workspace = await seedWorkspace({ repoPrefix: "single-chat-draft-replaced-" });
  const createChat = (title: string) =>
    workspace.client.createAgent({
      provider: "mock",
      cwd: workspace.repoPath,
      workspaceId: workspace.workspaceId,
      title,
      modeId: "load-test",
      model: "e2e-fast-stream",
    });

  try {
    await page.setViewportSize({ width: 1400, height: 900 });
    await page.goto(buildHostWorkspaceRoute(getServerId(), workspace.workspaceId));
    await waitForWorkspaceTabsVisible(page);
    await expectMainDraft(page);
    await expectComposerVisible(page);

    let first: Awaited<ReturnType<typeof createChat>>;
    await test.step("a chat created out of band replaces the empty composer", async () => {
      first = await createChat("Created elsewhere");

      await expectMainChat(page, first.id);
      await expect(mainPane(page).getByTestId("chat-pane-title").first()).toHaveText(
        "Created elsewhere",
      );
    });

    await test.step("a draft with text keeps the main view; the new chat only joins the sidebar", async () => {
      await createAgentTabFromMenu(page);
      await expectMainDraft(page);
      await fillComposerDraft(page, "keep this text");
      await expectComposerDraft(page, "keep this text");

      const second = await createChat("Created while typing");

      await expect(sidebarChatRow(page, second.id)).toBeVisible({ timeout: 30_000 });
      await expectMainDraft(page);
      await expectComposerDraft(page, "keep this text");
      await expectNotMainChat(page, second.id);
    });
  } finally {
    await workspace.cleanup();
  }
});
