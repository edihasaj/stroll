import { describe, expect, it } from "vitest";
import { scanTextForLocalPaths, splitTextIntoPathSegments } from "./text-path-scan";

const WORKSPACE_ROOT = "/Users/test/project";

function paths(text: string, workspaceRoot = WORKSPACE_ROOT) {
  return scanTextForLocalPaths(text, { workspaceRoot }).map((match) => match.raw);
}

describe("scanTextForLocalPaths", () => {
  it("matches an absolute POSIX path with at least two segments", () => {
    expect(paths("see /Users/edi/x.ts for details")).toEqual(["/Users/edi/x.ts"]);
  });

  it("matches an absolute POSIX directory with a trailing slash", () => {
    expect(paths("saved under /tmp/shots/ already")).toEqual(["/tmp/shots/"]);
  });

  it("matches a home-relative path", () => {
    expect(paths("check ~/.paseo/plans/notes.md next")).toEqual(["~/.paseo/plans/notes.md"]);
  });

  it("matches a Windows path", () => {
    expect(paths("open C:\\repo\\src\\app.ts please")).toEqual(["C:\\repo\\src\\app.ts"]);
  });

  it("matches a file:// URL", () => {
    expect(paths("open file:///tmp/outside.txt now")).toEqual(["file:///tmp/outside.txt"]);
  });

  it("matches a relative path containing a slash and ending in an extension", () => {
    expect(paths("edit src/components/message.tsx now")).toEqual(["src/components/message.tsx"]);
  });

  it("keeps a :line[:col] suffix", () => {
    const matches = scanTextForLocalPaths("see src/app.ts:42:7 for the bug", {
      workspaceRoot: WORKSPACE_ROOT,
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.raw).toBe("src/app.ts:42:7");
    expect(matches[0]?.target.lineStart).toBe(42);
  });

  it("keeps a #L10-L20 suffix", () => {
    const matches = scanTextForLocalPaths("see /Users/edi/x.ts#L10-L20 for the bug", {
      workspaceRoot: WORKSPACE_ROOT,
    });
    expect(matches).toHaveLength(1);
    expect(matches[0]?.raw).toBe("/Users/edi/x.ts#L10-L20");
    expect(matches[0]?.target.lineStart).toBe(10);
    expect(matches[0]?.target.lineEnd).toBe(20);
  });

  it("strips trailing sentence punctuation", () => {
    expect(paths("see /Users/edi/x.ts, then /Users/edi/y.ts.")).toEqual([
      "/Users/edi/x.ts",
      "/Users/edi/y.ts",
    ]);
  });

  it("strips a trailing closing paren", () => {
    expect(paths("(see /Users/edi/x.ts)")).toEqual(["/Users/edi/x.ts"]);
  });

  it("finds multiple matches in the same text", () => {
    expect(paths("compare src/a.ts with src/b.ts")).toEqual(["src/a.ts", "src/b.ts"]);
  });

  it("rejects a single-segment absolute path", () => {
    expect(paths("cd /tmp and look around")).toEqual([]);
  });

  it("rejects URLs", () => {
    expect(paths("see https://example.com/a/b.ts for docs")).toEqual([]);
  });

  it("rejects and/or", () => {
    expect(paths("pass and/or fail")).toEqual([]);
  });

  it("rejects a date", () => {
    expect(paths("due 10/07/2026")).toEqual([]);
  });

  it("rejects a fraction", () => {
    expect(paths("about 1/2 of the work")).toEqual([]);
  });

  it("rejects a branch name", () => {
    expect(paths("on feat/agent-routes now")).toEqual([]);
  });

  it("rejects an owner/repo slug", () => {
    expect(paths("see owner/repo on GitHub")).toEqual([]);
  });

  it("rejects n/a", () => {
    expect(paths("status: n/a")).toEqual([]);
  });

  it("rejects a scheme-less URL", () => {
    expect(paths("clone github.com/owner/repo.git first")).toEqual([]);
  });

  it("keeps a dot-directory path", () => {
    expect(paths("see .github/workflows/ci.yml")).toEqual([".github/workflows/ci.yml"]);
  });

  it("returns nothing for plain text with no paths", () => {
    expect(paths("just an ordinary sentence")).toEqual([]);
  });
});

describe("splitTextIntoPathSegments", () => {
  it("returns a single text segment when there is no path", () => {
    expect(splitTextIntoPathSegments("just an ordinary sentence")).toEqual([
      { type: "text", text: "just an ordinary sentence" },
    ]);
  });

  it("splits text around a single path", () => {
    expect(
      splitTextIntoPathSegments("see src/app.ts for the bug", { workspaceRoot: WORKSPACE_ROOT }),
    ).toEqual([
      { type: "text", text: "see " },
      { type: "path", raw: "src/app.ts", start: 4 },
      { type: "text", text: " for the bug" },
    ]);
  });

  it("splits text around multiple paths", () => {
    expect(
      splitTextIntoPathSegments("src/a.ts and src/b.ts", { workspaceRoot: WORKSPACE_ROOT }),
    ).toEqual([
      { type: "path", raw: "src/a.ts", start: 0 },
      { type: "text", text: " and " },
      { type: "path", raw: "src/b.ts", start: 13 },
    ]);
  });

  it("returns only a path segment when the whole input is a path", () => {
    expect(splitTextIntoPathSegments("/Users/edi/x.ts")).toEqual([
      { type: "path", raw: "/Users/edi/x.ts", start: 0 },
    ]);
  });
});
