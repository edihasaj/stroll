import { randomUUID } from "node:crypto";
import type { Locator, Page } from "@playwright/test";
import { submitMessage, expectComposerEditable } from "../support/helpers/composer";
import {
  focusTerminalSurface,
  typeInTerminal,
  getTerminalBufferText,
} from "../support/helpers/terminal-perf";
import { buildHostWorkspaceRoute } from "../../src/utils/host-routes";
import { metroTest as test, expect } from "../support/fixtures";
import { buildCreateAgentPreferences, buildSeededHost } from "../support/helpers/daemon-registry";
import { startIsolatedHostDaemon } from "../support/helpers/isolated-host-daemon";
import type { MockAgentWorkspace } from "../support/helpers/mock-agent";
import { seedWorkspace } from "../support/helpers/seed-client";
import {
  expectTimelinePromptVisible,
  holdOlderHistoryPages,
  openAgentTimeline,
  userScrollsTimelineToHistoryStart,
} from "../support/helpers/timeline-pagination";

/**
 * Waits for the scroll container's own geometry to stop changing before returning -
 * releasing the next chained page before the timeline has digested the last one risks
 * mis-evaluating "still at history start" against a layout that has not caught up, which
 * can trigger more chain-loads than a patient, one-at-a-time release ever would.
 */
async function waitForTimelineToSettle(timeline: Locator): Promise<void> {
  await timeline.evaluate(
    (element) =>
      new Promise<void>((resolve, reject) => {
        if (!(element instanceof HTMLElement)) {
          reject(new Error("Agent chat scroll element is not an HTMLElement"));
          return;
        }
        const startedAt = performance.now();
        let stableFrames = 0;
        let previous = `${element.scrollTop}:${element.scrollHeight}`;
        const sample = () => {
          const current = `${element.scrollTop}:${element.scrollHeight}`;
          stableFrames = current === previous ? stableFrames + 1 : 0;
          previous = current;
          if (stableFrames >= 4) {
            resolve();
            return;
          }
          if (performance.now() - startedAt > 5_000) {
            resolve(); // Settle is a best-effort pacing aid here, not a hard assertion.
            return;
          }
          requestAnimationFrame(sample);
        };
        requestAnimationFrame(sample);
      }),
  );
}

/**
 * scrollThroughOlderHistoryPages (shared with chat-outline.spec.ts and
 * agent-timeline-pagination.spec.ts) assumes exactly one history request per scroll
 * gesture. The published 0.2.5 daemon mock here breaks that assumption on purpose:
 * history-start-pagination.ts's "settling" state re-arms the instant a just-loaded page
 * still leaves the viewport inside the history-start threshold, chain-loading the next
 * page with no further user input. Draining one page at a time, pacing each release with
 * a settle wait and running `onPageSettled` after each one, is what lets a caller observe
 * the timeline at every intermediate step of the chain - not just wherever it finally
 * comes to rest, which this daemon's overlapping pages can later reshuffle past the page
 * a caller cares about (reconcileHistoryWindow, use-stream-history-window.ts, snaps the
 * local reveal window back toward the newest items once the row it was tracking is
 * superseded by a later merge).
 */
async function drainOldDaemonHistoryChain(
  page: Page,
  history: Awaited<ReturnType<typeof holdOlderHistoryPages>>,
  releasedSoFar: number,
  timeline: Locator,
  onPageSettled: () => Promise<void>,
): Promise<number> {
  const spinner = page.getByTestId("load-older-history-spinner");
  let released = releasedSoFar;
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    while (released < history.requestCount()) {
      released += 1;
      history.releasePage(released);
      await waitForTimelineToSettle(timeline);
      await onPageSettled();
    }
    if (!(await spinner.isVisible())) break;
    await page.waitForTimeout(25);
  }
  // Catches a response that lands in the gap between the loop's last drain and its
  // spinner check.
  while (released < history.requestCount()) {
    released += 1;
    history.releasePage(released);
  }
  return released;
}

/**
 * Loads every older page the daemon has, draining each gesture's full chain, and calls
 * `onPageSettled` after every page this chain releases. How many pages/gestures that
 * takes is a property of the old daemon's overlapping pagination windows (the cross-page
 * duplicates `expectRepeatedEntries` checks for), not a number this spec should
 * hard-code.
 */
async function drainAllOldDaemonHistory(
  page: Page,
  history: Awaited<ReturnType<typeof holdOlderHistoryPages>>,
  onPageSettled: () => Promise<void>,
): Promise<void> {
  const timeline = page.locator('[data-testid="agent-chat-scroll"]:visible').first();

  let released = 0;
  for (let gesture = 0; gesture < 30; gesture += 1) {
    const requestedBefore = history.requestCount();
    await userScrollsTimelineToHistoryStart(page);
    released = await drainOldDaemonHistoryChain(page, history, released, timeline, onPageSettled);
    if (history.requestCount() === requestedBefore) return; // no older history left to load
  }
}

test("does not repeat an assistant block when the current app paginates a published 0.2.5 daemon", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const serverId = `srv_old_pagination_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
  const daemon = await startIsolatedHostDaemon(serverId, { publishedVersion: "0.2.5" });
  const observationSockets = new Set<unknown>();
  page.on("websocket", (socket) => {
    socket.on("framesent", ({ payload }) => {
      if (typeof payload !== "string") return;
      const frame = JSON.parse(payload);
      if (
        frame.type === "session" &&
        frame.message.type === "fetch_agents_request" &&
        frame.message.subscribe
      )
        observationSockets.add(socket);
    });
  });
  const workspace = await seedWorkspace({
    repoPrefix: "timeline-old-daemon-pagination-",
    port: daemon.port,
  });
  const createdAgent = await workspace.client.createAgent({
    provider: "mock",
    cwd: workspace.repoPath,
    workspaceId: workspace.workspaceId,
    title: "Published daemon pagination regression",
    modeId: "load-test",
    model: "ten-second-stream",
  });
  const agent: MockAgentWorkspace = {
    agentId: createdAgent.id,
    workspaceId: workspace.workspaceId,
    cwd: workspace.repoPath,
    client: workspace.client,
    cleanup: workspace.cleanup,
  };

  try {
    for (let index = 0; index < 40; index += 1) {
      await agent.client.sendAgentMessage(
        agent.agentId,
        `timeline-pagination-older-turn-${index}: emit 1 coalesced agent stream updates`,
      );
      await agent.client.waitForFinish(agent.agentId, 15_000);
    }
    await agent.client.sendAgentMessage(agent.agentId, "build a realistic long mock timeline");
    await agent.client.waitForFinish(agent.agentId, 20_000);
    for (let index = 0; index < 20; index += 1) {
      await agent.client.sendAgentMessage(
        agent.agentId,
        `timeline-pagination-turn-${index}: emit 1 coalesced agent stream updates`,
      );
      await agent.client.waitForFinish(agent.agentId, 15_000);
    }

    const host = buildSeededHost({
      serverId,
      endpoint: `127.0.0.1:${daemon.port}`,
      nowIso: new Date().toISOString(),
    });
    await page.addInitScript(
      ({ seededHost, preferences }) => {
        localStorage.setItem("@paseo:e2e", "1");
        localStorage.setItem("@paseo:daemon-registry", JSON.stringify([seededHost]));
        localStorage.setItem("@paseo:create-agent-preferences", JSON.stringify(preferences));
      },
      { seededHost: host, preferences: buildCreateAgentPreferences() },
    );
    // A finished turn folds its in-between messages behind "Worked for" (docs/design.md
    // §12), which would hide the mid-turn "Now I have a clearer picture." text this spec
    // looks for. Keep every row unfolded, the same way agent-stream-ui.spec.ts does for
    // its own tool-call row.
    await page.addInitScript(() => {
      localStorage.setItem(
        "@paseo:app-settings",
        JSON.stringify({ toolCallDetailLevel: "detailed" }),
      );
    });

    const history = await holdOlderHistoryPages(page, agent, daemon.port);
    await openAgentTimeline(page, agent, serverId);
    await expectTimelinePromptVisible(
      page,
      "timeline-pagination-turn-19: emit 1 coalesced agent stream updates",
    );

    const targetText = "Now I have a clearer picture.";
    const timeline = page.locator('[data-testid="agent-chat-scroll"]:visible').first();
    const isTextMounted = async () =>
      (await timeline.getByText(targetText, { exact: false }).count()) > 0;
    // Each later chain-loaded page can reshuffle the client's local reveal window back
    // toward the newest items (see drainOldDaemonHistoryChain's doc comment), so the
    // render check runs the moment the target page is mounted rather than waiting for
    // the whole chain - possibly many pages further - to settle first.
    let verified = false;
    await drainAllOldDaemonHistory(page, history, async () => {
      if (verified || !(await isTextMounted())) return;
      await history.expectOwnedTextRendered(targetText);
      verified = true;
    });
    expect(verified).toBe(true);

    history.expectRepeatedEntries();
    expect(observationSockets.size).toBe(1);

    await test.step("send a live turn after reconnecting the old daemon", async () => {
      await daemon.restart();
      await expect.poll(() => observationSockets.size, { timeout: 30_000 }).toBe(2);
      await expectComposerEditable(page);
      await submitMessage(
        page,
        "compatibility-after-reconnect: emit 1 coalesced agent stream updates",
      );
      await expectTimelinePromptVisible(
        page,
        "compatibility-after-reconnect: emit 1 coalesced agent stream updates",
      );
      // The browser and the seed client reconnect independently after the restart.
      await agent.client.connect();
      await agent.client.waitForFinish(agent.agentId, 20_000);
      await page.screenshot({ path: test.info().outputPath("old-daemon-live-reconnect.png") });
    });

    await test.step("open a terminal and receive its output", async () => {
      const terminal = await agent.client.createTerminal(agent.cwd, "Compatibility terminal");
      expect(terminal.error).toBeNull();
      const terminalId = terminal.terminal!.id;
      const route = buildHostWorkspaceRoute(serverId, workspace.workspaceId);
      await page.goto(`${route}?open=${encodeURIComponent(`terminal:${terminalId}`)}`);
      await focusTerminalSurface(page);
      await typeInTerminal(page, "printf 'compatibility-%s\\n' terminal-output\n");
      await expect
        .poll(() => getTerminalBufferText(page), { timeout: 15_000 })
        .toContain("compatibility-terminal-output");
      await page.screenshot({ path: test.info().outputPath("old-daemon-terminal.png") });
      await agent.client.killTerminal(terminalId);
    });
  } finally {
    await agent.cleanup();
    await daemon.close();
  }
});
