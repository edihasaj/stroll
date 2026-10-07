import { describe, expect, it } from "vitest";
import { checkCreateAgentPrivacyGuard } from "./create-agent-privacy-guard.js";

describe("checkCreateAgentPrivacyGuard", () => {
  it("allows an unrouted caller to pass an explicit provider", () => {
    expect(checkCreateAgentPrivacyGuard(null, { kind: "provider" })).toBeNull();
  });

  it("allows an unrouted caller to target any route", () => {
    expect(
      checkCreateAgentPrivacyGuard(null, { kind: "route", routeId: "worker", privacy: "local" }),
    ).toBeNull();
  });

  it("allows a cloud-routed caller to pass an explicit provider", () => {
    expect(
      checkCreateAgentPrivacyGuard({ routeId: "planner", privacy: "cloud" }, { kind: "provider" }),
    ).toBeNull();
  });

  it("allows a cloud-routed caller to target a cloud route", () => {
    expect(
      checkCreateAgentPrivacyGuard(
        { routeId: "planner", privacy: "cloud" },
        { kind: "route", routeId: "planner", privacy: "cloud" },
      ),
    ).toBeNull();
  });

  it("rejects an explicit provider from a local-routed caller, naming the caller's route", () => {
    const message = checkCreateAgentPrivacyGuard(
      { routeId: "worker", privacy: "local" },
      { kind: "provider" },
    );
    expect(message).toBe(
      "This agent runs on the local route `worker`, so its subagents must run on a local route " +
        "too. Pass `route` with a local route (see list_profiles).",
    );
  });

  it("rejects a non-local target route from a local-routed caller, naming the target route", () => {
    const message = checkCreateAgentPrivacyGuard(
      { routeId: "worker", privacy: "local" },
      { kind: "route", routeId: "planner", privacy: "cloud" },
    );
    expect(message).toBe(
      "This agent runs on the local route `worker`, so its subagents must run on a local route " +
        "too. Route `planner` is not local — pass `route` with a local route (see list_profiles).",
    );
  });

  it("allows a local target route from a local-routed caller", () => {
    expect(
      checkCreateAgentPrivacyGuard(
        { routeId: "worker", privacy: "local" },
        { kind: "route", routeId: "worker", privacy: "local" },
      ),
    ).toBeNull();
  });

  it("allows a cloud-routed caller to target a cloud peer", () => {
    expect(
      checkCreateAgentPrivacyGuard(
        { routeId: "planner", privacy: "cloud" },
        { kind: "peer", peerId: "spark-a", peerName: "Spark A", privacy: "cloud" },
      ),
    ).toBeNull();
  });

  it("allows a local-routed caller to target a local peer", () => {
    expect(
      checkCreateAgentPrivacyGuard(
        { routeId: "worker", privacy: "local" },
        { kind: "peer", peerId: "studio", peerName: "Mac Studio", privacy: "local" },
      ),
    ).toBeNull();
  });

  it("rejects a non-local peer from a local-routed caller, naming the peer", () => {
    const message = checkCreateAgentPrivacyGuard(
      { routeId: "worker", privacy: "local" },
      { kind: "peer", peerId: "spark-a", peerName: "Spark A", privacy: "cloud" },
    );
    expect(message).toBe(
      "This agent runs on the local route `worker`, so its subagents must run on a local route " +
        'too. Computer "Spark A" (spark-a) is not local — pass a local computer (see list_computers).',
    );
  });
});
