import { expect, test } from "../support/fixtures";
import { openCommandCenter } from "../support/helpers/command-center";
import { getServerId } from "../support/helpers/server-id";
import { seedMockAgentWorkspace } from "../support/helpers/mock-agent";
import { openAgentRoute } from "../support/helpers/mock-agent";
import { resetSeededPageState, openSessions } from "../support/helpers/archive-tab";

test("agent list age advances and command center says just now for a fresh agent", async ({
  page,
}) => {
  const session = await seedMockAgentWorkspace({
    repoPrefix: "agent-relative-time-",
    title: "Relative time agent",
  });
  try {
    await session.client.waitForAgentUpsert(session.agentId, (agent) => agent.status === "idle");
    await resetSeededPageState(page);
    // The sidebar's trailing slot defaults to "none" (hide sidebar diff stats by default, Codex
    // style); opt into "timestamp" so sidebar-workspace-timestamp renders at all.
    await page.addInitScript(() => {
      localStorage.setItem(
        "@paseo:app-settings",
        JSON.stringify({ sidebarWorkspaceTrailing: "timestamp" }),
      );
    });
    // Install the clock before the one full-document navigation this test needs
    // (openAgentRoute's page.goto), not after: relative-time labels share one setInterval per
    // tier (utils/relative-time-ticker.ts), started lazily by whichever label mounts first and
    // left running on the real clock if that happens before the fake one is installed — a label
    // that stays mounted across the fast-forward below would then never tick. Every workspace-route
    // surface (tab tooltip, sidebar timestamp) is then read without ever leaving that route:
    // entering/re-entering a workspace route after the fake clock is already advanced leaves
    // resolveWorkspaceRouteState's `workspace` input null (its directory resync resolves against
    // the advanced clock and comes back empty), which the route reads as "Workspace unavailable".
    // The Sessions screen and command center don't carry that per-workspace gate, so they're
    // reached afterward, once, with the clock already advanced.
    await page.clock.install({ time: Date.now() });
    await openAgentRoute(page, session);

    const tab = page.getByTestId(`workspace-tab-agent_${session.agentId}`).first();
    const tooltip = page.getByTestId(`workspace-tab-tooltip-agent_${session.agentId}`);
    await tab.hover();
    await expect(tooltip).toContainText("just now");

    const commandCenter = await openCommandCenter(page);
    await commandCenter.getByTestId("command-center-input").fill("Relative time agent");
    const agentResult = commandCenter.getByTestId(
      `command-center-agent-${getServerId()}:${session.agentId}`,
    );
    await expect(agentResult.getByTestId("command-center-agent-subtitle")).toContainText(
      "just now",
    );
    await page.keyboard.press("Escape");

    await page.clock.fastForward("03:00");

    // The tab lost hover to the command center above; re-hover before reading the advanced age.
    await tab.hover();
    await expect(tooltip).toContainText("3m ago");
    await expect(page.getByTestId("sidebar-workspace-timestamp").first()).toHaveText("3m");

    await openSessions(page);
    const row = page.getByTestId(`agent-row-${getServerId()}-${session.agentId}`);
    await expect(row).toContainText("3m ago", { timeout: 30_000 });
  } finally {
    await session.cleanup();
  }
});
