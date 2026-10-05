import { describe, expect, it } from "vitest";
import { deriveFriendlyHostName, friendlyHostDisplayName } from "@/hosts/display-name";

describe("deriveFriendlyHostName", () => {
  it("strips a trailing .local and turns dashes into spaces", () => {
    expect(deriveFriendlyHostName("Edis-MacBook-Pro.local")).toBe("Edis MacBook Pro");
  });

  it("strips .lan and .home suffixes too", () => {
    expect(deriveFriendlyHostName("build-server.lan")).toBe("build server");
    expect(deriveFriendlyHostName("media-center.home")).toBe("media center");
  });

  it("is case-insensitive on the suffix", () => {
    expect(deriveFriendlyHostName("Office-PC.LOCAL")).toBe("Office PC");
  });

  it("leaves a name with no recognized suffix unchanged, dashes included", () => {
    expect(deriveFriendlyHostName("mainframe")).toBe("mainframe");
    expect(deriveFriendlyHostName("edi-desktop")).toBe("edi-desktop");
  });

  it("falls back to the trimmed input when stripping the suffix leaves nothing", () => {
    expect(deriveFriendlyHostName(".local")).toBe(".local");
  });

  it("trims surrounding whitespace", () => {
    expect(deriveFriendlyHostName("  Edis-MacBook-Pro.local  ")).toBe("Edis MacBook Pro");
  });

  it("returns an empty string unchanged", () => {
    expect(deriveFriendlyHostName("")).toBe("");
  });
});

describe("friendlyHostDisplayName", () => {
  it("derives a friendly name from a raw-hostname label, independent of serverId", () => {
    // serverId is always an opaque generated id (`srv_...`), never the raw hostname, so
    // the label can't be compared against it to detect an un-customized default.
    expect(
      friendlyHostDisplayName({ label: "Edis-MacBook-Pro.local", serverId: "srv_25S_Z22MYCtl" }),
    ).toBe("Edis MacBook Pro");
  });

  it("returns a user-chosen label untouched when it has no raw-hostname suffix", () => {
    expect(
      friendlyHostDisplayName({ label: "Office Mac mini", serverId: "srv_25S_Z22MYCtl" }),
    ).toBe("Office Mac mini");
    expect(friendlyHostDisplayName({ label: "edi-desktop", serverId: "srv_other" })).toBe(
      "edi-desktop",
    );
  });

  it("falls back to deriving from serverId when label is blank", () => {
    expect(friendlyHostDisplayName({ label: "", serverId: "Edis-MacBook-Pro.local" })).toBe(
      "Edis MacBook Pro",
    );
    expect(friendlyHostDisplayName({ label: "   ", serverId: "Edis-MacBook-Pro.local" })).toBe(
      "Edis MacBook Pro",
    );
  });

  it("still derives a label that happens to end in a raw-hostname suffix (known limitation)", () => {
    expect(friendlyHostDisplayName({ label: "My Office.local", serverId: "srv_1" })).toBe(
      "My Office",
    );
  });
});
