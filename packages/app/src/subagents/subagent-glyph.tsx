import { memo, type ReactElement } from "react";
import Svg, { Circle, Path, Rect } from "react-native-svg";
import { withUnistyles } from "react-native-unistyles";
import {
  resolveSubagentGlyph,
  SUBAGENT_GLYPH_PALETTES,
  type SubagentGlyphShape,
} from "./subagent-glyph-model";
import type { Theme } from "@/styles/theme";

const SHAPE_PATHS: Record<Exclude<SubagentGlyphShape, "circle" | "square">, string> = {
  diamond: "M12 2.5 21.5 12 12 21.5 2.5 12Z",
  triangle: "M12 3 21.5 19.5H2.5Z",
  hexagon: "M12 2.5 20.25 7.25V16.75L12 21.5 3.75 16.75V7.25Z",
  star: "M12 2.6 14.8 8.4 21.2 9.3 16.6 13.8 17.7 20.2 12 17.2 6.3 20.2 7.4 13.8 2.8 9.3 9.2 8.4Z",
  burst:
    "M12 2.5 13.9 7.4 18.7 5.3 16.6 10.1 21.5 12 16.6 13.9 18.7 18.7 13.9 16.6 12 21.5 10.1 16.6 5.3 18.7 7.4 13.9 2.5 12 7.4 10.1 5.3 5.3 10.1 7.4Z",
  pentagon: "M12 2.8 21 9.3 17.6 20H6.4L3 9.3Z",
};

function GlyphShape({ shape, color }: { shape: SubagentGlyphShape; color: string }) {
  if (shape === "circle") return <Circle cx={12} cy={12} r={9} fill={color} />;
  if (shape === "square")
    return <Rect x={3.5} y={3.5} width={17} height={17} rx={4} fill={color} />;
  return <Path d={SHAPE_PATHS[shape]} fill={color} />;
}

function GlyphSvg({
  seed,
  size,
  scheme,
}: {
  seed: string;
  size: number;
  scheme: "light" | "dark";
}): ReactElement {
  const spec = resolveSubagentGlyph(seed);
  const palette = SUBAGENT_GLYPH_PALETTES[scheme];
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" accessibilityElementsHidden>
      <GlyphShape shape={spec.shape} color={palette[spec.colorIndex]!} />
    </Svg>
  );
}

const ThemedGlyphSvg = withUnistyles(GlyphSvg);
const schemeMapping = (theme: Theme) => ({ scheme: theme.colorScheme });

/**
 * A subagent's identity glyph (see `subagent-glyph-model.ts`). The only colour in the subagent UI:
 * status still reads from text and the existing status marks.
 */
export const SubagentGlyph = memo(function SubagentGlyph({
  seed,
  size = 16,
}: {
  seed: string;
  size?: number;
}): ReactElement {
  return <ThemedGlyphSvg seed={seed} size={size} uniProps={schemeMapping} />;
});
