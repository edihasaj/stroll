import { describe, expect, it } from "vitest";
import { joinBriefList, splitBriefList } from "./brief-text";

describe("splitBriefList", () => {
  it("drops blank lines and surrounding whitespace", () => {
    expect(splitBriefList("Add the migration\n\n  Run the gate  \n")).toEqual([
      "Add the migration",
      "Run the gate",
    ]);
  });

  it("returns an empty list for blank text", () => {
    expect(splitBriefList("   \n  \n")).toEqual([]);
  });
});

describe("joinBriefList", () => {
  it("renders one item per line", () => {
    expect(joinBriefList(["Add the migration", "Run the gate"])).toBe(
      "Add the migration\nRun the gate",
    );
  });

  it("round-trips through splitBriefList", () => {
    const items = ["Add the migration", "Run the gate"];
    expect(splitBriefList(joinBriefList(items))).toEqual(items);
  });
});
