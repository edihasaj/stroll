/**
 * The title a chat shows in a tab, the sidebar, or its header. Null while the chat has none yet:
 * a blank title, or the "New agent" placeholder the daemon uses until a real one is generated.
 */
export function resolveChatTitle(title: string | null | undefined): string | null {
  if (typeof title !== "string") {
    return null;
  }
  const normalized = title.trim();
  if (!normalized) {
    return null;
  }
  if (normalized.toLowerCase() === "new agent") {
    return null;
  }
  return normalized;
}
