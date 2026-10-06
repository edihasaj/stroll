import type { GestureResponderEvent } from "react-native";

/** The modifier keys a press event carries, read off the DOM event react-native-web forwards. */
export interface SubagentClickModifiers {
  metaKey: boolean;
  ctrlKey: boolean;
}

export interface SubagentOpenPlatform {
  isMac: boolean;
}

/**
 * Decides whether a subagent click should open a normal tab in the parent's pane instead of the
 * default (open beside the parent, per the user's setting). Mirrors the universal "open in new
 * tab" gesture every browser uses for links: Cmd-click on macOS, Ctrl-click elsewhere. Middle
 * click is handled separately — it never reaches a `Pressable`'s `onPress` on web, so callers
 * wire it through a raw `auxclick` listener instead of this predicate.
 */
export function isSubagentOpenAsTabClick(
  modifiers: SubagentClickModifiers,
  platform: SubagentOpenPlatform,
): boolean {
  return platform.isMac ? modifiers.metaKey : modifiers.ctrlKey;
}

/**
 * react-native-web's `Pressable` forwards the real DOM `MouseEvent` as `nativeEvent`, which is
 * where modifier keys live — React Native's own `GestureResponderEvent` type does not declare
 * them because native touch events have no such concept. Reading them off a native press event
 * is always safe: the fields are simply absent (and read as `undefined`) on iOS/Android.
 */
export function readSubagentClickModifiers(event: GestureResponderEvent): SubagentClickModifiers {
  const nativeEvent = event.nativeEvent as GestureResponderEvent["nativeEvent"] & {
    metaKey?: boolean;
    ctrlKey?: boolean;
  };
  return {
    metaKey: nativeEvent.metaKey === true,
    ctrlKey: nativeEvent.ctrlKey === true,
  };
}
