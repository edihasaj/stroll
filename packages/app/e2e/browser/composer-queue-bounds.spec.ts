import type { Page } from "@playwright/test";
import { expect, test } from "../support/fixtures";
import {
  fillComposerDraft,
  sendDraftToQueue,
  startRunningMockAgent,
} from "../support/helpers/composer";
import { queueTrackMaxHeight } from "@/composer/queue-track-metrics";

const QUEUED_COUNT = 8;

async function queueMessage(page: Page, prompt: string): Promise<void> {
  await fillComposerDraft(page, prompt);
  await sendDraftToQueue(page);
  // Queueing is a daemon round trip (composer/index.tsx's queueMessage awaits
  // client.createAgentQueuePrompt before clearing the draft), not a local, synchronous update.
  // Wait for this row to land before queueing the next one, or a fast loop can fire the next
  // Control+Enter while this request is still in flight and lose a message. The row the scroll
  // stays pinned away from (the track does not auto-scroll to new entries) is still attached, so
  // assert presence rather than viewport visibility.
  await expect(
    page.getByTestId("composer-queue-track").getByText(prompt, { exact: true }),
  ).toBeAttached();
}

test("a long queue is bounded and scrolls instead of growing without end", async ({
  page,
}, testInfo) => {
  test.setTimeout(120_000);
  // Five-minute stream, not one: queuing QUEUED_COUNT messages one at a time (each a UI
  // fill+submit round trip) can run past a minute under CI load. A shorter mock turn risks the
  // daemon's idle-drain finishing it and pulling the oldest queued message into an active turn
  // mid-loop, which flakes the "still queued" assertions below on nothing but machine speed.
  const agent = await startRunningMockAgent(page, {
    prefix: `queue-bounds-${testInfo.workerIndex}-`,
    model: "five-minute-stream",
    prompt: "Keep the agent running while messages queue.",
  });

  try {
    for (let index = 1; index <= QUEUED_COUNT; index += 1) {
      await queueMessage(page, `queued message ${index}`);
    }

    const track = page.getByTestId("composer-queue-track");
    await expect(track).toBeVisible();

    // Every queued message survives — the cap is visual only, it must not drop work. Each row's
    // "Send queued message now" button is hover-revealed (composer/index.tsx QueuedMessageRow),
    // so assert on the always-rendered row text instead of the button's accessible name.
    await expect(track.getByText(/^queued message \d+$/)).toHaveCount(QUEUED_COUNT);

    const cap = queueTrackMaxHeight({ borderWidth: 1 });
    const box = await track.boundingBox();
    expect(box).not.toBeNull();
    // Eight rows would exceed the cap if the list still grew freely.
    expect(box?.height ?? 0).toBeLessThanOrEqual(cap + 1);

    // ...and the overflow stays reachable rather than being clipped away.
    const scroll = page.getByTestId("composer-queue-scroll");
    const overflow = await scroll.evaluate(
      (node: HTMLElement) => node.scrollHeight - node.clientHeight,
    );
    expect(overflow).toBeGreaterThan(0);

    // The message that goes in next stays pinned at the top; no auto-scroll.
    const scrollTop = await scroll.evaluate((node: HTMLElement) => node.scrollTop);
    expect(scrollTop).toBe(0);
    await expect(track.getByText("queued message 1")).toBeVisible();
  } finally {
    await agent.cleanup();
  }
});
