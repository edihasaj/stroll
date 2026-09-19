/**
 * Decides whether a newly rendered message block should play its mount entrance animation
 * (`docs/design.md` "17. Motion", item M1 in `docs/ui-gap-gpt.md`).
 *
 * A stream item id is only ever a candidate for entrance the first time it is checked, and
 * `agent-stream/view.tsx` only checks ids drawn from the live head (`baseRenderModel.segments
 * .liveHead`) — the genuinely in-flight tail of the current turn. History rows (already-persisted
 * messages, pagination loads, and timeline recovery after a reconnect) never call
 * `shouldPlayMessageEntrance` at all, so they can never earn an entrance no matter what the
 * tracker holds.
 *
 * The tracker itself is one `Set` per agent conversation, held in a ref that view.tsx only
 * replaces when the viewed `agentId` changes (never on an ordinary re-render). Seeding a fresh
 * tracker with every item id already visible at that moment — synchronously, during render, before
 * any entrance decision runs — is what keeps a freshly opened chat, a chat resumed mid-stream, or
 * a reconnect-recovered timeline from flickering: everything on screen is marked "seen" before
 * the first paint.
 */
export interface MessageEntranceTracker {
  readonly seenIds: Set<string>;
}

export function createMessageEntranceTracker(): MessageEntranceTracker {
  return { seenIds: new Set() };
}

/**
 * Marks ids as already seen without granting them an entrance. Call once, synchronously during
 * render, whenever the tracker is (re)created for a conversation — with every item id currently
 * visible (history and live head both) — so already-on-screen content never animates.
 */
export function seedMessageEntranceTracker(
  tracker: MessageEntranceTracker,
  itemIds: Iterable<string>,
): void {
  for (const id of itemIds) {
    tracker.seenIds.add(id);
  }
}

/**
 * Returns `true` the first time `itemId` is checked against this tracker, `false` every time
 * after. The caller decides which items are even eligible to ask (live head only); this helper
 * only tracks first-sight-ever within whatever it is given.
 */
export function shouldPlayMessageEntrance(
  tracker: MessageEntranceTracker,
  itemId: string,
): boolean {
  if (tracker.seenIds.has(itemId)) {
    return false;
  }
  tracker.seenIds.add(itemId);
  return true;
}

/** A ref shape compatible with React's `useRef` — kept generic here so this stays a plain,
 * React-import-free module usable from a pure unit test. */
export interface AgentEntranceTrackerRef {
  current: { agentId: string; tracker: MessageEntranceTracker } | null;
}

/**
 * Returns the entrance tracker for `agentId`, creating and seeding a fresh one (see
 * `seedMessageEntranceTracker`) the first time this agent is seen or whenever the previously
 * held tracker belonged to a different agent. Call this synchronously during render, before any
 * `shouldPlayMessageEntrance` check for the same render, with every item id currently visible for
 * `agentId` — factored out of `agent-stream/view.tsx`'s component body so that branch doesn't
 * count against its cyclomatic complexity budget.
 */
export function getMessageEntranceTracker(
  ref: AgentEntranceTrackerRef,
  agentId: string,
  visibleItemIds: Iterable<string>,
): MessageEntranceTracker {
  if (ref.current && ref.current.agentId === agentId) {
    return ref.current.tracker;
  }
  const tracker = createMessageEntranceTracker();
  seedMessageEntranceTracker(tracker, visibleItemIds);
  ref.current = { agentId, tracker };
  return tracker;
}
