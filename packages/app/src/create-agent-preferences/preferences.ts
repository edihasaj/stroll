import { z } from "zod";
import type { AgentProvider } from "@getpaseo/protocol/agent-types";

const featureValuesSchema = z.record(z.string(), z.union([z.boolean(), z.string(), z.null()]));

export interface ProviderPreferences {
  model?: string;
  mode?: string;
  thinkingByModel?: Record<string, string>;
  featureValues?: Record<string, unknown>;
}

export type LaunchTarget = { kind: "chat" } | { kind: "terminal"; profileId: string };

/**
 * The most recently applied agent profile, remembered so the next draft starts
 * on it without a selection. `accountProfileId` mirrors the profile's own field
 * at apply time; re-applying reads the host's current profile by `id`, so this
 * is informational rather than the source of truth for the account.
 */
export interface LastAgentProfile {
  id: string;
  accountProfileId?: string | null;
}

export interface FormPreferences {
  provider?: string;
  providerPreferences?: Record<string, ProviderPreferences>;
  favoriteModels?: Array<{ provider: string; modelId: string }>;
  isolation?: "local" | "worktree";
  launchTarget?: LaunchTarget;
  lastAgentProfile?: LastAgentProfile;
}

const providerPreferencesSchema: z.ZodType<ProviderPreferences> = z.strictObject({
  model: z.string().optional(),
  mode: z.string().optional(),
  thinkingByModel: z.record(z.string(), z.string()).optional(),
  featureValues: featureValuesSchema.optional(),
});

const launchTargetSchema: z.ZodType<LaunchTarget> = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("chat") }),
  z.strictObject({ kind: z.literal("terminal"), profileId: z.string() }),
]);

const lastAgentProfileSchema: z.ZodType<LastAgentProfile> = z.strictObject({
  id: z.string(),
  accountProfileId: z.string().nullable().optional(),
});

export const FormPreferencesSchema = z.strictObject({
  provider: z.string().optional(),
  providerPreferences: z.record(z.string(), providerPreferencesSchema).optional(),
  // COMPAT(agentProfileFavoriteMigration): favourites were removed in v0.3.2.
  // Keep the legacy payload alive until every capable host has had a chance to
  // import it; ordinary preference writes must not erase it first.
  favoriteModels: z
    .array(
      z.strictObject({
        provider: z.string(),
        modelId: z.string(),
      }),
    )
    .optional(),
  isolation: z.enum(["local", "worktree"]).optional(),
  // What the New workspace composer submits to: the chat agent (default) or a
  // terminal profile. See `@/new-workspace-launch` for resolution/fallback.
  launchTarget: launchTargetSchema.optional(),
  lastAgentProfile: lastAgentProfileSchema.optional(),
}) satisfies z.ZodType<FormPreferences>;

const LegacyProviderPreferencesSchema = z.strictObject({
  model: z.string().optional(),
  mode: z.string().optional(),
  thinkingOptionId: z.string().optional(),
});

const LegacyFormPreferencesSchema = z
  .strictObject({
    workingDir: z.string().optional(),
    provider: z.string().optional(),
    serverId: z.string().optional(),
    providerPreferences: z.record(z.string(), LegacyProviderPreferencesSchema).optional(),
  })
  .transform(({ provider, providerPreferences }): FormPreferences => {
    const migratedProviderPreferences: Record<string, ProviderPreferences> = {};
    for (const [providerId, legacy] of Object.entries(providerPreferences ?? {})) {
      const model = legacy.model;
      migratedProviderPreferences[providerId] = {
        ...(model !== undefined ? { model } : {}),
        ...(legacy.mode !== undefined ? { mode: legacy.mode } : {}),
        ...(model !== undefined && legacy.thinkingOptionId !== undefined
          ? { thinkingByModel: { [model]: legacy.thinkingOptionId } }
          : {}),
      };
    }
    return {
      ...(provider !== undefined ? { provider } : {}),
      ...(providerPreferences !== undefined
        ? { providerPreferences: migratedProviderPreferences }
        : {}),
    };
  });

export const StoredFormPreferencesSchema: z.ZodType<FormPreferences> = z.union([
  FormPreferencesSchema,
  LegacyFormPreferencesSchema,
]);

export const DEFAULT_FORM_PREFERENCES: FormPreferences = {};

export function parseFormPreferences(value: unknown): FormPreferences {
  const result = StoredFormPreferencesSchema.safeParse(value);
  return result.success ? result.data : DEFAULT_FORM_PREFERENCES;
}

function mergeDefinedRecord<T>(
  existing: Record<string, T> | undefined,
  updates: Record<string, T> | undefined,
): Record<string, T> | undefined {
  if (updates === undefined) {
    return existing;
  }
  return {
    ...existing,
    ...updates,
  };
}

function applyProviderPreferenceUpdates(
  existing: ProviderPreferences,
  updates: Omit<Partial<ProviderPreferences>, "mode"> & { mode?: string | null },
): ProviderPreferences {
  const next: ProviderPreferences = { ...existing };
  const nextThinkingByModel = mergeDefinedRecord(existing.thinkingByModel, updates.thinkingByModel);
  const nextFeatureValues = mergeDefinedRecord(existing.featureValues, updates.featureValues);

  if (updates.model !== undefined) {
    next.model = updates.model;
  }
  if (updates.mode === null) {
    delete next.mode;
  } else if (updates.mode !== undefined) {
    next.mode = updates.mode;
  }
  if (nextThinkingByModel !== undefined) {
    next.thinkingByModel = nextThinkingByModel;
  }
  if (nextFeatureValues !== undefined) {
    next.featureValues = nextFeatureValues;
  }

  return next;
}

export function mergeProviderPreferences(args: {
  preferences: FormPreferences;
  provider: AgentProvider;
  updates: Omit<Partial<ProviderPreferences>, "mode"> & { mode?: string | null };
}): FormPreferences {
  const { preferences, provider, updates } = args;
  const existingProviderPreferences = preferences.providerPreferences ?? {};
  const existing = existingProviderPreferences[provider] ?? {};

  return {
    ...preferences,
    provider,
    providerPreferences: {
      ...existingProviderPreferences,
      [provider]: applyProviderPreferenceUpdates(existing, updates),
    },
  };
}

export function mergeCreateAgentSelectionPreferences(args: {
  preferences: FormPreferences;
  provider: AgentProvider | null;
  modelId?: string | null;
  modeId?: string | null;
  thinkingOptionId?: string | null;
  featureValues?: Record<string, unknown>;
}): FormPreferences {
  if (!args.provider) {
    return args.preferences;
  }

  const modelId = args.modelId?.trim() ?? "";
  const modeId = args.modeId?.trim() ?? "";
  const thinkingOptionId = args.thinkingOptionId?.trim() ?? "";
  const featureValues = featureValuesSchema.safeParse(args.featureValues);

  return mergeProviderPreferences({
    preferences: args.preferences,
    provider: args.provider,
    updates: {
      model: modelId || undefined,
      mode: args.modeId === undefined ? undefined : modeId || null,
      ...(modelId && thinkingOptionId ? { thinkingByModel: { [modelId]: thinkingOptionId } } : {}),
      ...(featureValues.success ? { featureValues: featureValues.data } : {}),
    },
  });
}

export function applyAgentProfilePreferences(args: {
  preferences: FormPreferences;
  previousProvider: AgentProvider | null;
  previousProviderModeIds: readonly string[];
  provider: AgentProvider;
  modelId: string;
  modeId: string;
  thinkingOptionId: string;
  featureValues: Record<string, unknown>;
  profileId: string;
  accountProfileId: string | null | undefined;
}): FormPreferences {
  let next = args.preferences;
  if (args.previousProvider) {
    const previousMode = next.providerPreferences?.[args.previousProvider]?.mode;
    if (previousMode && !args.previousProviderModeIds.includes(previousMode)) {
      next = mergeProviderPreferences({
        preferences: next,
        provider: args.previousProvider,
        updates: { mode: null },
      });
    }
  }

  const withProviderUpdates = mergeProviderPreferences({
    preferences: next,
    provider: args.provider,
    updates: {
      model: args.modelId || undefined,
      mode: args.modeId || null,
      ...(args.modelId && args.thinkingOptionId
        ? { thinkingByModel: { [args.modelId]: args.thinkingOptionId } }
        : {}),
      featureValues: args.featureValues,
    },
  });

  return {
    ...withProviderUpdates,
    lastAgentProfile: { id: args.profileId, accountProfileId: args.accountProfileId ?? null },
  };
}

/**
 * The user picking a provider or model by hand means the draft's selection no
 * longer is the remembered profile — drop the marker so the next new draft
 * falls back to the host default profile or plain preferences instead.
 */
export function clearLastAgentProfile(preferences: FormPreferences): FormPreferences {
  if (!preferences.lastAgentProfile) {
    return preferences;
  }
  const next = { ...preferences };
  delete next.lastAgentProfile;
  return next;
}
