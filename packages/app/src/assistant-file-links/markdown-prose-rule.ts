import type MarkdownIt from "markdown-it";
import { scanTextForLocalPaths, type LocalPathTextMatch } from "./text-path-scan";

export interface AssistantProseLinkRuleOptions {
  workspaceRoot?: string;
}

// markdown-it's package.json only exports its root ("."), so "markdown-it/lib/token" and
// "markdown-it/lib/rules_core/state_core" can't be imported directly even though @types/
// markdown-it ships declarations for them. Derive the same (structural) types instead, through
// the one entry point that does resolve.
type MarkdownItCoreState = Parameters<InstanceType<typeof MarkdownIt>["core"]["process"]>[0];
type MarkdownItToken = MarkdownItCoreState["tokens"][number];

/**
 * Registers a markdown-it core rule, inserted right after "linkify", that turns path-shaped
 * substrings of plain text into link tokens — the markdown-prose counterpart to explicit
 * `[text](href)` links and inline-code paths. Call once per MarkdownIt instance (see
 * utils/markdown-parser.ts); `workspaceRoot` is read fresh on every parse via `getWorkspaceRoot`
 * so one shared parser instance still resolves relative paths against whichever chat is
 * currently rendering.
 */
export function registerAssistantProseLinkRule(
  markdownParser: MarkdownIt,
  getWorkspaceRoot: () => string | undefined,
): void {
  markdownParser.core.ruler.after("linkify", "assistant_file_link", (state) => {
    assistantProseLinkRule(state, { workspaceRoot: getWorkspaceRoot() });
  });
}

/**
 * The rule body, exported separately so tests can run it against a hand-built state without
 * going through a full MarkdownIt instance. Mirrors markdown-it's own linkify core rule
 * (markdown-it/lib/rules_core/linkify.js): scan each inline token's children in reverse so
 * inserting tokens doesn't shift indices still to be visited, skip content already inside a
 * link, and for a qualifying "text" token, splice in a text/link_open/text/link_close/text
 * sequence per match — marked `markup: "linkify"` / `info: "auto"`, the same shape linkify's own
 * matches carry, so assistant-file-links/resolver.ts's `isLinkifiedSource` treats them
 * identically and the existing "link" render rule (components/message.tsx) needs no changes.
 */
export function assistantProseLinkRule(
  state: MarkdownItCoreState,
  options: AssistantProseLinkRuleOptions,
): void {
  for (const blockToken of state.tokens) {
    if (blockToken.type !== "inline" || !blockToken.children) {
      continue;
    }

    let children = blockToken.children;
    let linkDepth = 0;
    for (let index = children.length - 1; index >= 0; index -= 1) {
      const currentToken = children[index];
      if (currentToken.type === "link_close") {
        linkDepth += 1;
        continue;
      }
      if (currentToken.type === "link_open") {
        linkDepth -= 1;
        continue;
      }
      if (linkDepth > 0 || currentToken.type !== "text") {
        continue;
      }

      const matches = scanTextForLocalPaths(currentToken.content, {
        workspaceRoot: options.workspaceRoot,
      });
      if (matches.length === 0) {
        continue;
      }

      const replacement = buildReplacementTokens(state, currentToken, matches);
      children = [...children.slice(0, index), ...replacement, ...children.slice(index + 1)];
    }
    blockToken.children = children;
  }
}

function buildReplacementTokens(
  state: MarkdownItCoreState,
  originalToken: MarkdownItToken,
  matches: LocalPathTextMatch[],
): MarkdownItToken[] {
  const content = originalToken.content;
  const level = originalToken.level;
  const nodes: MarkdownItToken[] = [];
  let position = 0;

  for (const match of matches) {
    if (match.start > position) {
      nodes.push(buildTextToken(state, content.slice(position, match.start), level));
    }
    nodes.push(buildLinkOpenToken(state, match.raw, level));
    nodes.push(buildTextToken(state, match.raw, level + 1));
    nodes.push(buildLinkCloseToken(state, level));
    position = match.end;
  }
  if (position < content.length) {
    nodes.push(buildTextToken(state, content.slice(position), level));
  }

  return nodes;
}

function buildTextToken(
  state: MarkdownItCoreState,
  content: string,
  level: number,
): MarkdownItToken {
  const token = new state.Token("text", "", 0);
  token.content = content;
  token.level = level;
  return token;
}

function buildLinkOpenToken(
  state: MarkdownItCoreState,
  href: string,
  level: number,
): MarkdownItToken {
  const token = new state.Token("link_open", "a", 1);
  token.attrSet("href", href);
  token.level = level;
  token.markup = "linkify";
  token.info = "auto";
  return token;
}

function buildLinkCloseToken(state: MarkdownItCoreState, level: number): MarkdownItToken {
  const token = new state.Token("link_close", "a", -1);
  token.level = level;
  token.markup = "linkify";
  token.info = "auto";
  return token;
}
