import type { StreamItem, TurnFoldItem } from "@/types/stream";

export interface TurnFoldInput {
  tail: StreamItem[];
  head: StreamItem[];
  isTurnActive: boolean;
  expandedFoldIds: ReadonlySet<string>;
}

export interface TurnFoldOutput {
  tail: StreamItem[];
  head: StreamItem[];
}

interface FoldPlan {
  firstIndex: number;
  indices: ReadonlySet<number>;
  item: TurnFoldItem;
}

const WORK_KINDS: ReadonlySet<StreamItem["kind"]> = new Set(["tool_call", "thought"]);

/**
 * The rows that are a turn's work rather than its answer. Errors and warnings stay visible:
 * a fold never hides that something went wrong. Plugin rows keep their own presentation.
 */
function isFoldable(item: StreamItem): boolean {
  switch (item.kind) {
    case "tool_call":
    case "thought":
    case "todo_list":
    case "assistant_message":
    case "compaction":
      return true;
    case "notification":
      return item.sourceType !== "error" && item.level === "info";
    default:
      return false;
  }
}

function messageGroupId(item: StreamItem): string | null {
  return item.kind === "assistant_message" ? (item.blockGroupId ?? item.id) : null;
}

/** Index of the first block of the response's final assistant message, or -1 when it has none. */
function findFinalAnswerStart(items: readonly StreamItem[], start: number, end: number): number {
  let last = -1;
  for (let index = end - 1; index >= start; index -= 1) {
    if (items[index]!.kind === "assistant_message") {
      last = index;
      break;
    }
  }
  if (last === -1) return -1;
  const groupId = messageGroupId(items[last]!);
  let first = last;
  while (first - 1 >= start && messageGroupId(items[first - 1]!) === groupId) {
    first -= 1;
  }
  return first;
}

/**
 * Plans the fold for one finished response (the rows between two user messages). Only rows of
 * the final answer's canonical turn fold, so turn timing and fork boundaries keep working; a
 * response without a final answer, or without any tool call, thought, or in-between message
 * before it, stays as it is.
 */
function planResponseFold(input: {
  items: readonly StreamItem[];
  start: number;
  end: number;
  expandedFoldIds: ReadonlySet<string>;
  reuse: (next: TurnFoldItem) => TurnFoldItem;
}): FoldPlan | null {
  const { items, start, end } = input;
  const answerStart = findFinalAnswerStart(items, start, end);
  if (answerStart <= start) return null;
  const turnId = items[answerStart]!.turnId;
  const indices: number[] = [];
  let hasWork = false;
  for (let index = start; index < answerStart; index += 1) {
    const item = items[index]!;
    const sameTurn = turnId === undefined || item.turnId === undefined || item.turnId === turnId;
    if (!sameTurn || !isFoldable(item)) continue;
    indices.push(index);
    hasWork ||= WORK_KINDS.has(item.kind) || item.kind === "assistant_message";
  }
  if (!hasWork) return null;
  const firstIndex = indices[0]!;
  const id = `turn-fold:${items[firstIndex]!.id}`;
  const before = items[start - 1];
  const startedAt = before?.kind === "user_message" ? before.timestamp : null;
  const endedAt = items[end - 1]!.timestamp;
  return {
    firstIndex,
    indices: new Set(indices),
    item: input.reuse({
      kind: "turn_fold",
      id,
      ...(turnId !== undefined ? { turnId } : {}),
      timestamp: items[firstIndex]!.timestamp,
      durationMs: startedAt ? Math.max(0, endedAt.getTime() - startedAt.getTime()) : null,
      foldedCount: indices.length,
      expanded: input.expandedFoldIds.has(id),
    }),
  };
}

/**
 * Splits a response at canonical turn changes. A response can hold several turns when the later
 * ones were started by the system (a subagent finishing, a queued notice); each turn keeps its own
 * final answer visible. Rows without a turn id stay with the turn they sit in.
 */
function splitByCanonicalTurn(
  items: readonly StreamItem[],
  start: number,
  end: number,
): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  let rangeStart = start;
  let turnId: string | undefined;
  for (let index = start; index < end; index += 1) {
    const itemTurnId = items[index]!.turnId;
    if (itemTurnId === undefined) continue;
    if (turnId !== undefined && itemTurnId !== turnId) {
      ranges.push([rangeStart, index]);
      rangeStart = index;
    }
    turnId = itemTurnId;
  }
  ranges.push([rangeStart, end]);
  return ranges;
}

function planFolds(input: {
  items: readonly StreamItem[];
  isTurnActive: boolean;
  expandedFoldIds: ReadonlySet<string>;
  reuse: (next: TurnFoldItem) => TurnFoldItem;
}): FoldPlan[] {
  const { items } = input;
  const plans: FoldPlan[] = [];
  let index = 0;
  while (index < items.length) {
    if (items[index]!.kind === "user_message") {
      index += 1;
      continue;
    }
    const start = index;
    while (index < items.length && items[index]!.kind !== "user_message") index += 1;
    const ranges = splitByCanonicalTurn(items, start, index);
    // The running turn's work stays in view; it folds once the turn finishes.
    const settled = index === items.length && input.isTurnActive ? ranges.slice(0, -1) : ranges;
    for (const [rangeStart, rangeEnd] of settled) {
      const plan = planResponseFold({
        items,
        start: rangeStart,
        end: rangeEnd,
        expandedFoldIds: input.expandedFoldIds,
        reuse: input.reuse,
      });
      if (plan) plans.push(plan);
    }
  }
  return plans;
}

function isTurnFoldEqual(left: TurnFoldItem, right: TurnFoldItem): boolean {
  return (
    left.id === right.id &&
    left.turnId === right.turnId &&
    left.timestamp.getTime() === right.timestamp.getTime() &&
    left.durationMs === right.durationMs &&
    left.foldedCount === right.foldedCount &&
    left.expanded === right.expanded
  );
}

function sameItems(previous: readonly StreamItem[], next: readonly StreamItem[]): boolean {
  return previous.length === next.length && previous.every((item, index) => item === next[index]);
}

/**
 * Folds every finished turn's work behind one "Worked for" row, the way Codex shows a completed
 * turn: the user's message and the final answer stay; the tool calls, thoughts, and in-between
 * messages fold away until the row is expanded. The running turn is never folded.
 *
 * Output arrays and fold rows keep their identity while nothing changed, so a streaming tick
 * does not invalidate the history layout cache.
 */
export function createTurnFolder(): (input: TurnFoldInput) => TurnFoldOutput {
  let foldItems = new Map<string, TurnFoldItem>();
  let previous: TurnFoldOutput = { tail: [], head: [] };

  return (input) => {
    const nextFoldItems = new Map<string, TurnFoldItem>();
    const reuse = (next: TurnFoldItem): TurnFoldItem => {
      const existing = foldItems.get(next.id);
      const item = existing && isTurnFoldEqual(existing, next) ? existing : next;
      nextFoldItems.set(item.id, item);
      return item;
    };
    const items = [...input.tail, ...input.head];
    const plans = planFolds({
      items,
      isTurnActive: input.isTurnActive,
      expandedFoldIds: input.expandedFoldIds,
      reuse,
    });
    foldItems = nextFoldItems;
    if (plans.length === 0) {
      previous = { tail: input.tail, head: input.head };
      return previous;
    }

    const planByFirstIndex = new Map(plans.map((plan) => [plan.firstIndex, plan]));
    const hidden = new Set<number>();
    for (const plan of plans) {
      if (plan.item.expanded) continue;
      for (const index of plan.indices) hidden.add(index);
    }
    const tail: StreamItem[] = [];
    const head: StreamItem[] = [];
    items.forEach((item, index) => {
      const target = index < input.tail.length ? tail : head;
      const plan = planByFirstIndex.get(index);
      if (plan) target.push(plan.item);
      if (!hidden.has(index)) target.push(item);
    });
    previous = {
      tail: sameItems(previous.tail, tail) ? previous.tail : tail,
      head: sameItems(previous.head, head) ? previous.head : head,
    };
    return previous;
  };
}
