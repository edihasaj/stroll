import {
  buildHostAgentDetailRoute,
  buildHostWorkspaceOpenRoute,
  buildHostWorkspaceRoute,
} from "@/utils/host-routes";
import { expect, test, type Page } from "../support/fixtures";
import { gotoAppShell, openSettings } from "../support/helpers/app";
import {
  createMockIdleAgent,
  expectWorkspaceTabHidden,
  expectWorkspaceTabVisible,
  openWorkspaceWithAgents,
} from "../support/helpers/archive-tab";
import { clickNewChat } from "../support/helpers/launcher";
import { expectComposerVisible } from "../support/helpers/composer";
import { daemonWsRoutePattern } from "../support/helpers/daemon-port";
import { seedWorkspace } from "../support/helpers/seed-client";
import {
  getMainChatAgentId,
  waitForWorkspaceTabsVisible,
  expectWorkspaceTabsAbsent,
} from "../support/helpers/workspace-tabs";
import {
  expectSidebarWorkspaceSelected,
  expectWorkspaceHeader,
  expectWorkspaceHeaderAbsent,
  expectMenuButtonVisible,
  expectHostConnectingOrOffline,
  expectReconnectingToastVisible,
  expectReconnectingToastGone,
  switchWorkspaceViaSidebar,
  waitForSidebarHydration,
  waitForWorkspaceInSidebar,
  workspaceDeckEntryLocator,
  expectWorkspaceDeckEntryCount,
} from "../support/helpers/workspace-ui";
import { clickSettingsBackToWorkspace } from "../support/helpers/settings";
import { getServerId } from "../support/helpers/server-id";
import { expectAppRoute } from "../support/helpers/route-assertions";
import { installDaemonWebSocketGate } from "../support/helpers/daemon-websocket-gate";
import { addConnectedHostAndReload, addOfflineHostAndReload } from "../support/helpers/hosts";
import { startIsolatedHostDaemon } from "../support/helpers/isolated-host-daemon";

const LOADING_WORKSPACE_TEXT_PATTERN = /Loading workspace/i;
async function expectNoLoadingWorkspacePane(
  page: Page,
  input: { label: string; durationMs?: number },
): Promise<void> {
  const durationMs = input.durationMs ?? 2000;
  const startedAt = Date.now();
  const samples: string[] = [];

  while (Date.now() - startedAt < durationMs) {
    const url = page.url();
    const text = await page
      .locator("body")
      .innerText({ timeout: 250 })
      .catch((error) => `[body unavailable: ${error instanceof Error ? error.message : error}]`);
    samples.push(`${Date.now() - startedAt}ms ${url}\n${text.slice(0, 1000)}`);

    if (LOADING_WORKSPACE_TEXT_PATTERN.test(text)) {
      throw new Error(
        `${input.label}: loading workspace pane appeared during reconnect window.\n\n${samples.join(
          "\n\n---\n\n",
        )}`,
      );
    }

    await page.waitForTimeout(100);
  }
}

async function expectNoLoadingPane(page: Page): Promise<void> {
  await expect(page.getByText(LOADING_WORKSPACE_TEXT_PATTERN)).toHaveCount(0);
}

/** Drafts live in the main view, not in tabs. A draft header carries its id; the empty view's does not. */
async function getVisibleDraftTabCount(page: Page): Promise<number> {
  return page
    .locator('[data-testid="main-pane-draft-header"][data-draft-id]')
    .filter({ visible: true })
    .count();
}

/** The main view has no tab to hover and close; the close-tab shortcut closes its draft. */
async function closeVisibleDraft(page: Page): Promise<void> {
  await expect(
    page.locator('[data-testid="main-pane-draft-header"][data-draft-id]').filter({ visible: true }),
  ).toBeVisible({ timeout: 30_000 });
  await page.keyboard.press("Alt+Shift+W");
}

test.describe("Workspace navigation regression", () => {
  test.describe.configure({ timeout: 240_000 });

  test("opens a notification's workspace on a different offline host", async ({ page }) => {
    const target = {
      serverId: "notification-offline-host",
      workspaceId: "notification-workspace",
      agentId: "notification-agent",
    };

    await gotoAppShell(page);
    await addOfflineHostAndReload(page, {
      serverId: target.serverId,
      label: "Notification Host",
    });
    await expect(
      page.getByTestId("sidebar-settings").filter({ visible: true }).first(),
    ).toBeVisible({
      timeout: 30_000,
    });

    await page.evaluate((data) => {
      globalThis.dispatchEvent(
        new CustomEvent("paseo:web-notification-click", {
          detail: { data: { ...data, reason: "finished" } },
          cancelable: true,
        }),
      );
    }, target);

    await expectAppRoute(
      page,
      buildHostWorkspaceOpenRoute(target.serverId, target.workspaceId, `agent:${target.agentId}`),
      { timeout: 30_000 },
    );
    await expect(page.getByText("Connecting", { exact: true })).toBeVisible();
    // The standalone brand row was dropped once the icon rail + panel sidebar took over the
    // host switcher (acb09bcd8); sidebar-hosts-trigger is the one place that shows the active
    // host's name now (sidebar-panel-footer.tsx).
    await expect(page.getByTestId("sidebar-hosts-trigger")).toContainText("Notification Host");
    await expect(page.getByText("Add a project", { exact: true })).toHaveCount(0);
  });

  test("shows a fresh new-chat composer after returning from settings and closing the last draft", async ({
    page,
    withWorkspace,
  }) => {
    const workspace = await withWorkspace({ prefix: "workspace-settings-back-tab-" });

    await workspace.navigateTo();
    // An empty workspace opens on the composer; New chat reuses that draft's slot.
    await expect.poll(() => getVisibleDraftTabCount(page), { timeout: 30_000 }).toBe(1);
    await clickNewChat(page);
    await expect.poll(() => getVisibleDraftTabCount(page), { timeout: 30_000 }).toBe(1);

    await openSettings(page);
    await clickSettingsBackToWorkspace(page);
    await expect(page).toHaveURL(/\/workspace\//, { timeout: 30_000 });
    await expect.poll(() => getVisibleDraftTabCount(page), { timeout: 30_000 }).toBe(1);

    await closeVisibleDraft(page);

    // The main view never sits empty: closing its only chat brings the composer back.
    await expect.poll(() => getVisibleDraftTabCount(page), { timeout: 30_000 }).toBe(1);
    await expectComposerVisible(page);
  });

  test("keeps the workspace rendered while reconnecting to the host", async ({ page }) => {
    const serverId = getServerId();

    const daemonGate = await installDaemonWebSocketGate(page);

    const workspace = await seedWorkspace({ repoPrefix: "workspace-reconnect-" });

    try {
      const agent = await createMockIdleAgent(workspace.client, {
        cwd: workspace.repoPath,
        workspaceId: workspace.workspaceId,
        title: `workspace-reconnect-${Date.now()}`,
      });

      await gotoAppShell(page);
      await waitForSidebarHydration(page);
      await page.goto(buildHostAgentDetailRoute(serverId, agent.id, agent.workspaceId));
      await page.waitForURL(
        (url) => url.pathname.includes("/workspace/") && !url.searchParams.has("open"),
        { timeout: 60_000 },
      );
      await expectWorkspaceHeader(page, {
        title: workspace.workspaceName,
        subtitle: workspace.projectDisplayName,
      });
      await waitForWorkspaceTabsVisible(page);
      await expectWorkspaceTabVisible(page, agent.id);
      // The reconnect toast belongs to the visible agent panel, which mounts
      // after the tab strip. Drop the connection only after that panel is ready.
      await expectComposerVisible(page);

      await daemonGate.drop();
      await daemonGate.waitForBlockedConnection();
      await expectReconnectingToastVisible(page);
      await expectWorkspaceHeader(page, {
        title: workspace.workspaceName,
        subtitle: workspace.projectDisplayName,
      });
      await waitForWorkspaceTabsVisible(page);
      await expectComposerVisible(page);
      await expectNoLoadingPane(page);

      const monitorReconnect = expectNoLoadingWorkspacePane(page, {
        label: "host reconnect",
      });
      daemonGate.restore();
      await expectReconnectingToastGone(page);
      await monitorReconnect;
      await expectWorkspaceHeader(page, {
        title: workspace.workspaceName,
        subtitle: workspace.projectDisplayName,
      });
      await waitForWorkspaceTabsVisible(page);
      await expectComposerVisible(page);
    } finally {
      daemonGate.restore();
      await workspace.cleanup();
    }
  });

  test("does not show reconnecting for an inactive host workspace", async ({ page }) => {
    const secondaryHost = await startIsolatedHostDaemon("inactive-reconnecting-host");
    const primaryWorkspace = await seedWorkspace({ repoPrefix: "active-reconnecting-host-" });
    const secondaryWorkspace = await seedWorkspace({
      repoPrefix: "inactive-reconnecting-host-",
      port: secondaryHost.port,
    });

    try {
      await Promise.all([
        createMockIdleAgent(primaryWorkspace.client, {
          cwd: primaryWorkspace.repoPath,
          workspaceId: primaryWorkspace.workspaceId,
          title: "Active host agent",
        }),
        createMockIdleAgent(secondaryWorkspace.client, {
          cwd: secondaryWorkspace.repoPath,
          workspaceId: secondaryWorkspace.workspaceId,
          title: "Inactive host agent",
        }),
      ]);

      await gotoAppShell(page);
      await addConnectedHostAndReload(page, {
        serverId: secondaryHost.serverId,
        label: "Inactive host",
        port: secondaryHost.port,
      });
      await waitForWorkspaceInSidebar(page, {
        serverId: secondaryHost.serverId,
        workspaceId: secondaryWorkspace.workspaceId,
      });
      await switchWorkspaceViaSidebar({
        page,
        serverId: secondaryHost.serverId,
        workspaceId: secondaryWorkspace.workspaceId,
      });
      await waitForWorkspaceTabsVisible(page);
      await switchWorkspaceViaSidebar({
        page,
        serverId: getServerId(),
        workspaceId: primaryWorkspace.workspaceId,
      });
      await waitForWorkspaceTabsVisible(page);

      await secondaryHost.close();
      await page.waitForTimeout(1_500);

      await expectReconnectingToastGone(page, { timeout: 100 });
    } finally {
      await secondaryHost.close();
      await secondaryWorkspace.cleanup();
      await primaryWorkspace.cleanup();
    }
  });

  test("cold offline workspace route gates the screen interior but keeps settings reachable", async ({
    page,
  }) => {
    const serverId = getServerId();

    await page.routeWebSocket(daemonWsRoutePattern(), async (ws) => {
      await ws.close({ code: 1008, reason: "Blocked cold offline workspace route test." });
    });

    await page.goto(buildHostWorkspaceRoute(serverId, "/tmp/paseo-missing-workspace"));

    await expectHostConnectingOrOffline(page);
    await expectMenuButtonVisible(page);
    await expectWorkspaceHeaderAbsent(page);
    await expectWorkspaceTabsAbsent(page);
    await openSettings(page);
    await expect(page).toHaveURL(/\/settings\/general$/);
  });

  test("cold workspace URL keeps sidebar workspace navigation functional", async ({ page }) => {
    const serverId = getServerId();

    const firstWorkspace = await seedWorkspace({ repoPrefix: "workspace-cold-url-a-" });
    const secondWorkspace = await seedWorkspace({ repoPrefix: "workspace-cold-url-b-" });

    try {
      await page.goto(buildHostWorkspaceRoute(serverId, firstWorkspace.workspaceId));
      await waitForSidebarHydration(page);
      await expect(page).toHaveURL(buildHostWorkspaceRoute(serverId, firstWorkspace.workspaceId), {
        timeout: 30_000,
      });

      const secondRow = page.getByTestId(
        `sidebar-workspace-row-${serverId}:${secondWorkspace.workspaceId}`,
      );
      await expect(secondRow).toBeVisible({ timeout: 30_000 });
      await secondRow.click();

      await expect(page).toHaveURL(buildHostWorkspaceRoute(serverId, secondWorkspace.workspaceId), {
        timeout: 30_000,
      });
    } finally {
      await secondWorkspace.cleanup();
      await firstWorkspace.cleanup();
    }
  });

  test("sidebar navigation and reload keep workspace selection and tabs aligned", async ({
    page,
  }) => {
    const serverId = getServerId();

    const firstWorkspace = await seedWorkspace({ repoPrefix: "workspace-nav-reg-a-" });
    const secondWorkspace = await seedWorkspace({ repoPrefix: "workspace-nav-reg-b-" });

    try {
      const firstAgent = await createMockIdleAgent(firstWorkspace.client, {
        cwd: firstWorkspace.repoPath,
        workspaceId: firstWorkspace.workspaceId,
        title: `workspace-nav-a-${Date.now()}`,
      });
      const secondAgent = await createMockIdleAgent(secondWorkspace.client, {
        cwd: secondWorkspace.repoPath,
        workspaceId: secondWorkspace.workspaceId,
        title: `workspace-nav-b-${Date.now()}`,
      });

      await gotoAppShell(page);
      await waitForSidebarHydration(page);
      await openWorkspaceWithAgents(page, [firstAgent, secondAgent]);

      const firstDeckEntry = workspaceDeckEntryLocator(page, serverId, firstWorkspace.workspaceId);
      const secondDeckEntry = workspaceDeckEntryLocator(
        page,
        serverId,
        secondWorkspace.workspaceId,
      );

      await switchWorkspaceViaSidebar({
        page,
        serverId,
        workspaceId: firstWorkspace.workspaceId,
      });
      await waitForWorkspaceTabsVisible(page);
      await expect(page).toHaveURL(buildHostWorkspaceRoute(serverId, firstWorkspace.workspaceId), {
        timeout: 30_000,
      });
      await expectSidebarWorkspaceSelected({
        page,
        serverId,
        workspaceId: firstWorkspace.workspaceId,
      });
      await expectSidebarWorkspaceSelected({
        page,
        serverId,
        workspaceId: secondWorkspace.workspaceId,
        selected: false,
      });
      await expectWorkspaceHeader(page, {
        title: firstWorkspace.workspaceName,
        subtitle: firstWorkspace.projectDisplayName,
      });
      await expectWorkspaceTabVisible(page, firstAgent.id);
      await expectWorkspaceTabHidden(page, secondAgent.id);
      await expect(getMainChatAgentId(page)).resolves.toBe(firstAgent.id);
      await expect(firstDeckEntry).toBeVisible({ timeout: 30_000 });

      await switchWorkspaceViaSidebar({
        page,
        serverId,
        workspaceId: secondWorkspace.workspaceId,
      });
      await waitForWorkspaceTabsVisible(page);
      await expect(page).toHaveURL(buildHostWorkspaceRoute(serverId, secondWorkspace.workspaceId), {
        timeout: 30_000,
      });
      await expectSidebarWorkspaceSelected({
        page,
        serverId,
        workspaceId: secondWorkspace.workspaceId,
      });
      await expectSidebarWorkspaceSelected({
        page,
        serverId,
        workspaceId: firstWorkspace.workspaceId,
        selected: false,
      });
      await expectWorkspaceHeader(page, {
        title: secondWorkspace.workspaceName,
        subtitle: secondWorkspace.projectDisplayName,
      });
      await expectWorkspaceTabVisible(page, secondAgent.id);
      await expectWorkspaceTabHidden(page, firstAgent.id);
      await expect(getMainChatAgentId(page)).resolves.toBe(secondAgent.id);
      await expect(firstDeckEntry).toBeAttached();
      await expect(firstDeckEntry).toBeHidden();
      await expect(secondDeckEntry).toBeVisible({ timeout: 30_000 });
      await expectWorkspaceDeckEntryCount(page, 2);

      await page.evaluate(
        ({ agentId, serverId: targetServerId, workspaceId }) => {
          globalThis.dispatchEvent(
            new CustomEvent("paseo:web-notification-click", {
              detail: {
                data: {
                  serverId: targetServerId,
                  workspaceId,
                  agentId,
                  reason: "finished",
                },
              },
              cancelable: true,
            }),
          );
        },
        { agentId: secondAgent.id, serverId, workspaceId: secondWorkspace.workspaceId },
      );
      await waitForWorkspaceTabsVisible(page);
      await expect(page).toHaveURL(buildHostWorkspaceRoute(serverId, secondWorkspace.workspaceId), {
        timeout: 30_000,
      });
      await expect(secondDeckEntry).toBeVisible({ timeout: 30_000 });
      await expectWorkspaceTabVisible(page, secondAgent.id);
      await expectWorkspaceTabHidden(page, firstAgent.id);
      await expect(firstDeckEntry).toBeAttached();
      await expect(firstDeckEntry).toBeHidden();
      await expectWorkspaceDeckEntryCount(page, 2);

      await switchWorkspaceViaSidebar({
        page,
        serverId,
        workspaceId: firstWorkspace.workspaceId,
      });
      await waitForWorkspaceTabsVisible(page);
      await expect(page).toHaveURL(buildHostWorkspaceRoute(serverId, firstWorkspace.workspaceId), {
        timeout: 30_000,
      });
      await expect(firstDeckEntry).toBeVisible({ timeout: 30_000 });
      await expect(secondDeckEntry).toBeAttached();
      await expect(secondDeckEntry).toBeHidden();
      await expectWorkspaceDeckEntryCount(page, 2);

      await page.reload();
      await waitForSidebarHydration(page);
      await waitForWorkspaceTabsVisible(page);
      await expect(page).toHaveURL(buildHostWorkspaceRoute(serverId, firstWorkspace.workspaceId), {
        timeout: 30_000,
      });
      await expectSidebarWorkspaceSelected({
        page,
        serverId,
        workspaceId: firstWorkspace.workspaceId,
      });
      await expectWorkspaceHeader(page, {
        title: firstWorkspace.workspaceName,
        subtitle: firstWorkspace.projectDisplayName,
      });
      await expectWorkspaceTabVisible(page, firstAgent.id);
      await expectWorkspaceTabHidden(page, secondAgent.id);
      await expect(getMainChatAgentId(page)).resolves.toBe(firstAgent.id);
    } finally {
      await secondWorkspace.cleanup();
      await firstWorkspace.cleanup();
    }
  });
});
