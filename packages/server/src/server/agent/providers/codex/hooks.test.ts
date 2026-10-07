import { describe, expect, it } from "vitest";
import { buildHookTrustWrite, describeHookRunNotice, parseCodexHooksList } from "./hooks.js";

const KEY = "/Users/edi/.codex/hooks.json:stop:3:0";

describe("parseCodexHooksList", () => {
  it("maps hooks/list entries to review summaries and keeps their current hashes", () => {
    const result = parseCodexHooksList({
      data: [
        {
          cwd: "/repo",
          errors: [],
          warnings: [],
          hooks: [
            {
              key: KEY,
              eventName: "stop",
              source: "user",
              sourcePath: "/Users/edi/.codex/hooks.json",
              currentHash: "sha256:abc",
              trustStatus: "modified",
              enabled: true,
              handlerType: "command",
              command: "python3 hook.py",
              displayOrder: 3,
              isManaged: false,
              timeoutSec: 10,
            },
            { key: "broken" },
          ],
        },
      ],
    });

    expect(result.hooks).toEqual([
      {
        key: KEY,
        event: "stop",
        source: "user",
        sourcePath: "/Users/edi/.codex/hooks.json",
        command: "python3 hook.py",
        matcher: null,
        trustStatus: "modified",
        enabled: true,
      },
    ]);
    expect(result.hashByKey.get(KEY)).toBe("sha256:abc");
  });
});

describe("buildHookTrustWrite", () => {
  it("trusts each key at its current hash under hooks.state", () => {
    expect(buildHookTrustWrite([KEY], new Map([[KEY, "sha256:abc"]]))).toEqual({
      [KEY]: { trusted_hash: "sha256:abc" },
    });
  });

  it("refuses a key that is no longer configured", () => {
    expect(() => buildHookTrustWrite(["gone"], new Map())).toThrow(/no longer configured/);
  });
});

describe("describeHookRunNotice", () => {
  it("says nothing for a quiet successful run", () => {
    expect(
      describeHookRunNotice({
        run: { eventName: "stop", status: "completed", sourcePath: "/x/hooks.json", entries: [] },
      }),
    ).toBeNull();
  });

  it("reports a failed run with its first error line", () => {
    expect(
      describeHookRunNotice({
        run: {
          eventName: "stop",
          status: "failed",
          sourcePath: "/Users/edi/.codex/hooks.json",
          entries: [{ kind: "error", text: "boom\nstack" }],
        },
      }),
    ).toEqual({ level: "error", message: "Hook stop (hooks.json) failed: boom" });
  });

  it("reports a completed run that left a warning", () => {
    expect(
      describeHookRunNotice({
        run: {
          eventName: "preToolUse",
          status: "completed",
          sourcePath: "/repo/.codex/hooks.json",
          entries: [{ kind: "warning", text: "slow" }],
        },
      }),
    ).toEqual({ level: "warning", message: "Hook preToolUse (hooks.json) warning: slow" });
  });
});
