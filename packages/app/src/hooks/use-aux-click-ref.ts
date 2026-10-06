import { useEffect, useRef } from "react";
import type { View } from "react-native";
import { isWeb } from "@/constants/platform";

/** `MouseEvent.button` for the middle (wheel) button. */
const MIDDLE_BUTTON = 1;

/**
 * A ref to attach to a `View` that fires `onAuxClick` for a raw DOM middle click (`auxclick`).
 *
 * React Native Web's `Pressable` has no such prop, and browsers never fire a `click` event —
 * and so never call `onPress` — for the middle mouse button, only `auxclick`. This listens for
 * the real DOM event directly. `auxclick` also fires for the right button in Chromium, so only
 * the middle button is passed on. No-ops on native, where there is no middle mouse button.
 */
export function useAuxClickRef(
  onAuxClick: ((event: MouseEvent) => void) | undefined,
): React.RefObject<View | null> {
  const ref = useRef<View>(null);

  useEffect(() => {
    if (!isWeb || !onAuxClick) return;
    const node = ref.current as unknown as HTMLElement | null;
    if (!node) return;
    const handleAuxClick = (event: MouseEvent) => {
      if (event.button === MIDDLE_BUTTON) onAuxClick(event);
    };
    node.addEventListener("auxclick", handleAuxClick);
    return () => node.removeEventListener("auxclick", handleAuxClick);
  }, [onAuxClick]);

  return ref;
}
