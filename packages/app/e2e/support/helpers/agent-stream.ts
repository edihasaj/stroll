import { expect, type Locator, type Page } from "@playwright/test";
import { readScrollMetrics, waitForContentGrowth, expectNearBottom } from "./agent-bottom-anchor";
import { mainChatHeader } from "./workspace-tabs";

/**
 * Resolves a locator that may transiently match both a live control and the Reanimated web
 * exit-animation ghost of the one it replaced. The composer's primary action slot cross-fades
 * arrow <-> stop in place instead of swapping instantly (packages/app/src/composer/input/
 * input.tsx's `PrimaryAction`, docs/design.md §17): for the fade's duration the outgoing button
 * stays mounted under a `position: absolute` ancestor injected by the exit animation while the
 * incoming one already occupies the slot in normal flow, so a role+name locator can resolve to
 * both. Returns the match that is in normal flow (the live control).
 */
export async function resolveLiveMatch(locator: Locator): Promise<Locator> {
  const count = await locator.count();
  if (count <= 1) return locator;
  const positions = await locator.evaluateAll((elements) =>
    elements.map((element) => {
      let node = element.parentElement;
      for (let depth = 0; depth < 10 && node; depth += 1) {
        if (getComputedStyle(node).position === "absolute") return "absolute";
        node = node.parentElement;
      }
      return "normal";
    }),
  );
  const liveIndex = positions.findIndex((position) => position === "normal");
  return locator.nth(liveIndex >= 0 ? liveIndex : 0);
}

export async function awaitAssistantMessage(page: Page, hasText?: string | RegExp): Promise<void> {
  const messages = page.getByTestId("assistant-message");
  const target = hasText === undefined ? messages.first() : messages.filter({ hasText }).first();
  await expect(target).toBeVisible({ timeout: 30_000 });
}

export async function awaitToolCall(page: Page, toolName: string | RegExp): Promise<void> {
  await expect(
    page.getByTestId("tool-call-badge").filter({ hasText: toolName }).first(),
  ).toBeVisible({ timeout: 30_000 });
}

export async function expectAgentIdle(page: Page, timeout = 30_000): Promise<void> {
  await expect(page.getByRole("button", { name: /stop|cancel/i })).toHaveCount(0, { timeout });
}

// The working indicator is an animated spinner View — no semantic ARIA role, testId is correct.
export async function expectInlineWorkingIndicator(page: Page): Promise<void> {
  await expect(page.getByTestId("turn-working-indicator")).toBeVisible({ timeout: 30_000 });
}

/** The sidebar's row for the chat with this title. A chat is no tab: the sidebar and the main header show its state. */
function sidebarChatRowByTitle(page: Page, title: string): Locator {
  return page
    .locator('[data-testid^="sidebar-chat-row-"]')
    .filter({ has: page.getByText(title, { exact: true }) })
    .first();
}

/** The main view shows the chat with this title and its sidebar row. */
async function expectChatShowing(page: Page, title: string): Promise<Locator> {
  await expect(mainChatHeader(page).getByTestId("chat-pane-title")).toContainText(title, {
    timeout: 30_000,
  });
  const row = sidebarChatRowByTitle(page, title);
  await expect(row).toBeVisible({ timeout: 30_000 });
  return row;
}

export async function expectRunningAgentChrome(page: Page, title: string): Promise<void> {
  const row = await expectChatShowing(page, title);

  await expect(row.getByTestId("sidebar-chat-status-running")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole("button", { name: /stop agent|canceling agent/i })).toBeVisible({
    timeout: 30_000,
  });
  await expectInlineWorkingIndicator(page);
}

export async function expectAgentReadyToInterrupt(page: Page): Promise<void> {
  await expect
    .poll(
      async () =>
        (
          await resolveLiveMatch(page.getByRole("button", { name: "Stop agent", exact: true }))
        ).isVisible(),
      {
        timeout: 30_000,
      },
    )
    .toBe(true);
  await expect(page.getByRole("button", { name: "Canceling agent", exact: true })).toHaveCount(0);
}

export async function expectVisibleAgentSurfacesIdle(page: Page): Promise<void> {
  await expect(mainChatHeader(page)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("sidebar-chat-status-running")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /stop agent|canceling agent/i })).toHaveCount(0);
  await expect(page.getByTestId("turn-working-indicator")).toHaveCount(0);
  await expect(page.getByTestId("turn-working-elapsed")).toHaveCount(0);
}

export async function expectAgentSurfacesIdle(page: Page, title: string): Promise<void> {
  const row = await expectChatShowing(page, title);

  await expect(row.getByTestId("sidebar-chat-status-running")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /stop agent|canceling agent/i })).toHaveCount(0);
  await expect(page.getByTestId("turn-working-indicator")).toHaveCount(0);
  await expect(page.getByTestId("turn-working-elapsed")).toHaveCount(0);
  await expectTurnCopyButton(page);
}

export async function expectTurnCopyButton(page: Page): Promise<void> {
  await expect(page.getByRole("button", { name: "Copy turn" }).first()).toBeVisible({
    timeout: 30_000,
  });
}

export async function expectScrollFollowsNewContent(page: Page): Promise<void> {
  const { contentHeight } = await readScrollMetrics(page);
  await waitForContentGrowth(page, contentHeight);
  await expectNearBottom(page);
}
