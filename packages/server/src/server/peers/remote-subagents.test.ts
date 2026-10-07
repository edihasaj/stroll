import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveRemoteSubagentCwd } from "./remote-subagents.js";

describe("resolveRemoteSubagentCwd", () => {
  it("uses the caller's cwd when no explicit cwd is requested", () => {
    expect(
      resolveRemoteSubagentCwd({ callerCwd: "/Users/edi/Projects/x", requestedCwd: undefined }),
    ).toBe("/Users/edi/Projects/x");
  });

  it("joins a relative requested cwd onto the caller's cwd", () => {
    expect(
      resolveRemoteSubagentCwd({
        callerCwd: "/Users/edi/Projects/x",
        requestedCwd: "packages/app",
      }),
    ).toBe(path.resolve("/Users/edi/Projects/x", "packages/app"));
  });

  it("uses an absolute requested cwd as-is even with a caller cwd", () => {
    expect(
      resolveRemoteSubagentCwd({
        callerCwd: "/Users/edi/Projects/x",
        requestedCwd: "/Users/edi/Projects/y",
      }),
    ).toBe(path.resolve("/Users/edi/Projects/y"));
  });

  it("expands a home-relative requested cwd when there is no caller", () => {
    expect(resolveRemoteSubagentCwd({ callerCwd: undefined, requestedCwd: "~/Projects/x" })).toBe(
      path.resolve(os.homedir(), "Projects/x"),
    );
  });

  it("throws a clear error when there is no caller and no explicit cwd", () => {
    expect(() =>
      resolveRemoteSubagentCwd({ callerCwd: undefined, requestedCwd: undefined }),
    ).toThrow(/cwd is required/);
  });
});
