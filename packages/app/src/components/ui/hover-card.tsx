import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
  type RefObject,
} from "react";
import { Dimensions, View, type Role, type StyleProp, type ViewStyle } from "react-native";
import { FadeIn, FadeOut } from "react-native-reanimated";
import { StyleSheet } from "react-native-unistyles";
import { Portal } from "@gorhom/portal";
import { useBottomSheetModalInternal } from "@gorhom/bottom-sheet";
import {
  OverlayLayerProvider,
  useOverlayLayer,
  useWebOverlayRegistration,
} from "@/lib/overlay-root";
import { FloatingSurface } from "@/components/ui/floating";
import { isWeb } from "@/constants/platform";
import { useHoverSafeZone } from "@/hooks/use-hover-safe-zone";
import {
  anchorFrameAboveTrigger,
  computePosition,
  measureElement,
  type Alignment,
  type Placement,
  type Rect,
  type Size,
} from "./anchor";

const CLOSE_GRACE_MS = 100;

interface HoverCardContextValue {
  open: boolean;
  layer: number;
  setTriggerRef: (node: View | null) => void;
  triggerRef: RefObject<View | null>;
  contentRef: RefObject<View | null>;
  openNow: () => void;
  scheduleClose: () => void;
}

const HoverCardContext = createContext<HoverCardContextValue | null>(null);

/**
 * A card that opens while the pointer is on its trigger and stays open while the pointer crosses
 * onto it, so its content can be pressed. Hover only exists on web; elsewhere the trigger renders
 * alone and the content never mounts. See docs/hover.md.
 *
 * ```tsx
 * <HoverCard>
 *   <HoverCardTrigger>{trigger}</HoverCardTrigger>
 *   <HoverCardContent placement="top">{details}</HoverCardContent>
 * </HoverCard>
 * ```
 */
export function HoverCard({
  disabled = false,
  children,
}: {
  /** Closes the card and keeps it closed, e.g. while its trigger is dragged. */
  disabled?: boolean;
  children: ReactNode;
}): ReactNode {
  if (!isWeb) return children;
  return <WebHoverCard disabled={disabled}>{children}</WebHoverCard>;
}

function WebHoverCard({
  disabled,
  children,
}: {
  disabled: boolean;
  children: ReactNode;
}): ReactElement {
  const layer = useOverlayLayer("floating");
  const triggerRef = useRef<View>(null);
  const contentRef = useRef<View>(null);
  const [open, setOpen] = useState(false);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Holds whichever animation frame is currently outstanding for the deferred recheck
  // scheduleClose's timer does below — the id is reassigned as that chain advances, so
  // cancelling "the current one" cancels the close at whatever stage it is in.
  const closeFrameRef = useRef<number | null>(null);

  const clearGraceTimer = useCallback(() => {
    if (graceTimerRef.current) {
      clearTimeout(graceTimerRef.current);
      graceTimerRef.current = null;
    }
    if (closeFrameRef.current !== null) {
      cancelAnimationFrame(closeFrameRef.current);
      closeFrameRef.current = null;
    }
  }, []);

  const focusInside = useCallback(() => {
    if (!isWeb) return false;
    const active = document.activeElement;
    return [triggerRef.current, contentRef.current].some((view) =>
      (view as unknown as HTMLElement | null)?.contains(active),
    );
  }, []);

  // Keyboard focus keeps the card open for keyboard users; the focus a pointer click leaves
  // behind on the trigger or a button in the card does not outlast the pointer leaving.
  const keyboardFocusInside = useCallback(() => {
    return focusInside() && document.activeElement?.matches(":focus-visible") === true;
  }, [focusInside]);

  // The trigger's own `pointerleave` can fire with the pointer never having moved: content
  // streaming into the card (a usage report replacing "Loading usage...") grows the box
  // downward from its already-computed `top`, since the repaint lands before the position
  // effect re-measures and lifts it clear of the trigger again. That paints the content
  // directly over the trigger for a render or two, which steals the hit-test and fires a
  // real `pointerleave` with no `pointermove` behind it — so the safe zone's own tracker,
  // which only re-evaluates on an actual pointer move, never learns the pointer is still
  // (geometrically) over the card. `:hover` is never stale: the browser recomputes it on
  // every layout, move or not, which is what scheduleClose's deferred recheck below reads.
  const pointerInside = useCallback(() => {
    if (!isWeb) return false;
    const trigger = triggerRef.current as unknown as HTMLElement | null;
    const content = contentRef.current as unknown as HTMLElement | null;
    try {
      return Boolean(trigger?.matches(":hover")) || Boolean(content?.matches(":hover"));
    } catch {
      return false;
    }
  }, []);

  // The second of the two deferred frames scheduleClose's timer waits out below — split out
  // so neither callback nests more than one level deep.
  const commitClose = useCallback(() => {
    closeFrameRef.current = null;
    if (keyboardFocusInside() || pointerInside()) return;
    setOpen(false);
  }, [keyboardFocusInside, pointerInside]);

  const scheduleClose = useCallback(() => {
    if (keyboardFocusInside()) return;
    if (graceTimerRef.current) return;
    graceTimerRef.current = setTimeout(() => {
      graceTimerRef.current = null;
      // A content reposition that lands right around the grace deadline can finish
      // clearing the trigger a frame or two after this fires, before the browser's own
      // hit-test pass has dispatched the matching pointerenter back onto it — so :hover
      // still reads "outside" for one more tick even though nothing really left. Give
      // that pass two frames to land (recomputed each layout, not just on pointer moves)
      // before trusting pointerInside's answer.
      closeFrameRef.current = requestAnimationFrame(() => {
        closeFrameRef.current = requestAnimationFrame(commitClose);
      });
    }, CLOSE_GRACE_MS);
  }, [keyboardFocusInside, commitClose]);

  const openNow = useCallback(() => {
    clearGraceTimer();
    if (!disabled) {
      setOpen(true);
    }
  }, [clearGraceTimer, disabled]);

  const keyPressed = useCallback(
    (event: KeyboardEvent): boolean => {
      if (!isWeb) return false;
      const trigger = triggerRef.current as unknown as HTMLElement | null;
      if (!trigger) return false;
      if (event.key === "Escape" && open) {
        event.preventDefault();
        if (focusInside()) trigger.focus();
        clearGraceTimer();
        setOpen(false);
        return true;
      } else if (
        focusInside() &&
        event.target === trigger &&
        ["ArrowDown", "Enter", " "].includes(event.key)
      ) {
        event.preventDefault();
        openNow();
        requestAnimationFrame(() => {
          (contentRef.current as unknown as HTMLElement | null)
            ?.querySelector<HTMLElement>(
              'button, [role="button"][tabindex="0"], a[href], input, [tabindex="0"]',
            )
            ?.focus();
        });
        return true;
      }
      return false;
    },
    [clearGraceTimer, focusInside, open, openNow],
  );

  const setOverlayScope = useWebOverlayRegistration({
    active: !disabled && open,
    layer,
    onKeyDown: keyPressed,
    manageFocus: false,
  });
  const setTriggerRef = useCallback(
    (node: View | null) => {
      triggerRef.current = node;
      setOverlayScope(node);
    },
    [setOverlayScope],
  );

  useEffect(() => {
    if (!isWeb) return;
    const trigger = triggerRef.current as unknown as HTMLElement | null;
    if (!trigger) return;
    const close = () => {
      clearGraceTimer();
      setOpen(false);
    };
    const focusEntered = (event: FocusEvent) => {
      const target = event.target as Node;
      if (trigger.contains(target)) {
        openNow();
      } else if ((contentRef.current as unknown as HTMLElement | null)?.contains(target)) {
        clearGraceTimer();
      }
    };
    const focusLeft = (event: FocusEvent) => {
      const next = event.relatedTarget as Node | null;
      if (
        !trigger.contains(next) &&
        !(contentRef.current as unknown as HTMLElement | null)?.contains(next)
      ) {
        scheduleClose();
      }
    };
    const activateClosedTrigger = (event: KeyboardEvent) => {
      if (
        !open &&
        !event.defaultPrevented &&
        !event.isComposing &&
        ["ArrowDown", "Enter", " "].includes(event.key)
      )
        keyPressed(event);
    };
    const scrolled = (event: Event) => {
      if (!(contentRef.current as unknown as HTMLElement | null)?.contains(event.target as Node))
        close();
    };
    document.addEventListener("focusin", focusEntered);
    document.addEventListener("focusout", focusLeft);
    trigger.addEventListener("keydown", activateClosedTrigger);
    document.addEventListener("scroll", scrolled, true);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("focusin", focusEntered);
      document.removeEventListener("focusout", focusLeft);
      trigger.removeEventListener("keydown", activateClosedTrigger);
      document.removeEventListener("scroll", scrolled, true);
      window.removeEventListener("resize", close);
    };
  }, [clearGraceTimer, keyPressed, open, openNow, scheduleClose]);

  // While open, the safe zone covers trigger + content + the bridge between
  // them. Close only fires when the pointer leaves the safe zone; re-entering
  // it (including the bridge) cancels the pending close.
  useHoverSafeZone({
    enabled: open,
    triggerRef,
    contentRef,
    onEnterSafeZone: clearGraceTimer,
    onLeaveSafeZone: scheduleClose,
  });

  useEffect(() => {
    if (disabled) {
      clearGraceTimer();
      setOpen(false);
    }
  }, [clearGraceTimer, disabled]);

  useEffect(() => clearGraceTimer, [clearGraceTimer]);

  const value = useMemo<HoverCardContextValue>(
    () => ({ open, layer, setTriggerRef, triggerRef, contentRef, openNow, scheduleClose }),
    [open, layer, setTriggerRef, openNow, scheduleClose],
  );

  return (
    <OverlayLayerProvider layer={layer}>
      <HoverCardContext.Provider value={value}>{children}</HoverCardContext.Provider>
    </OverlayLayerProvider>
  );
}

export function HoverCardTrigger({
  children,
  focusable = false,
  accessibilityLabel,
}: {
  children: ReactNode;
  focusable?: boolean;
  accessibilityLabel?: string;
}): ReactNode {
  const ctx = useContext(HoverCardContext);
  if (!ctx) return children;
  return (
    <View
      ref={ctx.setTriggerRef}
      tabIndex={focusable ? 0 : undefined}
      accessibilityRole={focusable ? "button" : undefined}
      accessibilityLabel={accessibilityLabel}
      collapsable={false}
      onPointerEnter={ctx.openNow}
      onPointerLeave={ctx.scheduleClose}
    >
      {children}
    </View>
  );
}

interface HoverCardContentProps {
  placement: Placement;
  alignment?: Alignment;
  offset?: number;
  /** Layered over the default popover surface. */
  style?: StyleProp<ViewStyle>;
  role?: Role;
  accessibilityLabel?: string;
  testID?: string;
  /** Mounted only while the card is open, so whatever it fetches runs only then. */
  children: ReactNode;
}

export function HoverCardContent(props: HoverCardContentProps): ReactElement | null {
  const ctx = useContext(HoverCardContext);
  if (!ctx?.open) return null;
  return (
    <HoverCardSurface
      {...props}
      layer={ctx.layer}
      triggerRef={ctx.triggerRef}
      contentRef={ctx.contentRef}
    />
  );
}

function HoverCardSurface({
  layer,
  triggerRef,
  contentRef,
  placement,
  alignment = "center",
  offset = 4,
  style,
  role,
  accessibilityLabel,
  testID,
  children,
}: HoverCardContentProps & {
  layer: number;
  triggerRef: RefObject<View | null>;
  contentRef: RefObject<View | null>;
}): ReactElement {
  const bottomSheetInternal = useBottomSheetModalInternal(true);
  const [triggerRect, setTriggerRect] = useState<Rect | null>(null);
  const [contentSize, setContentSize] = useState<Size | null>(null);
  const [position, setPosition] = useState<{
    x: number;
    y: number;
    actualPlacement: Placement;
  } | null>(null);

  useEffect(() => {
    if (!triggerRef.current) return;
    let cancelled = false;
    void measureElement(triggerRef.current).then((rect) => {
      if (!cancelled) setTriggerRect(rect);
      return undefined;
    });
    return () => {
      cancelled = true;
    };
  }, [triggerRef]);

  useEffect(() => {
    if (!triggerRect || !contentSize) return;
    const { width, height } = Dimensions.get("window");
    const { x, y, actualPlacement } = computePosition({
      triggerRect,
      contentSize,
      displayArea: { x: 0, y: 0, width, height },
      placement,
      flipHorizontal: true,
      alignment,
      offset,
    });
    setPosition({ x, y, actualPlacement });
  }, [alignment, contentSize, offset, placement, triggerRect]);

  const handleLayout = useCallback(
    (event: { nativeEvent: { layout: { width: number; height: number } } }) => {
      const { width, height } = event.nativeEvent.layout;
      setContentSize({ width, height });
    },
    [],
  );

  // A card placed above its trigger anchors from the *bottom* instead of the computed `top`
  // — see anchor.ts's anchorFrameAboveTrigger for why computing `top` from contentSize lets
  // a card whose content streams in after it opens (context-window.ts's scriptAgentUsage)
  // transiently cover its own trigger.
  const frameStyle = useMemo(() => {
    if (!position || !triggerRect) {
      return { position: "absolute" as const, top: -9999, left: -9999 };
    }
    if (position.actualPlacement !== "top") {
      return { position: "absolute" as const, top: position.y, left: position.x };
    }
    const { height: windowHeight } = Dimensions.get("window");
    return {
      position: "absolute" as const,
      left: position.x,
      ...anchorFrameAboveTrigger({ triggerRect, offset, displayAreaHeight: windowHeight }),
    };
  }, [position, triggerRect, offset]);
  const surfaceStyle = useMemo(() => [styles.surface, style], [style]);

  return (
    <Portal hostName={bottomSheetInternal?.hostName}>
      <View pointerEvents="box-none" style={[styles.portalOverlay, { zIndex: layer }]}>
        <FloatingSurface
          ref={contentRef}
          entering={FadeIn.duration(80)}
          exiting={FadeOut.duration(80)}
          collapsable={false}
          onLayout={handleLayout}
          role={role}
          accessibilityLabel={accessibilityLabel}
          testID={testID}
          style={surfaceStyle}
          frameStyle={frameStyle}
        >
          {children}
        </FloatingSurface>
      </View>
    </Portal>
  );
}

const styles = StyleSheet.create((theme) => ({
  portalOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 1000,
  },
  surface: {
    backgroundColor: theme.colors.popover,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    borderRadius: theme.borderRadius.xl,
    boxShadow: theme.shadow.md,
    zIndex: 1000,
  },
}));
