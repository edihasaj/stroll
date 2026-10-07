import { describe, expect, it } from "vitest";
import { createMarkdownParser } from "@/utils/markdown-parser";
import { registerAssistantProseLinkRule } from "./markdown-prose-rule";

function createParser(workspaceRoot: string | undefined = "/Users/test/project") {
  // This core rule builds link tokens directly (token.attrSet) rather than going through
  // markdown-it's "link" inline rule or "linkify", so it never calls validateLink/normalizeLink
  // — createAssistantMarkdownParser's relaxed validateLink is for those other rules, not this one.
  const parser = createMarkdownParser({ linkify: true });
  registerAssistantProseLinkRule(parser, () => workspaceRoot);
  return parser;
}

describe("assistant prose link rule", () => {
  it("turns a path-shaped mention into a link", () => {
    const html = createParser().renderInline("see src/components/message.tsx for details");
    expect(html).toContain('<a href="src/components/message.tsx">');
    expect(html).toContain("src/components/message.tsx</a>");
  });

  it("turns an absolute path with a line suffix into a link", () => {
    const html = createParser().renderInline("see /Users/edi/x.ts:42 for the bug");
    expect(html).toContain('<a href="/Users/edi/x.ts:42">');
  });

  it("links more than one mention in the same line", () => {
    const html = createParser().renderInline("compare src/a.ts with src/b.ts");
    expect(html).toContain('<a href="src/a.ts">');
    expect(html).toContain('<a href="src/b.ts">');
  });

  it("does not double-link an explicit markdown link", () => {
    const html = createParser().renderInline("[see this](src/components/message.tsx)");
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('<a href="src/components/message.tsx">see this</a>');
  });

  it("does not link inside a code span", () => {
    const html = createParser().renderInline("run `src/components/message.tsx` now");
    expect(html).not.toContain("<a ");
    expect(html).toContain("<code>src/components/message.tsx</code>");
  });

  it("does not link inside a fenced code block", () => {
    const html = createParser().render("```\nsrc/components/message.tsx\n```");
    expect(html).not.toContain("<a ");
  });

  it("leaves a bare URL to markdown-it's own linkify, unchanged", () => {
    const html = createParser().renderInline("visit https://example.com/a/b.ts now");
    expect(html.match(/<a /g)).toHaveLength(1);
    expect(html).toContain('href="https://example.com/a/b.ts"');
  });

  it("rejects a branch name and an owner/repo slug", () => {
    const html = createParser().renderInline("on feat/agent-routes, see owner/repo");
    expect(html).not.toContain("<a ");
  });

  it("rejects a date and a fraction", () => {
    const html = createParser().renderInline("due 10/07/2026, about 1/2 done, status n/a");
    expect(html).not.toContain("<a ");
  });

  it("leaves plain prose with no paths untouched", () => {
    const html = createParser().renderInline("just an ordinary sentence");
    expect(html).not.toContain("<a ");
  });
});
