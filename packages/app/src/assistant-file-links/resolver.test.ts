import { describe, expect, it } from "vitest";
import {
  classifyForResolution,
  fetchDaemonResolution,
  getAssistantFileLinkToken,
  UnresolvedFileLinkError,
  type AssistantFileLinkContext,
  type DirectorySuggestionEntry,
  type DirectorySuggestionResult,
  type GetDirectorySuggestions,
} from "./resolver";

const CONTEXT: AssistantFileLinkContext = {
  workspaceRoot: "/Users/test/project",
};

function resolvedSuggestions(
  entries: DirectorySuggestionResult["entries"],
): DirectorySuggestionResult {
  return { entries, error: null };
}

function suggestionsFromMap(entriesByQuery: Record<string, DirectorySuggestionEntry[]>): {
  getDirectorySuggestions: GetDirectorySuggestions;
  searches: Array<{
    query: string;
    cwd: string;
    matchMode: "suffix";
    limit: number;
  }>;
} {
  const searches: Array<{
    query: string;
    cwd: string;
    matchMode: "suffix";
    limit: number;
  }> = [];
  const getDirectorySuggestions: GetDirectorySuggestions = async (input) => {
    searches.push({
      query: input.query,
      cwd: input.cwd,
      matchMode: input.matchMode,
      limit: input.limit,
    });
    return resolvedSuggestions(entriesByQuery[input.query] ?? []);
  };
  return { getDirectorySuggestions, searches };
}

const unavailableSuggestions: GetDirectorySuggestions = async () => {
  throw new Error("daemon unavailable");
};

describe("classifyForResolution", () => {
  it("resolves a relative folder in inline code without a file lookup", () => {
    const result = classifyForResolution(
      { href: "notes/", text: "notes/", sourceType: "inline-code" },
      CONTEXT,
    );

    expect(result).toMatchObject({
      kind: "resolved",
      value: {
        kind: "file",
        target: { path: "/Users/test/project/notes", kind: "directory" },
      },
    });
  });

  it("returns the directFile target synchronously", () => {
    const result = classifyForResolution({ href: "src/components/message.tsx#L33" }, CONTEXT);

    expect(result).toEqual({
      kind: "resolved",
      value: {
        kind: "file",
        target: {
          raw: "src/components/message.tsx#L33",
          path: "/Users/test/project/src/components/message.tsx",
          lineStart: 33,
          lineEnd: undefined,
          kind: "file",
        },
      },
    });
  });

  it("preserves line ranges on direct workspace files", () => {
    const result = classifyForResolution({ href: "src/components/message.tsx:33-40" }, CONTEXT);

    expect(result).toEqual({
      kind: "resolved",
      value: {
        kind: "file",
        target: {
          raw: "src/components/message.tsx:33-40",
          path: "/Users/test/project/src/components/message.tsx",
          lineStart: 33,
          lineEnd: 40,
          kind: "file",
        },
      },
    });
  });

  it("flags basename inline-code as a daemon lookup keyed by suggestion query", () => {
    const result = classifyForResolution(
      { href: "file.ts:12", text: "file.ts:12", sourceType: "inline-code" },
      CONTEXT,
    );

    expect(result).toEqual({
      kind: "needsLookup",
      ambiguousQuery: "file.ts",
      token: "file.ts:12",
      target: {
        raw: "file.ts:12",
        path: "/Users/test/project/file.ts",
        lineStart: 12,
        lineEnd: undefined,
        kind: "file",
      },
    });
  });

  it("keeps explicit external URLs external", () => {
    const result = classifyForResolution({ href: "http://dumm.md", text: "dumm.md" }, CONTEXT);

    expect(result).toEqual({
      kind: "resolved",
      value: { kind: "external", url: "http://dumm.md" },
    });
  });

  it("keeps absolute paths outside the workspace as direct file targets", () => {
    const result = classifyForResolution({ href: "/tmp/outside.txt" }, CONTEXT);

    expect(result).toEqual({
      kind: "resolved",
      value: {
        kind: "file",
        target: {
          raw: "/tmp/outside.txt",
          path: "/tmp/outside.txt",
          lineStart: undefined,
          lineEnd: undefined,
          kind: "file",
        },
      },
    });
  });

  it("keeps tilde paths as direct file targets", () => {
    const result = classifyForResolution({ href: "~/.paseo/plans/file-preview.md" }, CONTEXT);

    expect(result).toEqual({
      kind: "resolved",
      value: {
        kind: "file",
        target: {
          raw: "~/.paseo/plans/file-preview.md",
          path: "~/.paseo/plans/file-preview.md",
          lineStart: undefined,
          lineEnd: undefined,
          kind: "file",
        },
      },
    });
  });

  it("keeps auto-linkified normal domains external", () => {
    const result = classifyForResolution(
      { href: "http://google.com", text: "google.com", markup: "linkify" },
      CONTEXT,
    );

    expect(result).toEqual({
      kind: "resolved",
      value: { kind: "external", url: "http://google.com" },
    });
  });

  it("returns ignored for non-file-looking content", () => {
    const result = classifyForResolution({ href: "" }, CONTEXT);

    expect(result).toEqual({ kind: "resolved", value: { kind: "ignored" } });
  });

  it("opens an explicit link href with an unrecognized extension", () => {
    const result = classifyForResolution({ href: "assets/shot.png" }, CONTEXT);

    expect(result).toEqual({
      kind: "resolved",
      value: {
        kind: "file",
        target: {
          raw: "assets/shot.png",
          path: "/Users/test/project/assets/shot.png",
          lineStart: undefined,
          lineEnd: undefined,
          kind: "file",
        },
      },
    });
  });

  it("ignores the same bare relative token as inline code when it has no recognized extension", () => {
    const result = classifyForResolution(
      { href: "notes.xyz", text: "notes.xyz", sourceType: "inline-code" },
      CONTEXT,
    );

    expect(result).toEqual({ kind: "resolved", value: { kind: "ignored" } });
  });

  it("marks a trailing-slash href as a directory target", () => {
    const result = classifyForResolution({ href: "/tmp/shots/" }, CONTEXT);

    expect(result).toEqual({
      kind: "resolved",
      value: {
        kind: "file",
        target: {
          raw: "/tmp/shots/",
          path: "/tmp/shots/",
          lineStart: undefined,
          lineEnd: undefined,
          kind: "directory",
        },
      },
    });
  });
});

describe("fetchDaemonResolution", () => {
  it("resolves daemon suggestions into workspace file targets", async () => {
    const { getDirectorySuggestions, searches } = suggestionsFromMap({
      "file.ts": [{ path: "packages/app/src/file.ts", kind: "file" }],
    });

    const result = await fetchDaemonResolution({
      ambiguousQuery: "file.ts",
      token: "file.ts:12",
      target: {
        raw: "file.ts:12",
        path: "/Users/test/project/file.ts",
        lineStart: 12,
        lineEnd: undefined,
      },
      workspaceRoot: "/Users/test/project",
      getDirectorySuggestions,
    });

    expect(searches).toEqual([
      {
        query: "file.ts",
        cwd: "/Users/test/project",
        matchMode: "suffix",
        limit: 1,
      },
    ]);
    expect(result).toEqual({
      raw: "file.ts:12",
      path: "/Users/test/project/packages/app/src/file.ts",
      lineStart: 12,
      lineEnd: undefined,
    });
  });

  it("throws a typed unresolved error when the daemon finds no match", async () => {
    const { getDirectorySuggestions } = suggestionsFromMap({});

    await expect(
      fetchDaemonResolution({
        ambiguousQuery: "src/file.ts",
        token: "src/file.ts",
        target: {
          raw: "src/file.ts",
          path: "/Users/test/project/src/file.ts",
          lineStart: undefined,
          lineEnd: undefined,
        },
        workspaceRoot: "/Users/test/project",
        getDirectorySuggestions,
      }),
    ).rejects.toEqual(new UnresolvedFileLinkError("src/file.ts"));
  });

  it("throws a typed unresolved error when the daemon throws", async () => {
    await expect(
      fetchDaemonResolution({
        ambiguousQuery: "dumm.md",
        token: "dumm.md",
        target: {
          raw: "dumm.md",
          path: "/Users/test/project/dumm.md",
          lineStart: undefined,
          lineEnd: undefined,
        },
        workspaceRoot: "/Users/test/project",
        getDirectorySuggestions: unavailableSuggestions,
      }),
    ).rejects.toEqual(new UnresolvedFileLinkError("dumm.md"));
  });
});

describe("getAssistantFileLinkToken", () => {
  it("uses rendered text for markdown-it linkified tokens and href for explicit links", () => {
    expect(
      getAssistantFileLinkToken({
        href: "http://dumm.md",
        text: "dumm.md",
        markup: "linkify",
        sourceInfo: "auto",
      }),
    ).toBe("dumm.md");
    expect(
      getAssistantFileLinkToken({
        href: "http://google.com",
        text: "google.com",
        markup: "linkify",
        sourceInfo: "auto",
      }),
    ).toBe("http://google.com");
    expect(
      getAssistantFileLinkToken({
        href: "http://dumm.md",
        text: "dumm.md",
        markup: "",
        sourceInfo: "",
      }),
    ).toBe("http://dumm.md");
    expect(
      getAssistantFileLinkToken({
        href: "workspace-git-service.ts:1553",
        text: "workspace-git-service.ts:1553",
        sourceType: "inline-code",
      }),
    ).toBe("workspace-git-service.ts:1553");
  });
});
