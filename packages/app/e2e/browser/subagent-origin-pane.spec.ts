import { writeFile } from "node:fs/promises";
import path from "node:path";
import { expect, test } from "../support/fixtures";
import { openAgentRoute, seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import { seedWorkspace } from "../support/helpers/seed-client";
import { mainPane, sidePane } from "../support/helpers/side-pane";
import {
  clickSubagentTrackRow,
  openSubagentsTrack,
  seedParentWithSubagent,
} from "../support/helpers/subagents";
import { expectMainChat, expectNotMainChat } from "../support/helpers/workspace-tabs";

// The e2e fixtures pin navigator.platform to Win32, so Cmd shortcuts are Ctrl here.
const PREVIOUS_CHAT_SHORTCUT = "Control+Alt+ArrowLeft";

test("a subagent opened from the track replaces its parent in the main view", async ({ page }) => {
  const workspace = await seedWorkspace({ repoPrefix: "subagent-origin-pane-" });
  try {
    const pair = await seedParentWithSubagent(workspace, {
      parentTitle: "Parent chat",
      childTitle: "Child agent",
      // Outlive the test: the default ten-second stream can finish mid-test and move the child
      // into the track's collapsed Done group before these checks click its row.
      // A prompt is required too — without one no turn ever starts, so the child goes idle (and
      // Done) within moments regardless of which model is selected.
      childModel: "five-minute-stream",
      childInitialPrompt: "stay running",
    });
    await page.setViewportSize({ width: 1400, height: 900 });
    await openAgentRoute(page, { workspaceId: pair.workspaceId, agentId: pair.parent.id });
    await expectMainChat(page, pair.parent.id);

    await openSubagentsTrack(page);
    await clickSubagentTrackRow(page, pair.child.id);

    await test.step("the child takes the main view and no side pane opens for it", async () => {
      await expectMainChat(page, pair.child.id);
      await expectNotMainChat(page, pair.parent.id);
      await expect(sidePane(page)).toHaveCount(0);
      await expect(mainPane(page).locator('[data-testid^="workspace-tab-agent_"]')).toHaveCount(0);
    });

    await test.step("Previous chat goes back to the parent", async () => {
      await page.keyboard.press(PREVIOUS_CHAT_SHORTCUT);
      await expectMainChat(page, pair.parent.id);
      await expectNotMainChat(page, pair.child.id);
    });
  } finally {
    await workspace.cleanup();
  }
});

test("a chat file link opens in the side pane and keeps the chat in the main view", async ({
  page,
}) => {
  const target = "linked.ts:3";
  const workspace = await seedMockAgentWorkspace({
    repoPrefix: "chat-file-origin-pane-",
    title: "File link parent",
    initialPrompt: [
      "Generate a title and a git branch name for a coding agent from the user prompt and attachments.",
      "Return JSON only with fields 'title' and 'branch'.",
      "",
      "<user-prompt>",
      `Open \`${target}\` now`,
      "</user-prompt>",
    ].join("\n"),
  });
  try {
    await writeFile(path.join(workspace.cwd, "linked.ts"), "one\ntwo\nthree\n", "utf8");
    await page.setViewportSize({ width: 1400, height: 900 });
    await openAgentRoute(page, { workspaceId: workspace.workspaceId, agentId: workspace.agentId });
    await expectMainChat(page, workspace.agentId);

    const fileLink = mainPane(page).getByText(target, { exact: true });
    await expect(fileLink).toBeVisible({ timeout: 15_000 });
    await fileLink.click();

    await expect(sidePane(page).getByTestId("workspace-tab-file_linked.ts")).toBeVisible();
    await expect(mainPane(page).getByTestId("workspace-tab-file_linked.ts")).toHaveCount(0);
    await expectMainChat(page, workspace.agentId);
  } finally {
    await workspace.cleanup();
  }
});
