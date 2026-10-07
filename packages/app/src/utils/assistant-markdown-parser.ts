import type MarkdownIt from "markdown-it";
import { createMarkdownParser } from "@/utils/markdown-parser";
import { enableStreamingMarkdown } from "@/utils/streaming-markdown";
import { registerAssistantProseLinkRule } from "@/assistant-file-links/markdown-prose-rule";

function defaultGetWorkspaceRoot(): string | undefined {
  return undefined;
}

export function createAssistantMarkdownParser({
  streaming = false,
  getWorkspaceRoot = defaultGetWorkspaceRoot,
}: {
  streaming?: boolean;
  /** Read on every parse, not just now — see components/message.tsx's AssistantMessage. */
  getWorkspaceRoot?: () => string | undefined;
} = {}): MarkdownIt {
  const parser = createMarkdownParser({ linkify: true });
  const defaultValidateLink = parser.validateLink.bind(parser);

  // Assistant messages are the only surface allowed to link into the
  // filesystem. Every other parser keeps markdown-it's stricter default.
  parser.validateLink = (url: string) =>
    url.trim().toLowerCase().startsWith("file://") || defaultValidateLink(url);

  // Same reasoning: plain-prose path mentions ("see src/app.ts") are only ever turned into links
  // for assistant messages.
  registerAssistantProseLinkRule(parser, getWorkspaceRoot);

  if (streaming) {
    enableStreamingMarkdown(parser);
  }

  return parser;
}
