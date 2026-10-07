import { describe, expect, it } from "vitest";
import {
  resolveSubagentGlyph,
  SUBAGENT_GLYPH_PALETTES,
  SUBAGENT_GLYPH_SHAPES,
  subagentGlyphSeed,
} from "./subagent-glyph-model";

describe("resolveSubagentGlyph", () => {
  it("gives the same seed the same glyph every time", () => {
    expect(resolveSubagentGlyph("agent-123")).toEqual(resolveSubagentGlyph("agent-123"));
  });

  it("spreads a fan-out of ids across shapes and colours", () => {
    const specs = Array.from({ length: 24 }, (_, index) =>
      resolveSubagentGlyph(`3f2a9c1e-${index}-worker`),
    );

    expect(new Set(specs.map((spec) => spec.shape)).size).toBeGreaterThanOrEqual(5);
    expect(new Set(specs.map((spec) => spec.colorIndex)).size).toBeGreaterThanOrEqual(4);
    for (const spec of specs) {
      expect(SUBAGENT_GLYPH_SHAPES).toContain(spec.shape);
      expect(spec.colorIndex).toBeLessThan(SUBAGENT_GLYPH_PALETTES.dark.length);
    }
  });
});

describe("subagentGlyphSeed", () => {
  it("seeds managed subagents by agent id and native ones by parent and child", () => {
    expect(subagentGlyphSeed({ kind: "paseo", id: "a1" })).toBe("a1");
    expect(subagentGlyphSeed({ kind: "provider", id: "c1", parentAgentId: "p1" })).toBe("p1:c1");
  });
});
