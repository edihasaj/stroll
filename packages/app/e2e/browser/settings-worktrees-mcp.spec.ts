import { existsSync } from "node:fs";
import { expect, test, type Page } from "../support/fixtures";
import { gotoAppShell, openSettings } from "../support/helpers/app";
import {
  archiveWorkspaceFromDaemon,
  connectNewWorkspaceDaemonClient,
  createWorktreeViaDaemon,
  openProjectViaDaemon,
} from "../support/helpers/new-workspace";
import { expectAppRoute } from "../support/helpers/route-assertions";
import { getServerId } from "../support/helpers/server-id";
import { openSettingsHostSection } from "../support/helpers/settings";
import { createTempGitRepo } from "../support/helpers/workspace";
import { buildSettingsSectionRoute } from "@/utils/host-routes";

type DaemonClient = Awaited<ReturnType<typeof connectNewWorkspaceDaemonClient>>;

async function hostMcpServers(client: DaemonClient) {
  return (await client.getDaemonConfig()).config.mcpServers ?? {};
}

test.describe("Settings: merged pages, MCP servers, and Worktrees", () => {
  test.describe.configure({ timeout: 120_000 });

  let client: DaemonClient;

  test.beforeEach(async () => {
    client = await connectNewWorkspaceDaemonClient();
  });

  test.afterEach(async () => {
    await client
      .patchDaemonConfig({ mcpServers: {}, worktrees: { root: "" } })
      .catch(() => undefined);
    await client.close().catch(() => undefined);
  });

  test("the Editor row lives on General and the retired pages are gone from the sidebar", async ({
    page,
  }) => {
    await gotoAppShell(page);
    await openSettings(page);

    await expect(page.getByTestId("vim-keybindings-toggle")).toBeVisible();

    const sidebar = page.getByTestId("settings-sidebar");
    for (const retired of ["Editor", "Browser", "Integrations", "Permissions"]) {
      await expect(sidebar.getByRole("button", { name: retired, exact: true })).toHaveCount(0);
    }

    // Old deep links land on the page that holds the row now.
    for (const [retired, target] of [
      ["editor", "general"],
      ["browser", "diagnostics"],
      ["integrations", "about"],
      ["permissions", "notifications"],
    ] as const) {
      await page.goto(`/settings/${retired}`);
      await expectAppRoute(page, buildSettingsSectionRoute(target));
    }
  });

  test("MCP servers: add, disable, edit, and remove round-trip through the host config", async ({
    page,
  }) => {
    await gotoAppShell(page);
    await openSettings(page);
    await openSettingsHostSection(page, getServerId(), "mcp-servers");
    await expect(page.getByTestId("mcp-servers-empty")).toBeVisible();

    // A first save with nothing filled in shows the errors and stores nothing.
    await page.getByTestId("mcp-servers-add-button").click();
    await page.getByTestId("mcp-server-save").click();
    await expect(page.getByTestId("mcp-server-name-field-error")).toBeVisible();
    await expect(page.getByTestId("mcp-server-command-field-error")).toBeVisible();
    expect(await hostMcpServers(client)).toEqual({});

    await page.getByTestId("mcp-server-name-input").fill("files");
    await page.getByTestId("mcp-server-command-input").fill("npx");
    await page.getByTestId("mcp-server-args-input").fill("-y\nfiles-mcp");
    await page.getByTestId("mcp-server-env-input").fill("ROOT=/repo");
    await page.getByTestId("mcp-server-save").click();

    await expect(page.getByTestId("mcp-server-row-files")).toContainText("npx -y files-mcp");
    await expect
      .poll(() => hostMcpServers(client))
      .toEqual({
        files: {
          config: {
            type: "stdio",
            command: "npx",
            args: ["-y", "files-mcp"],
            env: { ROOT: "/repo" },
          },
        },
      });

    await page.getByTestId("mcp-server-toggle-files").click();
    await expect.poll(async () => (await hostMcpServers(client)).files?.enabled).toBe(false);

    await page.getByTestId("mcp-server-edit-files").click();
    await expect(page.getByTestId("mcp-server-command-input")).toHaveValue("npx");
    await page.getByTestId("mcp-transport-http").click();
    await page.getByTestId("mcp-server-url-input").fill("https://docs.example.com/mcp");
    await page.getByTestId("mcp-server-save").click();

    await expect(page.getByTestId("mcp-server-row-files")).toContainText(
      "https://docs.example.com/mcp",
    );
    await expect
      .poll(() => hostMcpServers(client))
      .toEqual({
        files: { enabled: false, config: { type: "http", url: "https://docs.example.com/mcp" } },
      });

    page.once("dialog", (dialog) => void dialog.accept());
    await page.getByTestId("mcp-server-remove-files").click();
    await expect(page.getByTestId("mcp-server-row-files")).toHaveCount(0);
    await expect(page.getByTestId("mcp-servers-empty")).toBeVisible();
    await expect.poll(() => hostMcpServers(client)).toEqual({});
  });

  test("Worktrees: lists a seeded worktree, pins it, and removes it", async ({ page }) => {
    const repo = await createTempGitRepo("settings-worktrees-");
    let worktreeDirectory: string | null = null;
    try {
      await openProjectViaDaemon(client, repo.path);
      const worktree = await createWorktreeViaDaemon(client, {
        cwd: repo.path,
        slug: `settings-wt-${Date.now()}`,
      });
      worktreeDirectory = worktree.workspaceDirectory;

      await gotoAppShell(page);
      await openSettings(page);
      await openSettingsHostSection(page, getServerId(), "worktrees");

      const row = page.getByTestId(`worktree-row-${worktree.workspaceId}`);
      await expect(row).toBeVisible({ timeout: 30_000 });
      await expect(row).toContainText(worktree.workspaceName);
      await expect(row).toContainText(worktree.workspaceDirectory);
      await expect(
        page.getByTestId("host-page-auto-archive-merged-workspaces-switch"),
      ).toBeVisible();

      await page.getByTestId(`worktree-pin-${worktree.workspaceId}`).click();
      await expect
        .poll(async () => pinnedAt(client, worktree.workspaceId), { timeout: 30_000 })
        .not.toBeNull();

      await expectWorktreesRootRoundTrip(page, client);

      const remove = page.getByTestId(`worktree-remove-${worktree.workspaceId}`);
      await expect(remove).toBeEnabled({ timeout: 30_000 });
      page.once("dialog", (dialog) => void dialog.accept());
      await remove.click();

      await expect(row).toHaveCount(0);
      await expect
        .poll(() => existsSync(worktree.workspaceDirectory), { timeout: 30_000 })
        .toBe(false);
      worktreeDirectory = null;
    } finally {
      if (worktreeDirectory) {
        await archiveWorkspaceFromDaemon(client, worktreeDirectory).catch(() => undefined);
      }
      await repo.cleanup().catch(() => undefined);
    }
  });
});

async function pinnedAt(client: DaemonClient, workspaceId: string): Promise<string | null> {
  const { entries } = await client.fetchWorkspaces();
  return entries.find((entry) => entry.id === workspaceId)?.pinnedAt ?? null;
}

async function expectWorktreesRootRoundTrip(page: Page, client: DaemonClient): Promise<void> {
  const input = page.getByTestId("worktrees-root-input");
  const save = page.getByTestId("worktrees-root-save");
  await expect(input).toBeVisible();
  await expect(save).toBeDisabled();

  await input.fill("/tmp/stroll-e2e-worktrees");
  await expect(save).toBeEnabled();
  await save.click();
  await expect
    .poll(async () => (await client.getDaemonConfig()).config.worktrees?.root)
    .toBe("/tmp/stroll-e2e-worktrees");

  await input.fill("");
  await save.click();
  await expect
    .poll(async () => (await client.getDaemonConfig()).config.worktrees?.root)
    .toBeUndefined();
}
