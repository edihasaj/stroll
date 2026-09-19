export type ChatGreetingPeriod = "morning" | "afternoon" | "evening";

/**
 * Buckets the local hour into the three greeting periods shown on the blank chat hero.
 * Morning runs 5am-11:59am, afternoon runs 12pm-5:59pm, evening covers the rest
 * (6pm-4:59am) so a late-night session reads as "evening" rather than looping back to
 * "morning".
 */
export function resolveChatGreetingPeriod(hour: number): ChatGreetingPeriod {
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}
