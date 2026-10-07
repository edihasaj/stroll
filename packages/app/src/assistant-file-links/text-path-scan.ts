import { isAbsolutePath } from "@/utils/path";
import { classifyAssistantFileLink } from "./parse";
import type { InlinePathTarget } from "./parse";

export interface LocalPathTextMatch {
  start: number;
  end: number;
  /** The matched substring, trailing punctuation already stripped — use this as link text/href. */
  raw: string;
  target: InlinePathTarget;
}

// A run of path-safe characters containing at least one slash/backslash — the one shape every
// local path has in common (absolute, ~/, Windows, file://, or a bare relative path). Quotes,
// brackets, and angle brackets are excluded so the match never swallows surrounding markdown or
// sentence punctuation; a trailing "#L10-L20" is appended separately below since "#" isn't a
// path character anywhere else.
const PATH_CANDIDATE_PATTERN = /[A-Za-z0-9._~/\\:+%@-]*[/\\][A-Za-z0-9._~/\\:+%@-]*/g;
const HASH_LINE_SUFFIX_PATTERN = /^#L[0-9]+(?:-L?[0-9]+)?/i;
const TRAILING_PUNCTUATION_PATTERN = /[.,;:!?'")\]}>]+$/;
const DOMAIN_LIKE_SEGMENT_PATTERN = /^[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}$/;

/**
 * Finds path-shaped substrings of `text` — the detection shared by the plain-prose markdown-it
 * rule (markdown-prose-rule.ts) and the user-message splitter (components/message.tsx). Pure and
 * synchronous: callers decide what to do with each match (render a link, open it, etc).
 *
 * Accepts: absolute POSIX paths with at least two segments, `~/…`, Windows `C:\…`, `file://…`,
 * and relative paths that contain "/" and end in a file name with a dot-extension — each
 * optionally followed by `:line[:col]` or `#L10-L20`. Rejects URLs (linkify/the caller's own
 * link detection owns those), and bare relative tokens with neither a slash+extension nor an
 * absolute/~//file:// marker — so branch names (`feat/agent-routes`), `owner/repo`, dates
 * (`10/07/2026`), fractions (`1/2`), and `n/a` never match.
 */
export function scanTextForLocalPaths(
  text: string,
  options: { workspaceRoot?: string } = {},
): LocalPathTextMatch[] {
  const matches: LocalPathTextMatch[] = [];
  const candidatePattern = new RegExp(PATH_CANDIDATE_PATTERN);
  let candidate: RegExpExecArray | null;
  while ((candidate = candidatePattern.exec(text))) {
    const start = candidate.index;
    let raw = candidate[0];
    let end = start + raw.length;
    const hashSuffix = HASH_LINE_SUFFIX_PATTERN.exec(text.slice(end));
    if (hashSuffix) {
      raw += hashSuffix[0];
      end += hashSuffix[0].length;
    }
    const trailingPunctuation = TRAILING_PUNCTUATION_PATTERN.exec(raw);
    if (trailingPunctuation) {
      raw = raw.slice(0, raw.length - trailingPunctuation[0].length);
      end -= trailingPunctuation[0].length;
    }
    if (!raw) {
      continue;
    }
    const target = classifyProseCandidate(raw, options.workspaceRoot);
    if (target) {
      matches.push({ start, end, raw, target });
    }
  }
  return matches;
}

function classifyProseCandidate(
  candidate: string,
  workspaceRoot: string | undefined,
): InlinePathTarget | null {
  if (candidate.startsWith("/")) {
    // Spec: absolute POSIX paths need at least two segments ("/tmp" alone doesn't count).
    if (candidate.split("/").filter(Boolean).length < 2) {
      return null;
    }
  } else if (!isPresumedLocalPathPrefix(candidate)) {
    // Bare relative, no recognized marker: require both a slash and a dot-extension on the last
    // segment — stricter than an explicit markdown link href, since nothing here was authored
    // as a link.
    if (!candidate.includes("/")) {
      return null;
    }
    const lastSegment = candidate.split("/").findLast((segment) => segment.length > 0);
    if (!lastSegment) {
      return null;
    }
    const lastDot = lastSegment.lastIndexOf(".");
    if (lastDot < 0 || lastDot === lastSegment.length - 1) {
      return null;
    }
    // A scheme-less URL ("github.com/owner/repo.git") has the same shape; a host first segment
    // marks it as one, the rule inline code already applies.
    const firstSegment = candidate.split("/")[0] ?? "";
    if (DOMAIN_LIKE_SEGMENT_PATTERN.test(firstSegment)) {
      return null;
    }
  }

  const classification = classifyAssistantFileLink(candidate, {
    workspaceRoot,
    allowAnyExtension: true,
  });
  if (!classification || classification.kind === "external") {
    return null;
  }
  return classification.target;
}

export type TextPathSegment =
  | { type: "text"; text: string }
  | { type: "path"; raw: string; start: number };

/**
 * Splits `text` into alternating plain-text and path segments — the user-message counterpart to
 * the markdown-prose core rule, for text that never goes through markdown-it at all (see
 * components/message.tsx's UserMessage). A path segment carries only the matched string; the
 * component that renders it re-resolves via `useFileLink` so opening it reuses the same path as
 * every other link instead of a second one.
 */
export function splitTextIntoPathSegments(
  text: string,
  options: { workspaceRoot?: string } = {},
): TextPathSegment[] {
  const matches = scanTextForLocalPaths(text, options);
  if (matches.length === 0) {
    return [{ type: "text", text }];
  }

  const segments: TextPathSegment[] = [];
  let position = 0;
  for (const match of matches) {
    if (match.start > position) {
      segments.push({ type: "text", text: text.slice(position, match.start) });
    }
    segments.push({ type: "path", raw: match.raw, start: match.start });
    position = match.end;
  }
  if (position < text.length) {
    segments.push({ type: "text", text: text.slice(position) });
  }
  return segments;
}

function isPresumedLocalPathPrefix(candidate: string): boolean {
  return (
    isAbsolutePath(candidate) ||
    candidate === "~" ||
    candidate.startsWith("~/") ||
    candidate.toLowerCase().startsWith("file://")
  );
}
