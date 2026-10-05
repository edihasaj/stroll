import { describe, expect, it } from "vitest";
import {
  canDesktopAppSidebarShare,
  resolveDesktopAppChromeLayout,
  resolveDesktopAppContentMinimum,
  resolveDesktopSidebarEffectiveWidth,
  resolveDesktopSidebarMode,
  resolveDesktopSidebarVisibility,
  resolveDesktopSidebarWidth,
  SIDEBAR_RAIL_WIDTH,
} from "@/components/desktop-sidebar-layout";

describe("desktop sidebar layout", () => {
  it("keeps a retained sidebar hidden while app chrome is suppressed", () => {
    expect(
      resolveDesktopSidebarVisibility({
        chromeEnabled: false,
        isCompactLayout: false,
        isMounted: true,
        isOpen: true,
        canShare: true,
      }),
    ).toBe(false);
  });

  it("keeps the sidebar toggle window-owned beside left window controls", () => {
    expect(
      resolveDesktopAppChromeLayout({
        desktopSidebarRendered: true,
        hasTopLeftWindowControls: true,
        sidebarControlsEnabled: true,
      }),
    ).toEqual({
      sidebarCorners: "top-left",
      contentCorners: "top-right",
      sidebarToggleOwner: "window",
    });
    expect(
      resolveDesktopAppChromeLayout({
        desktopSidebarRendered: true,
        hasTopLeftWindowControls: false,
        sidebarControlsEnabled: true,
      }),
    ).toEqual({
      sidebarCorners: "none",
      contentCorners: "both",
      sidebarToggleOwner: "content",
    });
    expect(
      resolveDesktopAppChromeLayout({
        desktopSidebarRendered: false,
        hasTopLeftWindowControls: true,
        sidebarControlsEnabled: true,
      }),
    ).toEqual({
      sidebarCorners: "none",
      contentCorners: "both",
      sidebarToggleOwner: "window",
    });
  });

  it("hides the window-owned sidebar toggle when app chrome is suppressed", () => {
    expect(
      resolveDesktopAppChromeLayout({
        desktopSidebarRendered: false,
        hasTopLeftWindowControls: true,
        sidebarControlsEnabled: false,
      }).sidebarToggleOwner,
    ).toBe("none");
  });

  it("clamps a persisted wide sidebar to preserve the center pane", () => {
    const atHalfScreen = resolveDesktopSidebarWidth({ requestedWidth: 600, viewportWidth: 751 });
    expect(atHalfScreen).toBe(351);
    expect(751 - atHalfScreen).toBe(400);

    const atBreakpoint = resolveDesktopSidebarWidth({ requestedWidth: 600, viewportWidth: 720 });
    expect(atBreakpoint).toBe(320);
    expect(720 - atBreakpoint).toBe(400);

    expect(resolveDesktopSidebarWidth({ requestedWidth: 600, viewportWidth: 1440 })).toBe(600);
  });

  it("yields app navigation when settings needs the shell width", () => {
    const settingsMinimum = resolveDesktopAppContentMinimum({ isSettingsRoute: true });
    expect(settingsMinimum).toBe(720);
    expect(
      canDesktopAppSidebarShare({
        contentMinimumWidth: settingsMinimum,
        mode: "expanded",
        requestedPanelWidth: 320,
        viewportWidth: 751,
      }),
    ).toBe(false);
  });

  it("imposes no content minimum outside settings", () => {
    expect(resolveDesktopAppContentMinimum({ isSettingsRoute: false })).toBe(0);
    expect(
      canDesktopAppSidebarShare({
        contentMinimumWidth: resolveDesktopAppContentMinimum({ isSettingsRoute: false }),
        mode: "expanded",
        requestedPanelWidth: 320,
        viewportWidth: 751,
      }),
    ).toBe(true);
  });

  it("shares more room in rail mode than expanded, for the same viewport", () => {
    // At 800px: rail (52px) leaves 748px, clearing the 720px settings minimum; expanded
    // (52 + a clamped 320px panel = 372px) leaves only 428px and does not.
    const settingsMinimum = resolveDesktopAppContentMinimum({ isSettingsRoute: true });
    expect(
      canDesktopAppSidebarShare({
        contentMinimumWidth: settingsMinimum,
        mode: "expanded",
        requestedPanelWidth: 320,
        viewportWidth: 800,
      }),
    ).toBe(false);
    expect(
      canDesktopAppSidebarShare({
        contentMinimumWidth: settingsMinimum,
        mode: "rail",
        requestedPanelWidth: 320,
        viewportWidth: 800,
      }),
    ).toBe(true);
  });

  describe("resolveDesktopSidebarMode (SB1 state machine)", () => {
    it("is hidden whenever the sidebar is not visible, regardless of rail preference", () => {
      expect(resolveDesktopSidebarMode({ visible: false, railPreferred: false })).toBe("hidden");
      expect(resolveDesktopSidebarMode({ visible: false, railPreferred: true })).toBe("hidden");
    });

    it("is expanded when visible and rail is not preferred", () => {
      expect(resolveDesktopSidebarMode({ visible: true, railPreferred: false })).toBe("expanded");
    });

    it("is rail when visible and rail is preferred", () => {
      expect(resolveDesktopSidebarMode({ visible: true, railPreferred: true })).toBe("rail");
    });

    it("restores whichever of expanded/rail was last chosen once visible again", () => {
      // Hiding the sidebar and reopening it does not reset the rail preference —
      // the hide affordance and the rail toggle are independent booleans.
      const wasRailBeforeHiding = true;
      expect(
        resolveDesktopSidebarMode({ visible: false, railPreferred: wasRailBeforeHiding }),
      ).toBe("hidden");
      expect(resolveDesktopSidebarMode({ visible: true, railPreferred: wasRailBeforeHiding })).toBe(
        "rail",
      );
    });
  });

  describe("resolveDesktopSidebarEffectiveWidth (M3)", () => {
    it("is zero while hidden", () => {
      expect(
        resolveDesktopSidebarEffectiveWidth({
          mode: "hidden",
          requestedWidth: 320,
          viewportWidth: 1440,
        }),
      ).toBe(0);
    });

    it("is the fixed rail width regardless of the persisted expanded width", () => {
      expect(
        resolveDesktopSidebarEffectiveWidth({
          mode: "rail",
          requestedWidth: 600,
          viewportWidth: 1440,
        }),
      ).toBe(SIDEBAR_RAIL_WIDTH);
    });

    it("adds the fixed rail width on top of the clamped panel width when expanded", () => {
      expect(
        resolveDesktopSidebarEffectiveWidth({
          mode: "expanded",
          requestedWidth: 600,
          viewportWidth: 751,
        }),
      ).toBe(
        SIDEBAR_RAIL_WIDTH +
          resolveDesktopSidebarWidth({ requestedWidth: 600, viewportWidth: 751 }),
      );
    });
  });
});
