import { describe, expect, it } from "vitest";
import { resolveSshFailureDetail } from "./ssh-tunnel.js";

describe("resolveSshFailureDetail", () => {
  it("surfaces SSH stderr before the child exit event settles", () => {
    expect(resolveSshFailureDetail(null, "Host key verification failed.\n")).toBe(
      "Host key verification failed.",
    );
    expect(resolveSshFailureDetail("ssh exited with code 255", "earlier stderr")).toBe(
      "ssh exited with code 255",
    );
  });
});
