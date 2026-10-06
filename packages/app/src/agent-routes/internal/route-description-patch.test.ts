import { describe, expect, it } from "vitest";
import type { AgentRoute } from "@getpaseo/protocol/agent-route";
import { applyRouteDescriptionPatch } from "./route-description-patch";

function route(input: { id: string; description?: string }): AgentRoute {
  return {
    id: input.id,
    name: input.id,
    entries: [],
    ...(input.description !== undefined ? { description: input.description } : {}),
  };
}

describe("applyRouteDescriptionPatch", () => {
  it("sets a trimmed description on the matching route and leaves others untouched", () => {
    const routes = [route({ id: "a" }), route({ id: "b" })];

    const result = applyRouteDescriptionPatch({
      routes,
      routeId: "b",
      description: "  Plans and reviews work.  ",
    });

    expect(result).toEqual([
      route({ id: "a" }),
      route({ id: "b", description: "Plans and reviews work." }),
    ]);
  });

  it("removes the description field instead of storing an empty string", () => {
    const routes = [route({ id: "a", description: "Old description" })];

    const result = applyRouteDescriptionPatch({ routes, routeId: "a", description: "   " });

    expect(result).toEqual([route({ id: "a" })]);
    expect(result[0]).not.toHaveProperty("description");
  });

  it("does not touch a route that does not match the given id", () => {
    const routes = [route({ id: "a", description: "Keep me" })];

    const result = applyRouteDescriptionPatch({ routes, routeId: "missing", description: "New" });

    expect(result).toEqual(routes);
  });
});
