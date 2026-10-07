import { describe, expect, it } from "vitest";
import { DaemonPeerSchema, resolveDaemonPeer } from "./daemon-peer.js";

describe("DaemonPeerSchema", () => {
  it("accepts a minimal peer and keeps unknown fields", () => {
    const result = DaemonPeerSchema.parse({
      id: "studio",
      target: "ssh://edi@edis-mac-studio",
      futureField: "kept",
    });
    expect(result).toEqual({
      id: "studio",
      target: "ssh://edi@edis-mac-studio",
      futureField: "kept",
    });
  });

  it("rejects an id with uppercase or leading hyphen characters", () => {
    expect(() => DaemonPeerSchema.parse({ id: "Studio", target: "tcp://host:6767" })).toThrow();
    expect(() => DaemonPeerSchema.parse({ id: "-studio", target: "tcp://host:6767" })).toThrow();
  });

  it("rejects a blank target", () => {
    expect(() => DaemonPeerSchema.parse({ id: "studio", target: "" })).toThrow();
  });
});

describe("resolveDaemonPeer", () => {
  it("defaults name to the id and privacy to local", () => {
    expect(resolveDaemonPeer({ id: "studio", target: "tcp://100.64.0.12:6767" })).toEqual({
      id: "studio",
      name: "studio",
      target: "tcp://100.64.0.12:6767",
      privacy: "local",
    });
  });

  it("keeps an explicit name and privacy", () => {
    expect(
      resolveDaemonPeer({
        id: "macbook",
        name: "MacBook",
        target: "tcp://100.64.0.12:6767",
        privacy: "cloud",
      }),
    ).toEqual({
      id: "macbook",
      name: "MacBook",
      target: "tcp://100.64.0.12:6767",
      privacy: "cloud",
    });
  });
});
