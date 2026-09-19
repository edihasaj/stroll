import { type ReactNode, useCallback, useMemo, useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import Animated from "react-native-reanimated";
import { X } from "lucide-react-native";
import { isNative } from "@/constants/platform";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useAppReducedMotion, withMotion } from "@/hooks/use-app-reduced-motion";
import { appearEntering, appearExiting } from "@/styles/motion";
import type { AttachmentMetadata } from "@/attachments/types";
import { useAttachmentPreviewUrl } from "@/attachments/use-attachment-preview-url";
import type { Theme } from "@/styles/theme";

// Every attachment pill body — image thumbnail or labelled — renders at this
// height so mixed attachment trays line up.
const ATTACHMENT_CONTENT_HEIGHT = 48;

interface AttachmentPillProps {
  onOpen: () => void;
  onRemove: () => void;
  openAccessibilityLabel: string;
  removeAccessibilityLabel: string;
  disabled?: boolean;
  testID?: string;
  children: ReactNode;
}

export function AttachmentPill({
  onOpen,
  onRemove,
  openAccessibilityLabel,
  removeAccessibilityLabel,
  disabled = false,
  testID,
  children,
}: AttachmentPillProps) {
  const isCompact = useIsCompactFormFactor();
  const reducedMotion = useAppReducedMotion();
  // Hover lives on this one plain wrapper (docs/hover.md's canonical pattern), not on the two
  // Pressables inside it — the close button pokes 8px outside the frame's own box, but it is
  // still a DOM descendant of the wrapper, so `pointerleave` never fires while the cursor
  // crosses onto it. The previous version tracked each Pressable's own hover independently and
  // OR'd the two, which works but invites the two states to desync at the seam.
  const [isHovered, setIsHovered] = useState(false);
  const alwaysShow = isNative || isCompact;
  const showRemove = alwaysShow || isHovered;
  const closeButtonStyle = useMemo(
    () => [styles.closeButton, !showRemove && styles.closeButtonHidden],
    [showRemove],
  );
  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  return (
    <Animated.View
      style={styles.wrapper}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
      entering={withMotion(reducedMotion, appearEntering)}
      exiting={withMotion(reducedMotion, appearExiting)}
    >
      <Pressable
        testID={testID}
        onPress={onOpen}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={openAccessibilityLabel}
        style={styles.frame}
      >
        {children}
      </Pressable>
      <Pressable
        onPress={onRemove}
        disabled={disabled}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={removeAccessibilityLabel}
        style={closeButtonStyle}
      >
        <ThemedX size={12} uniProps={iconForegroundMutedMapping} />
      </Pressable>
    </Animated.View>
  );
}

interface AttachmentFrameProps {
  onPress?: () => void;
  accessibilityLabel?: string;
  testID?: string;
  children: ReactNode;
}

/** Bare attachment frame for read-only surfaces (sent messages) — no remove button. */
export function AttachmentFrame({
  onPress,
  accessibilityLabel,
  testID,
  children,
}: AttachmentFrameProps) {
  if (!onPress) {
    return (
      <View testID={testID} style={styles.frame}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={styles.frame}
    >
      {children}
    </Pressable>
  );
}

interface AttachmentLabelProps {
  icon?: ReactNode;
  title: string;
  subtitle: string;
}

/** Two-line labelled pill body: attachment name over its type. */
export function AttachmentLabel({ icon, title, subtitle }: AttachmentLabelProps) {
  return (
    <View style={styles.labelBody}>
      {icon ? <View style={styles.labelIcon}>{icon}</View> : null}
      <View style={styles.labelTextColumn}>
        <Text style={styles.labelTitle} numberOfLines={1}>
          {title}
        </Text>
        <Text style={styles.labelSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </View>
  );
}

/** Square image preview pill body. */
export function AttachmentThumbnail({ metadata }: { metadata: AttachmentMetadata }) {
  const uri = useAttachmentPreviewUrl(metadata);
  const source = useMemo(() => ({ uri: uri ?? "" }), [uri]);
  if (!uri) {
    return <View style={styles.thumbnailPlaceholder} />;
  }
  return <Image source={source} style={styles.thumbnail} />;
}

const ThemedX = withUnistyles(X);
const iconForegroundMutedMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

const styles = StyleSheet.create((theme) => ({
  wrapper: {
    position: "relative",
  },
  frame: {
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.borderAccent,
    overflow: "hidden",
  },
  labelBody: {
    height: ATTACHMENT_CONTENT_HEIGHT,
    maxWidth: 260,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    backgroundColor: theme.colors.surface1,
  },
  labelIcon: {
    width: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  labelTextColumn: {
    minWidth: 0,
    flexShrink: 1,
  },
  labelTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
  },
  labelSubtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  thumbnail: {
    width: ATTACHMENT_CONTENT_HEIGHT,
    height: ATTACHMENT_CONTENT_HEIGHT,
  },
  thumbnailPlaceholder: {
    width: ATTACHMENT_CONTENT_HEIGHT,
    height: ATTACHMENT_CONTENT_HEIGHT,
    backgroundColor: theme.colors.surface1,
  },
  closeButton: {
    position: "absolute",
    top: -8,
    left: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: theme.colors.surface2,
    borderWidth: theme.borderWidth[1],
    borderColor: theme.colors.border,
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  closeButtonHidden: {
    opacity: 0,
    pointerEvents: "none",
  },
}));
