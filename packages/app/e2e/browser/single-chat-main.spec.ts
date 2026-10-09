import { expect, test, type Page } from "../support/fixtures";
import { seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import { getServerId } from "../support/helpers/server-id";
import {
  archiveMainChatFromHeader,
  expectMainChat,
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
