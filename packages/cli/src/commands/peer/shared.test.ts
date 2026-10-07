import { describe, expect, test } from "vitest";
import { redactPeerTarget, removePeer, upsertPeer } from "./shared.js";

describe("upsertPeer", () => {
  test("appends a peer with a new id", () => {
    const peers = [{ id: "a", target: "tcp://a:6767" }];
    expect(upsertPeer(peers, { id: "b", target: "tcp://b:6767" })).toEqual([
      { id: "a", target: "tcp://a:6767" },
      { id: "b", target: "tcp://b:6767" },
    ]);
  });

  test("replaces the entry with a matching id in place", () => {
    const peers = [
      { id: "a", target: "tcp://a:6767" },
      { id: "b", target: "tcp://b:6767" },
    ];
    expect(upsertPeer(peers, { id: "a", name: "A2", target: "tcp://a2:6767" })).toEqual([
      { id: "a", name: "A2", target: "tcp://a2:6767" },
      { id: "b", target: "tcp://b:6767" },
    ]);
  });
});

describe("removePeer", () => {
  test("drops only the entry with a matching id", () => {
    const peers = [
      { id: "a", target: "tcp://a:6767" },
      { id: "b", target: "tcp://b:6767" },
    ];
    expect(removePeer(peers, "a")).toEqual([{ id: "b", target: "tcp://b:6767" }]);
  });

  test("is a no-op when the id is not configured", () => {
    const peers = [{ id: "a", target: "tcp://a:6767" }];
    expect(removePeer(peers, "missing")).toEqual(peers);
  });
});

describe("redactPeerTarget", () => {
  test("redacts a password query parameter on a tcp:// target", () => {
    expect(redactPeerTarget("tcp://host:6767?password=secret")).toBe(
      "tcp://host:6767?password=REDACTED",
    );
  });

  test("redacts userinfo credentials embedded in a target", () => {
    expect(redactPeerTarget("tcp://user:secret@host:6767")).not.toContain("secret");
  });

  test("leaves a target with no password untouched", () => {
    expect(redactPeerTarget("ssh://edi@edis-mac-studio")).toBe("ssh://edi@edis-mac-studio");
  });

  test("falls back to a regex replace for a target the URL parser rejects", () => {
    expect(redactPeerTarget("127.0.0.1:6768?password=secret")).toBe(
      "127.0.0.1:6768?password=REDACTED",
    );
  });
});
