/** One entry of a Codex or Claude hook event list: a matcher and the command hooks it runs. */
export interface HookMatcherGroup {
  matcher?: unknown;
  hooks?: unknown;
  [key: string]: unknown;
}

export interface UpsertMarkedHookGroupInput {
  /** The event's current value in the config file, as parsed. */
  entries: unknown;
  /** Paseo's group for the event, holding exactly one command hook. */
  desired: HookMatcherGroup & { hooks: [Record<string, unknown>] };
  /** Whether a command hook is one of Paseo's. */
  isMarked: (hook: Record<string, unknown>) => boolean;
}

/**
 * Puts Paseo's hook for one event into the event's list without moving anything around it.
 *
 * Codex records hook trust by position (`file:event:group:hook`). Re-appending Paseo's group on
 * every daemon start shifted every hook another tool had added after it, so Codex asked the user to
 * review all of them again. Here Paseo's hook is replaced where it already is, and appended only
 * when missing. Extra copies left by older versions are dropped. When the hook already matches, the
 * list serializes exactly as before, so the file is not rewritten.
 */
export function upsertMarkedHookGroup(input: UpsertMarkedHookGroupInput): unknown[] {
  const entries = Array.isArray(input.entries) ? input.entries : [];
  const placedAt = entries.findIndex((entry) => groupHasMarkedHook(entry, input.isMarked));
  if (placedAt === -1) {
    return [...entries, input.desired];
  }
  const result: unknown[] = [];
  entries.forEach((entry, index) => {
    if (index === placedAt) {
      result.push(placeDesiredHook(entry as HookMatcherGroup, input));
      return;
    }
    const cleaned = groupHasMarkedHook(entry, input.isMarked)
      ? withoutMarkedHooks(entry as HookMatcherGroup, input.isMarked)
      : entry;
    if (cleaned !== null) result.push(cleaned);
  });
  return result;
}

/**
 * A group that only holds Paseo hooks becomes the desired group. In a group shared with other
 * hooks, Paseo's first hook is replaced in place and any further Paseo hooks are removed.
 */
function placeDesiredHook(group: HookMatcherGroup, input: UpsertMarkedHookGroupInput): unknown {
  const hooks = commandHooks(group);
  if (hooks.every((hook) => !isRecord(hook) || input.isMarked(hook))) {
    return input.desired;
  }
  const [desiredHook] = input.desired.hooks;
  let replaced = false;
  const nextHooks: unknown[] = [];
  for (const hook of hooks) {
    if (!isRecord(hook) || !input.isMarked(hook)) {
      nextHooks.push(hook);
    } else if (!replaced) {
      nextHooks.push(desiredHook);
      replaced = true;
    }
  }
  return { ...group, hooks: nextHooks };
}

function withoutMarkedHooks(
  group: HookMatcherGroup,
  isMarked: (hook: Record<string, unknown>) => boolean,
): HookMatcherGroup | null {
  const hooks = commandHooks(group).filter((hook) => !isRecord(hook) || !isMarked(hook));
  return hooks.length > 0 ? { ...group, hooks } : null;
}

function groupHasMarkedHook(
  entry: unknown,
  isMarked: (hook: Record<string, unknown>) => boolean,
): boolean {
  return isRecord(entry) && commandHooks(entry).some((hook) => isRecord(hook) && isMarked(hook));
}

function commandHooks(group: HookMatcherGroup): unknown[] {
  return Array.isArray(group.hooks) ? group.hooks : [];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
