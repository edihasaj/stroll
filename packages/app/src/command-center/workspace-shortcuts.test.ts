import { describe, expect, it } from "vitest";
import { resolveWorkspaceCommandCenterShortcuts } from "./workspace-shortcuts";

describe("resolveWorkspaceCommandCenterShortcuts", () => {
  it("assigns the New agent command its own shortcut", () => {
    expect(
      resolveWorkspaceCommandCenterShortcuts({
        overrides: {},
        platform: { isMac: true, isDesktop: true },
      }).newAgent,
    ).toEqual([["mod", "shift", "A"]]);
  });

  it("shows the keys that toggle Full view", () => {
    expect(
      resolveWorkspaceCommandCenterShortcuts({
        overrides: {},
        platform: { isMac: false, isDesktop: true },
      }).toggleFullView,
    ).toEqual([["ctrl", "shift", "B"]]);
  });

  it("follows a rebound Full view shortcut", () => {
    expect(
      resolveWorkspaceCommandCenterShortcuts({
        overrides: { "view-toggle-full-view-ctrl-shift-b-non-mac": "Ctrl+Shift+J" },
        platform: { isMac: false, isDesktop: true },
      }).toggleFullView,
    ).toEqual([["ctrl", "shift", "J"]]);
  });

  it("shows the keys that move through chat history", () => {
    const shortcuts = resolveWorkspaceCommandCenterShortcuts({
      overrides: {},
      platform: { isMac: true, isDesktop: true },
    });

    expect(shortcuts.previousChat).toEqual([["mod", "alt", "Left"]]);
    expect(shortcuts.nextChat).toEqual([["mod", "alt", "Right"]]);
  });
});
