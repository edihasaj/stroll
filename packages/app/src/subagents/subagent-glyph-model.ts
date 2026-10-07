/**
 * Every subagent gets one small identity glyph, the same wherever it appears (Codex derives its
 * subagent avatars the same way, from the conversation id). The glyph is a filled shape in one of
 * a few muted colours, chosen from a stable seed so a reload or another client shows the same one.
 */
export const SUBAGENT_GLYPH_SHAPES = [
  "circle",
  "diamond",
  "square",
  "triangle",
  "hexagon",
  "star",
  "burst",
  "pentagon",
] as const;
export type SubagentGlyphShape = (typeof SUBAGENT_GLYPH_SHAPES)[number];

export const SUBAGENT_GLYPH_PALETTES = {
  light: ["#7C5CD6", "#3B82C4", "#2F9E6E", "#D9822B", "#C2508A", "#2A9BA6"],
  dark: ["#A48BF0", "#6AA9E6", "#5BC496", "#F0A45C", "#E07BB0", "#5CC3CC"],
} as const;

export interface SubagentGlyphSpec {
  shape: SubagentGlyphShape;
  colorIndex: number;
}

/** 32-bit FNV-1a; small, stable across platforms, and good enough to spread short ids. */
function hashSeed(seed: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < seed.length; index += 1) {
    hash ^= seed.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function resolveSubagentGlyph(seed: string): SubagentGlyphSpec {
  const hash = hashSeed(seed);
  return {
    shape: SUBAGENT_GLYPH_SHAPES[hash % SUBAGENT_GLYPH_SHAPES.length]!,
    colorIndex: (hash >>> 8) % SUBAGENT_GLYPH_PALETTES.light.length,
  };
}

/** The seed for a managed subagent (its agent id) or a provider-native one (parent and child). */
export function subagentGlyphSeed(
  row: { kind: "paseo"; id: string } | { kind: "provider"; id: string; parentAgentId: string },
): string {
  return row.kind === "paseo" ? row.id : `${row.parentAgentId}:${row.id}`;
}
