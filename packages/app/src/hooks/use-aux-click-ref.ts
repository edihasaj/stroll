import { useEffect, useRef } from "react";
import type { View } from "react-native";
import { isWeb } from "@/constants/platform";

/**
 * A ref to attach to a `View` that fires `onAuxClick` for a raw DOM middle click (`auxclick`).
 *
 * React Native Web's `Pressable` has no such prop, and browsers never fire a `click` event —
 * and so never call `onPress` — for the middle mouse button, only `auxclick`. This listens for
 * the real DOM event directly. No-ops on native, where there is no middle mouse button.
 */
export function useAuxClickRef(
  onAuxClick: ((event: MouseEvent) => void) | undefined,
): React.RefObject<View | null> {
  const ref = useRef<View>(null);

  useEffect(() => {
    if (!isWeb || !onAuxClick) return;
    const node = ref.current as unknown as HTMLElement | null;
    if (!node) return;
    node.addEventListener("auxclick", onAuxClick);
    return () => node.removeEventListener("auxclick", onAuxClick);
  }, [onAuxClick]);

  return ref;
}
