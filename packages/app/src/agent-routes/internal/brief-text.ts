/**
 * The brief's list fields (decisions, open items, files) edit as one line of text per entry.
 * These two functions are the only place that shape is decided, so the sheet and its tests agree.
 */
export function splitBriefList(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
}

export function joinBriefList(items: readonly string[]): string {
  return items.join("\n");
}
