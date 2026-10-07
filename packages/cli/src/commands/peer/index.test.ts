import { describe, expect, it } from "vitest";
import { createPeerCommand } from "./index.js";

describe("peer command group", () => {
  it("exposes add, rm, ls, and test", () => {
    expect(createPeerCommand().commands.map((command) => command.name())).toEqual([
      "add",
      "rm",
      "ls",
      "test",
    ]);
  });
});
