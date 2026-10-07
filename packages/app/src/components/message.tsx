import { ASSISTANT_IMAGE_DEFAULT_ASPECT_RATIO } from "@/utils/assistant-image-metadata";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { TaskListRow } from "@/components/task-list-row";
import {
  View,
  Text,
  Image,
  Pressable,
  Platform,
  type GestureResponderEvent,
  type LayoutChangeEvent,
  StyleProp,
  ViewStyle,
  type TextStyle,
} from "react-native";
import { useTranslation } from "react-i18next";
import { MarkdownParagraphView, MarkdownTextSpan } from "@/components/markdown-text";
import { MarkdownTableCellText } from "@/components/markdown-text-selection";
import * as React from "react";
import {
  useState,
  useEffect,
  useRef,
  memo,
  useMemo,
  useCallback,
  createContext,
  useContext,
} from "react";
import type { ComponentProps, ComponentType, ReactNode } from "react";
import type MarkdownIt from "markdown-it";
import { type ASTNode, type RenderRules } from "react-native-markdown-display";
import MaskedView from "@react-native-masked-view/masked-view";
import {
  Info,
  XCircle,
  ChevronRight,
  Check,
  CheckSquare,
  CircleDot,
  Copy,
  Plus,
  TriangleAlertIcon,
  Scissors,
  MicVocal,
  FileSymlink,
} from "lucide-react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { ICON_SIZE, MOTION_DURATION, MOTION_EASING, type Theme } from "@/styles/theme";
import { useIsCompactFormFactor } from "@/constants/layout";
import { useAppReducedMotion, withMotion } from "@/hooks/use-app-reduced-motion";
import { useAppActivelyVisible } from "@/hooks/use-app-visible";
import { webAppearStyle } from "@/styles/motion";
import Animated, {
  Easing,
  FadeIn,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";
import Svg, { Defs, LinearGradient as SvgLinearGradient, Rect, Stop } from "react-native-svg";
import { inlineUnistylesStyle } from "@/styles/unistyles-inline-style";
import { MarkdownRenderer, type MarkdownStyles } from "@/components/markdown/renderer";
import type { TaskActivity, TodoEntry, UserMessageImageAttachment } from "@/types/stream";
import type { AgentAttachment } from "@getpaseo/protocol/messages";
import type { ToolCallDetail } from "@getpaseo/protocol/agent-types";
import { buildToolCallPresentation } from "@/tool-calls/presentation";
import { resolveToolCallIcon } from "@/utils/tool-call-icon";
import { getMarkdownListMarker, getMarkdownListSpacing } from "@/utils/markdown-list";
import { markdownNodeContainsType } from "@/utils/markdown-ast";
import { useStableEvent } from "@/hooks/use-stable-event";
import { HighlightedCodeBlock } from "@/components/highlighted-code-block";
import { MarkdownFenceBlock } from "@/components/markdown/fence";
import type { MarkdownPhase } from "@/components/markdown/fence/types";
import { splitMarkdownBlocks } from "@/utils/split-markdown-blocks";
import { useRevealedText } from "@/hooks/use-revealed-text";
import { colorMarkdownLinkChildren } from "@/components/markdown/link-children";
import { createAssistantMarkdownParser } from "@/utils/assistant-markdown-parser";
import { formatDuration, formatMessageTimestamp } from "@/utils/time";
import { writeMarkdownToRichClipboard } from "@/utils/rich-clipboard";
import { getDefaultMarkdownClipboardEnvironment } from "@/utils/rich-clipboard-default-environment";
import { setAssistantMarkdownBlockHeight } from "@/utils/assistant-message-height-estimate";
import { isRenderProfileEnabled } from "@/utils/render-profiler";
import { getAgentAttachmentPillContent } from "@/attachments/attachment-pill-content";
import { useHostBadges } from "@/hosts/use-host-badges";
import type { HostBadgeModel } from "@/hosts/appearance";
import { identityColor } from "@/styles/identity-colors";
import { CONTENT_SURFACE_DATASET } from "@/styles/content-surface";
import { resolveUserMessageAvatarColorName } from "./user-message-identity";
import { PlanCard } from "./plan-card";
import { useToolCallSheet } from "./tool-call-sheet";
import { ToolCallDetailsContent } from "./tool-call-details";
import {
  AssistantInlineCodePathLink,
  type AssistantFileLinkSource,
  AssistantMarkdownCodeLink,
  AssistantMarkdownLink,
  LinkActionsMenuContent,
  type InlinePathTarget,
  splitTextIntoPathSegments,
  type TextPathSegment,
  useAssistantFileLinkActions,
  useAssistantFileLinkResolverContext,
  useAssistantLinkPress,
  useFileLink,
  useLinkActionsMenuGesture,
  useOptionalAssistantFileLinkResolverContext,
} from "@/assistant-file-links";
import { ContextMenu } from "@/components/ui/context-menu";
import { getCompactionMarkerLabel } from "./message-compaction-label";
import { useAssistantImage } from "@/assistant-image/use-assistant-image";
import {
  AttachmentFrame,
  AttachmentLabel,
  AttachmentThumbnail,
} from "@/components/attachment-pill";
import { AttachmentLightbox, type ImageLightboxSource } from "@/components/attachment-lightbox";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import { isWeb, isNative } from "@/constants/platform";
import type { AgentCapabilityFlags } from "@getpaseo/protocol/agent-types";
import { RewindMenu, type RewindMode } from "@/components/rewind/rewind-menu";
import { useRewindAgentMutation } from "@/components/rewind/use-rewind-agent-mutation";
import { AssistantForkMenu, type AssistantForkTarget } from "@/components/assistant-fork-menu";
import { useRetainedPanelActive } from "@/components/retained-panel";
import {
  markdownCopyDataSet,
  markdownCopyImageDataSet,
  markdownCopyOrderedListDataSet,
  markdownCopyTableCellDataSet,
  type MarkdownCopyInlineTag,
} from "@/assistant-selection-copy/markup";
import { capAssistantMessageForRender, getUtf8ByteLength } from "./assistant-message-render-limit";
import { rewriteAssistantAnnotations } from "@/assistant-annotations/rewrite";
import { resolveSubagentToolCallLink } from "@/subagents/tool-call-link";
import { SubagentToolCallRow } from "@/subagents/transcript-row";
export type { InlinePathTarget } from "@/assistant-file-links";
export type { AssistantForkTarget };

// M1 (docs/design.md "17. Motion", docs/ui-gap-gpt.md): new user/assistant message blocks fade
// and rise in. This is the `appear` motion shape (fade, no scale) plus a small initial
// translateY, built once at import time per docs/design.md's rule for module-scope Reanimated
// builders. `agent-stream/view.tsx` only ever passes `animateEntrance: true` for a message whose
// stream item id is genuinely new (`agent-stream/message-entrance.ts`) — never on re-render, list
// replacement, history pagination, or reconnect recovery, and never for anything already on
// screen when a chat is opened.
//
// Native only. A streaming assistant message is exactly the in-flow, size-can-change element
// `webAppearStyle`'s doc comment (`@/styles/motion`) warns about: it mounts near-empty and grows
// as paced text arrives. Reanimated's web layout-animation runtime takes an `entering` element
// out of flow (`position: absolute`, a size snapshot taken at mount) for the animation's
// duration; for content that keeps growing during that window the snapshot goes stale and the
// wrapper's parent collapses to it, so the turn footer that renders after it in flow draws on
// top of the still-growing text instead of below it. Web drives the same fade+rise with a CSS
// keyframe instead (`MESSAGE_ENTRANCE_RISE_BY` below), which only ever touches
// `opacity`/`transform` and never takes the wrapper out of flow.
const messageEntranceEntering = FadeIn.duration(MOTION_DURATION.slow).withInitialValues({
  transform: [{ translateY: 8 }],
});
const MESSAGE_ENTRANCE_RISE_BY = 8;

/**
 * Shared gate for the two message entrance call sites (`UserMessage`, `AssistantMessage`).
 * Entry/exit animations are also disabled on Android regardless of `animateEntrance`, matching
 * `agent-stream/view.tsx`'s `shouldDisableEntryExitAnimations` — RN dispatchDraw crashes on
 * Android with Reanimated entering animations (react-native-reanimated#8422).
 *
 * Returns the native Reanimated `entering` prop (`undefined` on web — see the comment above
 * `messageEntranceEntering`) plus the web CSS-keyframe style to merge onto the same wrapper.
 */
function useMessageEntranceAnimation(animateEntrance: boolean): {
  entering: typeof messageEntranceEntering | undefined;
  webStyle: object | undefined;
} {
  const reducedMotion = useAppReducedMotion();
  const disableEntryExitAnimations = Platform.OS === "android" || reducedMotion;
  // `agent-stream/view.tsx`'s `shouldAnimateMessageEntrance` runs inline on every render of this
  // item, and its entrance tracker marks the id "seen" (and starts returning `false`) the very
  // first time it is asked — often within the same tick, well before a 200ms animation could
  // finish, since a streaming message re-renders on nearly every arriving chunk. Reanimated's
  // native `entering` prop tolerates that: it is captured once at the component's initial mount
  // commit and ignores later prop changes. A plain web `style` prop has no such immunity — React
  // re-diffs it on every render, so removing `animationName` mid-flight would cancel the CSS
  // animation early. `useState`'s lazy initializer gives the web path the same "decided once at
  // mount" semantics as Reanimated's native one.
  const [shouldAnimate] = useState(animateEntrance);
  if (!shouldAnimate) {
    return { entering: undefined, webStyle: undefined };
  }
  return {
    entering: isWeb ? undefined : withMotion(disableEntryExitAnimations, messageEntranceEntering),
    webStyle: webAppearStyle(reducedMotion, { riseBy: MESSAGE_ENTRANCE_RISE_BY }),
  };
}

interface UserMessageProps {
  serverId?: string;
  agentId?: string;
  messageId?: string;
  message: string;
  images?: UserMessageImageAttachment[];
  attachments?: AgentAttachment[];
  timestamp: number;
  capabilities?: AgentCapabilityFlags;
  client?: DaemonClient | null;
  isFirstInGroup?: boolean;
  isLastInGroup?: boolean;
  isPending?: boolean;
  disableOuterSpacing?: boolean;
  /** Play the entrance fade+rise (M1). True only for a genuinely new message; see
   * `agent-stream/view.tsx`'s `shouldAnimateMessageEntrance`. */
  animateEntrance?: boolean;
}

const MessageOuterSpacingContext = createContext(false);

export function MessageOuterSpacingProvider({
  disableOuterSpacing,
  children,
}: {
  disableOuterSpacing: boolean;
  children: ReactNode;
}) {
  return (
    <MessageOuterSpacingContext.Provider value={disableOuterSpacing}>
      {children}
    </MessageOuterSpacingContext.Provider>
  );
}

function useDisableOuterSpacing(disableOuterSpacing: boolean | undefined) {
  const contextValue = useContext(MessageOuterSpacingContext);
  return disableOuterSpacing ?? contextValue;
}

const WEB_TOOLCALL_SHIMMER_KEYFRAME_ID = "paseo-toolcall-shimmer-keyframes";
const WEB_TOOLCALL_SHIMMER_ANIMATION_NAME = "paseo-toolcall-shimmer";
const MARKDOWN_ALLOWED_IMAGE_HANDLERS = [
  "data:image/png;base64",
  "data:image/gif;base64",
  "data:image/jpeg;base64",
  "https://",
  "http://",
] as const;
const MARKDOWN_TOP_LEVEL_MAX_EXCEEDED_ITEM = <Text key="dotdotdot">...</Text>;

const ThemedMicVocal = withUnistyles(MicVocal);
const ThemedFileSymlinkIcon = withUnistyles(FileSymlink);
const ThemedTriangleAlertIcon = withUnistyles(TriangleAlertIcon);
const ThemedChevronRightIcon = withUnistyles(ChevronRight);
const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const ThemedNotificationInfo = withUnistyles(Info);
const ThemedNotificationWarning = withUnistyles(TriangleAlertIcon);
const ThemedNotificationError = withUnistyles(XCircle);

const foregroundColorMapping = (theme: Theme) => ({ color: theme.colors.foreground });
const foregroundMutedColorMapping = (theme: Theme) => ({
  color: theme.colors.foregroundMuted,
});
const mutedForegroundColorMapping = (theme: Theme) => ({
  color: theme.colors.mutedForeground,
});
const destructiveColorMapping = (theme: Theme) => ({ color: theme.colors.destructive });
const infoColorMapping = (theme: Theme) => ({ color: theme.colors.palette.blue[300] });
const warningColorMapping = (theme: Theme) => ({ color: theme.colors.palette.amber[500] });
const WEB_TOOLCALL_SHIMMER_KEYFRAME_CSS = `
  @keyframes ${WEB_TOOLCALL_SHIMMER_ANIMATION_NAME} {
    0% {
      background-position: var(--paseo-shimmer-start, -200px) 0;
    }
    100% {
      background-position: var(--paseo-shimmer-end, 200px) 0;
    }
  }
`;
let webToolCallShimmerRegistered = false;
const SCROLL_EDGE_EPSILON = 0.5;

// Font size for stream metadata (timestamps, durations, live elapsed timer).
// Lives between theme.fontSize.sm (12) and theme.fontSize.base (14); no token.
export const STREAM_METADATA_FONT_SIZE = 13;
type ScrollAxis = "x" | "y";

function ensureWebToolCallShimmerKeyframes() {
  if (isNative) {
    return;
  }
  if (typeof document === "undefined") {
    return;
  }
  const existing = document.getElementById(WEB_TOOLCALL_SHIMMER_KEYFRAME_ID);
  if (existing) {
    if (existing.textContent !== WEB_TOOLCALL_SHIMMER_KEYFRAME_CSS) {
      existing.textContent = WEB_TOOLCALL_SHIMMER_KEYFRAME_CSS;
    }
    webToolCallShimmerRegistered = true;
    return;
  }
  if (webToolCallShimmerRegistered) {
    return;
  }
  const styleElement = document.createElement("style");
  styleElement.id = WEB_TOOLCALL_SHIMMER_KEYFRAME_ID;
  styleElement.textContent = WEB_TOOLCALL_SHIMMER_KEYFRAME_CSS;
  document.head.appendChild(styleElement);
  webToolCallShimmerRegistered = true;
}

function getWheelEventElementTarget(event: WheelEvent, fallback: HTMLElement): HTMLElement {
  const { target } = event;
  if (target instanceof HTMLElement) {
    return target;
  }
  if (target instanceof Node && target.parentElement) {
    return target.parentElement;
  }
  return fallback;
}

function canElementScrollInDirection(
  element: HTMLElement,
  axis: ScrollAxis,
  delta: number,
): boolean {
  if (delta === 0) {
    return false;
  }

  const computedStyle = window.getComputedStyle(element);
  const overflow = axis === "x" ? computedStyle.overflowX : computedStyle.overflowY;
  const isScrollableOverflow =
    overflow === "auto" || overflow === "scroll" || overflow === "overlay";
  if (!isScrollableOverflow) {
    return false;
  }

  const scrollPosition = axis === "x" ? element.scrollLeft : element.scrollTop;
  const scrollSize =
    axis === "x"
      ? element.scrollWidth - element.clientWidth
      : element.scrollHeight - element.clientHeight;
  if (scrollSize <= SCROLL_EDGE_EPSILON) {
    return false;
  }

  if (delta > 0) {
    return scrollPosition < scrollSize - SCROLL_EDGE_EPSILON;
  }
  return scrollPosition > SCROLL_EDGE_EPSILON;
}

function canScrollInsideDetailFromTarget(
  detailRoot: HTMLElement,
  startElement: HTMLElement,
  axis: ScrollAxis,
  delta: number,
): boolean {
  if (delta === 0) {
    return false;
  }

  let current: HTMLElement | null = startElement;
  while (current) {
    if (canElementScrollInDirection(current, axis, delta)) {
      return true;
    }
    if (current === detailRoot) {
      break;
    }
    current = current.parentElement;
  }
  return false;
}

function shouldStopDetailWheelPropagation(detailRoot: HTMLElement, event: WheelEvent): boolean {
  const startElement = getWheelEventElementTarget(event, detailRoot);
  const verticalDelta = event.deltaY;
  let horizontalDelta: number;
  if (event.deltaX !== 0) horizontalDelta = event.deltaX;
  else if (event.shiftKey) horizontalDelta = event.deltaY;
  else horizontalDelta = 0;

  const hasVerticalIntent = Math.abs(verticalDelta) > SCROLL_EDGE_EPSILON;
  const hasHorizontalIntent = Math.abs(horizontalDelta) > SCROLL_EDGE_EPSILON;
  if (!hasVerticalIntent && !hasHorizontalIntent) {
    return false;
  }

  const canScrollVertically = hasVerticalIntent
    ? canScrollInsideDetailFromTarget(detailRoot, startElement, "y", verticalDelta)
    : false;
  const canScrollHorizontally = hasHorizontalIntent
    ? canScrollInsideDetailFromTarget(detailRoot, startElement, "x", horizontalDelta)
    : false;

  if (hasVerticalIntent && hasHorizontalIntent) {
    const isVerticalDominant = Math.abs(verticalDelta) >= Math.abs(horizontalDelta);
    return isVerticalDominant
      ? canScrollVertically || canScrollHorizontally
      : canScrollHorizontally || canScrollVertically;
  }

  if (hasVerticalIntent) {
    return canScrollVertically;
  }
  return canScrollHorizontally;
}

const userMessageStylesheet = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    justifyContent: "flex-end",
    ...(isWeb ? { userSelect: "text" as const } : {}),
  },
  content: {
    alignItems: "flex-end",
    maxWidth: "100%",
    cursor: "auto",
  },
  containerSpacing: {
    marginBottom: theme.spacing[1],
  },
  containerFirstInGroup: {
    marginTop: theme.spacing[4],
  },
  containerLastInGroup: {
    marginBottom: theme.spacing[4],
  },
  bubble: {
    // `secondary` rather than `surface3`: the bubble marks who is speaking, and at surface3 it
    // was a filled slab competing with the agent's prose for attention. `secondary` resolves to
    // `surfaceComposer` — the same raised fill the composer card itself uses (Codex parity).
    backgroundColor: theme.colors.secondary,
    // Uniform corners, flat fill, no hairline — Codex's own user bubble has no border; the
    // fill against canvas is contrast enough (docs/design.md §16, mockup `.user div`).
    borderRadius: theme.borderRadius.xl,
    paddingHorizontal: theme.spacing[3.5],
    paddingVertical: theme.spacing[2.5],
    minWidth: 0,
    flexShrink: 1,
  },
  // 15px / 1.5 line-height is a pinned literal matching the Codex reference bubble exactly
  // (docs/design.md §16 "Finish" pinned-literal convention), not `fontSize.content`.
  text: {
    color: theme.colors.foreground,
    fontFamily: theme.fontFamily.content,
    fontSize: 15,
    ...(isWeb
      ? {
          lineHeight: 22.5,
          overflowWrap: "anywhere" as const,
        }
      : {}),
  },
  pathLink: {
    textDecorationLine: "underline",
  },
  imagePreviewContainer: {
    flexDirection: "row",
    gap: theme.spacing[2],
    flexWrap: "wrap",
  },
  attachmentPreviewContainer: {
    flexDirection: "row",
    gap: theme.spacing[2],
    flexWrap: "wrap",
  },
  imagePreviewSpacing: {
    marginBottom: theme.spacing[2],
  },
  copyButton: {
    alignSelf: "center",
    padding: theme.spacing[1],
    paddingTop: theme.spacing[1],
    marginTop: 0,
    marginRight: -theme.spacing[1],
  },
  trailingRow: {
    alignSelf: "flex-end",
    flexDirection: "row",
    alignItems: "center",
    height: 24,
    gap: theme.spacing[2],
    marginTop: theme.spacing[2],
  },
  trailingRowHidden: {
    opacity: 0,
  },
  trailingRowVisible: {
    opacity: 1,
  },
  timestampText: {
    color: theme.colors.foregroundMuted,
    fontSize: STREAM_METADATA_FONT_SIZE,
  },
  identityRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: theme.spacing[1.5],
    marginTop: theme.spacing[1],
  },
  identityName: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
  },
  identityAvatar: {
    width: 24,
    height: 24,
    borderRadius: theme.borderRadius.full,
    alignItems: "center",
    justifyContent: "center",
  },
  identityAvatarInitial: {
    color: "#ffffff",
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
}));

interface UserMessageImagePillProps {
  image: UserMessageImageAttachment;
  onOpen: (image: UserMessageImageAttachment) => void;
  accessibilityLabel: string;
}

function UserMessageImagePill({ image, onOpen, accessibilityLabel }: UserMessageImagePillProps) {
  const handlePress = useCallback(() => {
    onOpen(image);
  }, [onOpen, image]);
  return (
    <AttachmentFrame onPress={handlePress} accessibilityLabel={accessibilityLabel}>
      <AttachmentThumbnail metadata={image} />
    </AttachmentFrame>
  );
}

/** Sender name + 24px identity avatar under the bubble. Desktop only, and only
 * when the message's host has a badge (follows that host's own visibility setting).
 * Renders identically for an optimistic local echo and its canonical replacement —
 * the host badge is known locally at submit time, so gating on pending status would
 * mount/unmount this row when the canonical echo arrives and shift the message's
 * height (see e2e/browser/agent-consecutive-turns.spec.ts, "keeps a submitted
 * message height stable when its canonical echo arrives"). */
function UserMessageIdentityRow({ hostBadge }: { hostBadge: HostBadgeModel | null }) {
  if (!hostBadge) {
    return null;
  }
  const avatarColorName = resolveUserMessageAvatarColorName(hostBadge);
  const avatarStyle = avatarColorName
    ? [userMessageStylesheet.identityAvatar, { backgroundColor: identityColor(avatarColorName) }]
    : userMessageStylesheet.identityAvatar;
  return (
    <View style={userMessageStylesheet.identityRow} testID="user-message-identity">
      <Text style={userMessageStylesheet.identityName} numberOfLines={1}>
        {hostBadge.label}
      </Text>
      <View style={avatarStyle}>
        <Text style={userMessageStylesheet.identityAvatarInitial}>
          {hostBadge.label.charAt(0).toLocaleUpperCase()}
        </Text>
      </View>
    </View>
  );
}

/** The message's host badge, following that host's own badge visibility setting. */
function useUserMessageHostBadge(input: {
  serverId: string | undefined;
  enabled: boolean;
}): HostBadgeModel | null {
  const badges = useHostBadges({ enabled: input.enabled });
  return badges.get(input.serverId ?? "") ?? null;
}

/**
 * Splits a user message into path-linkable segments, or null when there's nothing to split:
 * either the text has no path-shaped substrings, or — true everywhere today — no
 * AssistantFileLinkResolverProvider is mounted around this message yet (see
 * useOptionalAssistantFileLinkResolverContext's own comment). Null renders the plain message
 * text exactly as before.
 */
function useUserMessagePathSegments(message: string, hasText: boolean): TextPathSegment[] | null {
  const resolverContext = useOptionalAssistantFileLinkResolverContext();
  const workspaceRoot = resolverContext?.configRef.current.workspaceRoot;
  return useMemo(() => {
    if (!hasText || !resolverContext) {
      return null;
    }
    const segments = splitTextIntoPathSegments(message, { workspaceRoot });
    return segments.some((segment) => segment.type === "path") ? segments : null;
  }, [hasText, message, resolverContext, workspaceRoot]);
}

const MESSAGE_TEXT_DATASET = { messageText: "true" };
// Shared stable reference (see CONTENT_SURFACE_DATASET's comment) carrying both the
// prose font-routing tag and chat find's messageText tag on the same element.
const MESSAGE_PROSE_DATASET = { ...CONTENT_SURFACE_DATASET, ...MESSAGE_TEXT_DATASET };

export const UserMessage = memo(function UserMessage({
  serverId,
  agentId,
  messageId,
  message,
  images = [],
  attachments = [],
  timestamp,
  capabilities,
  client,
  isFirstInGroup = true,
  isLastInGroup = true,
  isPending = false,
  disableOuterSpacing,
  animateEntrance = false,
}: UserMessageProps) {
  const isCompact = useIsCompactFormFactor();
  const { t } = useTranslation();
  const { entering: entranceEntering, webStyle: entranceWebStyle } =
    useMessageEntranceAnimation(animateEntrance);
  const [isHovered, setIsHovered] = useState(false);
  const [lightboxMetadata, setLightboxMetadata] = useState<UserMessageImageAttachment | null>(null);
  const handleLightboxClose = useCallback(() => setLightboxMetadata(null), []);
  const lightboxSource = useMemo<ImageLightboxSource | null>(
    () => (lightboxMetadata ? { type: "attachment", metadata: lightboxMetadata } : null),
    [lightboxMetadata],
  );
  const resolvedDisableOuterSpacing = useDisableOuterSpacing(disableOuterSpacing);
  const hasText = message.trim().length > 0;
  const pathSegments = useUserMessagePathSegments(message, hasText);
  const hasImages = images.length > 0;
  const hasAttachments = attachments.length > 0;
  const showTrailingRow = !isPending && hasText && (isCompact || isNative || isHovered);
  const formattedTimestamp = useMemo(
    () => formatMessageTimestamp(new Date(timestamp)),
    [timestamp],
  );
  const rewindMutation = useRewindAgentMutation({ serverId, agentId, client, messageId });
  // Sender identity is desktop-only chrome, and only ever shows what the app already
  // knows: the host badge for this message's server, following that host's own badge
  // visibility setting. No host badge means no identity row — never a placeholder.
  const hostBadge = useUserMessageHostBadge({ serverId, enabled: !isCompact });

  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const getMessageContent = useCallback(() => message, [message]);
  const handleRewind = useCallback(
    (input: { mode: RewindMode; rewoundText: string }) => {
      return rewindMutation.rewindAgent(input);
    },
    [rewindMutation],
  );

  const containerStyle = useMemo(
    () => [
      userMessageStylesheet.container,
      !resolvedDisableOuterSpacing && [
        isFirstInGroup ? userMessageStylesheet.containerFirstInGroup : null,
        isLastInGroup ? userMessageStylesheet.containerLastInGroup : null,
        !isFirstInGroup || !isLastInGroup ? userMessageStylesheet.containerSpacing : null,
      ],
      entranceWebStyle,
    ],
    [resolvedDisableOuterSpacing, isFirstInGroup, isLastInGroup, entranceWebStyle],
  );
  const imagePreviewContainerStyle = useMemo(
    () => [
      userMessageStylesheet.imagePreviewContainer,
      hasText || hasAttachments ? userMessageStylesheet.imagePreviewSpacing : undefined,
    ],
    [hasAttachments, hasText],
  );
  const attachmentPreviewContainerStyle = useMemo(
    () => [
      userMessageStylesheet.attachmentPreviewContainer,
      hasText ? userMessageStylesheet.imagePreviewSpacing : undefined,
    ],
    [hasText],
  );
  const trailingRowStyle = useMemo(
    () => [
      userMessageStylesheet.trailingRow,
      showTrailingRow
        ? userMessageStylesheet.trailingRowVisible
        : userMessageStylesheet.trailingRowHidden,
    ],
    [showTrailingRow],
  );

  return (
    <Animated.View
      entering={entranceEntering}
      style={containerStyle}
      testID="user-message"
      aria-busy={isPending}
    >
      <View
        style={userMessageStylesheet.content}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
      >
        <View style={userMessageStylesheet.bubble}>
          {hasImages ? (
            <View style={imagePreviewContainerStyle}>
              {images.map((image) => (
                <UserMessageImagePill
                  key={image.id}
                  image={image}
                  onOpen={setLightboxMetadata}
                  accessibilityLabel={t("composer.attachments.openImage")}
                />
              ))}
            </View>
          ) : null}
          {hasAttachments ? (
            <View style={attachmentPreviewContainerStyle}>
              {attachments.map((attachment, index) => {
                const content = getAgentAttachmentPillContent(attachment, t);
                return (
                  <AttachmentFrame
                    key={`${attachment.type}:${"number" in attachment ? attachment.number : index}`}
                  >
                    <AttachmentLabel
                      icon={content.icon}
                      title={content.title}
                      subtitle={content.subtitle}
                    />
                  </AttachmentFrame>
                );
              })}
            </View>
          ) : null}
          {hasText ? (
            <Text selectable dataSet={MESSAGE_PROSE_DATASET} style={userMessageStylesheet.text}>
              {pathSegments
                ? pathSegments.map((segment) =>
                    segment.type === "path" ? (
                      <UserMessagePathSegmentLink key={segment.start} raw={segment.raw} />
                    ) : (
                      segment.text
                    ),
                  )
                : message}
            </Text>
          ) : null}
        </View>
        <UserMessageIdentityRow hostBadge={hostBadge} />
        {hasText ? (
          <View
            style={trailingRowStyle}
            pointerEvents={showTrailingRow ? "auto" : "none"}
            testID="user-message-trailing-row"
          >
            <Text style={userMessageStylesheet.timestampText} testID="user-message-timestamp">
              {formattedTimestamp}
            </Text>
            {capabilities && messageId ? (
              <RewindMenu
                capabilities={capabilities}
                isPending={rewindMutation.isPending}
                rewoundText={message}
                onRewind={handleRewind}
              />
            ) : null}
            <TurnCopyButton
              getContent={getMessageContent}
              containerStyle={userMessageStylesheet.copyButton}
              accessibilityLabel={t("message.actions.copyMessage")}
            />
          </View>
        ) : null}
      </View>
      <AttachmentLightbox source={lightboxSource} onClose={handleLightboxClose} />
    </Animated.View>
  );
});

/**
 * One path-shaped run inside a user message (see splitTextIntoPathSegments, called from
 * UserMessage above only once a resolver context exists). Nested inside the message's own
 * selectable <Text>, so the bubble stays one selectable/copyable block — only this run is also
 * pressable. Reuses useFileLink for opening, the same hook every other file link goes through,
 * so there's one open path, not two. Safe to call the throwing context hook here: this component
 * mounts only when UserMessage already confirmed a provider is present.
 */
function UserMessagePathSegmentLink({ raw }: { raw: string }) {
  const source = useMemo<AssistantFileLinkSource>(() => ({ href: raw, text: raw }), [raw]);
  const { target, onPress, open } = useFileLink(source);
  const { configRef } = useAssistantFileLinkResolverContext();
  const handleOpenToSide = useCallback(() => open(source, "side"), [open, source]);

  if (!target) {
    return <Text>{raw}</Text>;
  }

  return (
    <ContextMenu>
      <UserMessagePathLinkMenuMount
        raw={raw}
        target={target}
        serverId={configRef.current.serverId}
        workspaceRoot={configRef.current.workspaceRoot}
        onPress={onPress}
        onOpenToSide={handleOpenToSide}
      />
    </ContextMenu>
  );
}

interface UserMessagePathLinkMenuMountProps {
  raw: string;
  target: InlinePathTarget;
  serverId?: string;
  workspaceRoot?: string;
  onPress: () => void;
  onOpenToSide: () => void;
}

function UserMessagePathLinkMenuMount({
  raw,
  target,
  serverId,
  workspaceRoot,
  onPress,
  onOpenToSide,
}: UserMessagePathLinkMenuMountProps) {
  const { onLongPress, onContextMenu } = useLinkActionsMenuGesture();
  return (
    <>
      <Text
        style={userMessageStylesheet.pathLink}
        onPress={onPress}
        onLongPress={isNative ? onLongPress : undefined}
        // @ts-ignore - onContextMenu is web-only and not in RN types.
        onContextMenu={isWeb ? onContextMenu : undefined}
      >
        {raw}
      </Text>
      <LinkActionsMenuContent
        target={target}
        serverId={serverId}
        workspaceRoot={workspaceRoot}
        onOpen={onPress}
        onOpenToSide={onOpenToSide}
        testIDPrefix="user-message-file-link"
      />
    </>
  );
}

/** Copy and fork stay visible under an answer; hovering brings them to full strength. */
const IDLE_ACTIONS_OPACITY = 0.55;

interface AssistantTurnFooterProps {
  getContent: () => string;
  completedAt?: Date;
  durationMs?: number | null;
  onFork?: (target: AssistantForkTarget) => Promise<void> | void;
}

const assistantTurnFooterStylesheet = StyleSheet.create((theme) => ({
  // MS1 (docs/hover.md canonical pattern): the hover-tracking element carries nothing but
  // `position: relative` — all real layout lives on `actionsRow` below, so the tracker's own
  // bounding box never changes shape and can't cause a hover flicker.
  container: {
    position: "relative",
  },
  actionsRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  copyButton: {
    alignSelf: "center",
    padding: theme.spacing[1],
    paddingTop: theme.spacing[1],
    marginTop: 0,
    marginLeft: -theme.spacing[1],
  },
  labelWrapper: {
    position: "relative",
  },
  labelSizer: {
    color: theme.colors.foregroundMuted,
    fontSize: STREAM_METADATA_FONT_SIZE,
    opacity: 0,
    ...theme.tabularNums,
  },
  labelOverlay: {
    position: "absolute",
    top: 0,
    left: 0,
    color: theme.colors.foregroundMuted,
    fontSize: STREAM_METADATA_FONT_SIZE,
    ...theme.tabularNums,
  },
}));

const TIMESTAMP_REVEAL_MS = 3000;

/**
 * Footer rendered next to the copy button at the end of an assistant turn.
 * Shows the turn duration and swaps to the end timestamp when both are known.
 * A turn without a visible start shows its end timestamp directly.
 */
export const AssistantTurnFooter = memo(function AssistantTurnFooter({
  getContent,
  completedAt,
  durationMs,
  onFork,
}: AssistantTurnFooterProps) {
  // MS1: `isHovered` now drives the whole row's visibility (see the hover-tracking `View`
  // below), not just the timestamp swap — so it has to live on that outer plain `View`, per
  // docs/hover.md, rather than on the label's own `Pressable` as before. The label's swap
  // behaviour (duration <-> timestamp) is unchanged; only the source of the hover signal moved.
  const [isHovered, setIsHovered] = useState(false);
  const [pressedReveal, setPressedReveal] = useState(false);
  const revealTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reducedMotion = useAppReducedMotion();

  useEffect(() => {
    return () => {
      if (revealTimerRef.current) {
        clearTimeout(revealTimerRef.current);
        revealTimerRef.current = null;
      }
    };
  }, []);

  const { t } = useTranslation();
  const durationLabel = useMemo(
    () =>
      durationMs !== undefined && durationMs !== null
        ? t("agentStream.turnFold.workedFor", { duration: formatDuration(durationMs) })
        : "",
    [durationMs, t],
  );
  const timestampLabel = useMemo(
    () => (completedAt ? formatMessageTimestamp(completedAt) : ""),
    [completedAt],
  );

  // The time the turn ended leads; the duration is one hover away. A finished turn's work already
  // reads "Worked for …" on the fold row above its answer (agent-stream/turn-fold-row.tsx).
  const primaryLabel = timestampLabel || durationLabel;
  const canSwap = Boolean(durationLabel && timestampLabel);
  const showDuration = canSwap && (isWeb ? isHovered : pressedReveal);

  // Codex keeps copy and fork in view under an answer, so they are always shown here, quieter
  // until the row is hovered (docs/hover.md's `isHovered || isNative` sets full strength).
  const showActions = isHovered || isNative;
  const actionsOpacity = useSharedValue(showActions ? 1 : IDLE_ACTIONS_OPACITY);
  useEffect(() => {
    const target = showActions ? 1 : IDLE_ACTIONS_OPACITY;
    actionsOpacity.value = reducedMotion
      ? target
      : withTiming(target, { duration: MOTION_DURATION.fast, easing: MOTION_EASING.standard });
  }, [showActions, reducedMotion, actionsOpacity]);
  const actionsAnimatedStyle = useAnimatedStyle(() => ({ opacity: actionsOpacity.value }));
  const actionsRowStyle = useMemo(
    () => [assistantTurnFooterStylesheet.actionsRow, actionsAnimatedStyle],
    [actionsAnimatedStyle],
  );

  const handlePointerEnter = useCallback(() => setIsHovered(true), []);
  const handlePointerLeave = useCallback(() => setIsHovered(false), []);
  const handlePress = useCallback(() => {
    if (isWeb || !canSwap) return;
    if (revealTimerRef.current) {
      clearTimeout(revealTimerRef.current);
    }
    setPressedReveal((prev) => !prev);
    revealTimerRef.current = setTimeout(() => {
      setPressedReveal(false);
      revealTimerRef.current = null;
    }, TIMESTAMP_REVEAL_MS);
  }, [canSwap]);
  const handleFork = useCallback(
    (target: AssistantForkTarget) => {
      return onFork?.(target);
    },
    [onFork],
  );
  const canFork = Boolean(onFork);

  return (
    <View
      style={assistantTurnFooterStylesheet.container}
      onPointerEnter={handlePointerEnter}
      onPointerLeave={handlePointerLeave}
    >
      <Animated.View style={actionsRowStyle}>
        <TurnCopyButton
          getContent={getContent}
          containerStyle={assistantTurnFooterStylesheet.copyButton}
        />
        {canFork ? <AssistantForkMenu onFork={handleFork} /> : null}
        {primaryLabel ? (
          <Pressable
            onPress={handlePress}
            accessibilityRole={canSwap ? "button" : undefined}
            accessibilityLabel={
              canSwap ? `${durationLabel}, ended ${timestampLabel}` : primaryLabel
            }
          >
            <View style={assistantTurnFooterStylesheet.labelWrapper}>
              {/* Sizer reserves space for whichever label is longer so the
                  container width is stable across hover transitions. */}
              <Text style={assistantTurnFooterStylesheet.labelSizer} aria-hidden>
                {primaryLabel.length >= durationLabel.length ? primaryLabel : durationLabel}
              </Text>
              <Text style={assistantTurnFooterStylesheet.labelOverlay}>
                {showDuration ? durationLabel : primaryLabel}
              </Text>
            </View>
          </Pressable>
        ) : null}
      </Animated.View>
    </View>
  );
});

interface LiveElapsedProps {
  startedAt: Date;
  active?: boolean;
  style?: StyleProp<TextStyle>;
  testID?: string;
}

/**
 * Ticks every second to render an elapsed duration. Isolated from parents so
 * only this component re-renders on each tick.
 */
export const LiveElapsed = memo(function LiveElapsed({
  startedAt,
  active = true,
  style,
  testID,
}: LiveElapsedProps) {
  const startedAtMs = startedAt.getTime();
  const [elapsedMs, setElapsedMs] = useState(() => Math.max(0, Date.now() - startedAtMs));
  const visibleElapsedMs = active ? Math.max(0, Date.now() - startedAtMs) : elapsedMs;

  useEffect(() => {
    if (!active) {
      return;
    }
    setElapsedMs(Math.max(0, Date.now() - startedAtMs));
    const handle = setInterval(() => {
      setElapsedMs(Math.max(0, Date.now() - startedAtMs));
    }, 1000);
    return () => clearInterval(handle);
  }, [active, startedAtMs]);

  return (
    <Text style={style} testID={testID}>
      {formatDuration(visibleElapsedMs)}
    </Text>
  );
});

interface AssistantMessageProps {
  renderFullContent?: boolean;
  occurrenceKey: string;
  message: string;
  timestamp: number;
  workspaceRoot?: string;
  serverId?: string;
  client?: DaemonClient | null;
  spacing?: "default" | "compactTop" | "compactBottom" | "compactBoth";
  phase: MarkdownPhase;
  /** Play the entrance fade+rise (M1). True only for a genuinely new message; see
   * `agent-stream/view.tsx`'s `shouldAnimateMessageEntrance`. */
  animateEntrance?: boolean;
}

export const assistantMessageStylesheet = StyleSheet.create((theme) => ({
  container: {
    paddingVertical: theme.spacing[3],
    ...(isWeb ? { userSelect: "text" as const } : {}),
  },
  containerCompactTop: {
    paddingTop: 0,
  },
  containerCompactBottom: {
    paddingBottom: 0,
  },
  cappedNotice: {
    marginTop: theme.spacing[3],
    fontFamily: theme.fontFamily.ui,
    fontSize: theme.fontSize.base,
    fontStyle: "italic",
    color: theme.colors.foregroundMuted,
  },
  imageFrame: {
    width: "100%",
    minHeight: 160,
    marginHorizontal: -theme.spacing[1],
  },
  imageSurface: {
    width: "100%",
    overflow: "hidden",
    position: "relative",
  },
  image: {
    width: "100%",
    height: "100%",
  },
  imageLoadingOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    alignItems: "center",
    justifyContent: "center",
  },
  imageState: {
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[6],
    gap: theme.spacing[2],
  },
  imageErrorText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    textAlign: "center",
  },
}));

function AssistantMarkdownImage({
  source,
  occurrenceKey,
  alt,
  hasLeadingContent,
  client,
  workspaceRoot,
  serverId,
}: {
  source: string;
  occurrenceKey: string;
  alt?: string;
  hasLeadingContent: boolean;
  client?: DaemonClient | null;
  workspaceRoot?: string;
  serverId?: string;
}) {
  const { t } = useTranslation();
  const [viewerOpen, setViewerOpen] = useState(false);
  const openViewer = useCallback(() => setViewerOpen(true), []);
  const closeViewer = useCallback(() => setViewerOpen(false), []);
  const containerStyle = useMemo<StyleProp<ViewStyle>>(
    () => ({
      marginTop: hasLeadingContent ? 16 : 0,
      marginBottom: 0,
    }),
    [hasLeadingContent],
  );
  const image = useAssistantImage({
    source,
    occurrenceKey,
    client,
    workspaceRoot,
    serverId,
  });
  const binding = image.status === "failed" ? null : image.binding;
  const aspectRatio = image.status === "failed" ? null : image.aspectRatio;
  const imageUri = binding?.uri ?? "";
  const imageSource = useMemo(() => ({ uri: imageUri }), [imageUri]);
  const frameStyle = useMemo<StyleProp<ViewStyle>>(
    () => [assistantMessageStylesheet.imageFrame, containerStyle],
    [containerStyle],
  );
  const imageSizeStyle = useMemo<ViewStyle>(() => {
    if (image.status === "failed") return { height: 160 };
    return { aspectRatio: aspectRatio ?? ASSISTANT_IMAGE_DEFAULT_ASPECT_RATIO };
  }, [aspectRatio, image.status]);
  const surfaceStyle = useMemo<StyleProp<ViewStyle>>(
    () => [assistantMessageStylesheet.imageSurface, imageSizeStyle],
    [imageSizeStyle],
  );
  const lightboxSource = useMemo<ImageLightboxSource | null>(() => {
    if (!viewerOpen || !imageUri) return null;
    return {
      type: "uri",
      uri: imageUri,
      contentSize: aspectRatio ? { width: aspectRatio, height: 1 } : undefined,
    };
  }, [aspectRatio, imageUri, viewerOpen]);

  const stateFrameStyle = useMemo<StyleProp<ViewStyle>>(
    () => [
      assistantMessageStylesheet.imageFrame,
      containerStyle,
      imageSizeStyle,
      assistantMessageStylesheet.imageState,
    ],
    [containerStyle, imageSizeStyle],
  );
  const copyDataSet = useMemo(() => markdownCopyImageDataSet(source, alt), [source, alt]);

  if (image.status === "failed") {
    return (
      <View style={stateFrameStyle} dataSet={copyDataSet}>
        <Text style={assistantMessageStylesheet.imageErrorText}>{image.message}</Text>
      </View>
    );
  }

  if (!binding) {
    return (
      <View style={stateFrameStyle} dataSet={copyDataSet}>
        <ThemedLoadingSpinner size="small" uniProps={foregroundMutedColorMapping} />
      </View>
    );
  }

  return (
    <View style={frameStyle} dataSet={copyDataSet}>
      <Pressable
        accessibilityLabel={t("composer.attachments.openImage")}
        accessibilityRole="button"
        disabled={image.status !== "loaded"}
        onPress={openViewer}
        style={surfaceStyle}
      >
        <View
          style={assistantMessageStylesheet.image}
          accessibilityRole="image"
          accessibilityLabel={alt}
        >
          <Image
            ref={binding.onRef}
            source={imageSource}
            style={assistantMessageStylesheet.image}
            resizeMode="contain"
            onLoad={binding.onLoad}
            onError={binding.onError}
          />
          {image.status === "loading" ? (
            <View pointerEvents="none" style={assistantMessageStylesheet.imageLoadingOverlay}>
              <ThemedLoadingSpinner size="small" uniProps={foregroundMutedColorMapping} />
            </View>
          ) : null}
        </View>
      </Pressable>
      <AttachmentLightbox source={lightboxSource} onClose={closeViewer} />
    </View>
  );
}

function getInlineCodeAutoLinkUrl(markdownParser: MarkdownIt, content: string): string | null {
  const trimmed = content.trim();
  if (!trimmed) {
    return null;
  }

  const matches:
    | {
        index: number;
        lastIndex: number;
        url: string;
      }[]
    | null = markdownParser.linkify.match(trimmed);
  if (!matches || matches.length !== 1) {
    return null;
  }

  const [match] = matches;
  if (!match || match.index !== 0 || match.lastIndex !== trimmed.length) {
    return null;
  }

  return match.url;
}

function getInlineCodeAutoLinkSource(input: {
  href: string;
  content: string;
}): AssistantFileLinkSource {
  return {
    href: input.href,
    text: input.content,
    markup: "linkify",
    sourceInfo: "auto",
  };
}

interface AssistantMarkdownAstNode extends ASTNode {
  sourceInfo?: string;
}

function getMarkdownLinkSource(node: AssistantMarkdownAstNode): AssistantFileLinkSource {
  return {
    href: typeof node.attributes?.href === "string" ? node.attributes.href : "",
    text: getMarkdownNodeText(node),
    title: typeof node.attributes?.title === "string" ? node.attributes.title : undefined,
    markup: node.markup,
    sourceInfo: node.sourceInfo,
    sourceType: node.sourceType === "inline-code" ? "inline-code" : undefined,
  };
}

function getMarkdownNodeText(node: ASTNode): string {
  if (!node.children.length) {
    return node.content ?? "";
  }

  return node.children.map(getMarkdownNodeText).join("");
}

function nodeHasParentType(parent: unknown, type: string): boolean {
  if (Array.isArray(parent)) {
    return parent.some((entry) => entry?.type === type);
  }

  return (
    typeof parent === "object" &&
    parent !== null &&
    "type" in parent &&
    (parent as Record<"type", unknown>)["type"] === type
  );
}

const turnCopyButtonStylesheet = StyleSheet.create((theme) => ({
  container: {
    alignSelf: "flex-start",
    padding: theme.spacing[2],
    paddingTop: 0,
    marginTop: theme.spacing[2],
  },
  iconColor: {
    color: theme.colors.foregroundMuted,
  },
  iconHoveredColor: {
    color: theme.colors.foreground,
  },
}));

interface TurnCopyButtonProps {
  getContent: () => string;
  containerStyle?: StyleProp<ViewStyle>;
  accessibilityLabel?: string;
  copiedAccessibilityLabel?: string;
}

export const TurnCopyButton = memo(function TurnCopyButton({
  getContent,
  containerStyle,
  accessibilityLabel,
  copiedAccessibilityLabel,
}: TurnCopyButtonProps) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const handleCopy = useCallback(async () => {
    const content = getContent();
    if (!content) {
      return;
    }

    await writeMarkdownToRichClipboard(content, getDefaultMarkdownClipboardEnvironment());
    setCopied(true);

    if (copyTimeoutRef.current) {
      clearTimeout(copyTimeoutRef.current);
    }

    copyTimeoutRef.current = setTimeout(() => {
      setCopied(false);
      copyTimeoutRef.current = null;
    }, 1500);
  }, [getContent]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current) {
        clearTimeout(copyTimeoutRef.current);
      }
    };
  }, []);

  const pressableStyle = useMemo(
    () => [turnCopyButtonStylesheet.container, containerStyle],
    [containerStyle],
  );

  return (
    <Pressable
      onPress={handleCopy}
      style={pressableStyle}
      accessibilityRole="button"
      accessibilityLabel={
        copied
          ? (copiedAccessibilityLabel ?? t("message.actions.copied"))
          : (accessibilityLabel ?? t("message.actions.copyTurn"))
      }
    >
      {({ hovered }) => {
        const iconColor = hovered
          ? turnCopyButtonStylesheet.iconHoveredColor.color
          : turnCopyButtonStylesheet.iconColor.color;
        return copied ? (
          <Check size={ICON_SIZE.sm} color={iconColor} />
        ) : (
          <Copy size={ICON_SIZE.sm} color={iconColor} />
        );
      }}
    </Pressable>
  );
});

const expandableBadgeStylesheet = StyleSheet.create((theme) => ({
  container: {
    marginHorizontal: -13,
  },
  containerSpacing: {
    marginBottom: theme.spacing[1],
  },
  containerLastInSequence: {
    marginBottom: theme.spacing[4],
  },
  // `md` — the row radius (docs/design.md "Finish") — the activity row expands in
  // place rather than navigating, so it reads as a row, not a card.
  pressable: {
    borderRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderColor: "transparent",
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    overflow: "hidden",
  },
  pressablePressed: {
    opacity: 0.9,
  },
  pressableActivitySummaryHighlighted: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  trailingChevron: {
    flexShrink: 0,
    marginLeft: theme.spacing[1],
  },
  labelRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  iconBadge: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginRight: theme.spacing[1],
    backgroundColor: "transparent",
  },
  // 13.5px / foregroundExtraMuted — a quiet one-line row, quieter than the app's
  // usual foregroundMuted metadata tier (docs/design.md §16, Codex parity).
  label: {
    color: theme.colors.foregroundExtraMuted,
    fontSize: 13.5,
    fontWeight: theme.fontWeight.normal,
    flexShrink: 0,
  },
  labelActive: {
    color: theme.colors.foreground,
  },
  labelLoading: {
    color: theme.colors.foreground,
    opacity: 0.72,
  },
  secondaryLabel: {
    flexShrink: 1,
    minWidth: 0,
    color: theme.colors.foregroundExtraMuted,
    fontSize: 13.5,
    fontWeight: theme.fontWeight.normal,
    marginLeft: theme.spacing[2],
  },
  secondaryLabelActive: {
    color: theme.colors.foreground,
  },
  shimmerText: {
    color: "transparent",
    fontSize: 13.5,
    fontWeight: theme.fontWeight.normal,
  },
  spacer: {
    flex: 1,
  },
  chevron: {
    flexShrink: 0,
  },
  openFileButton: {
    marginLeft: theme.spacing[1],
    padding: theme.spacing[1],
    borderRadius: theme.borderRadius.md,
    flexShrink: 0,
  },
  openFileButtonPlaceholderIcon: {
    width: 14,
    height: 14,
  },
  detailWrapper: {
    // Matches `pressable`'s radius so the expanded detail traces the same shape.
    borderBottomLeftRadius: theme.borderRadius.md,
    borderBottomRightRadius: theme.borderRadius.md,
    borderWidth: theme.borderWidth[1],
    borderTopWidth: 0,
    borderColor: theme.colors.border,
    padding: 0,
    gap: 0,
    flexShrink: 1,
    minWidth: 0,
    overflow: "hidden",
    ...(isWeb ? { cursor: "auto" as const, userSelect: "text" as const } : {}),
  },
  pressableExpanded: {
    backgroundColor: theme.colors.surface1,
  },
  pressableExpandedAttached: {
    borderColor: theme.colors.border,
    borderBottomLeftRadius: 0,
    borderBottomRightRadius: 0,
  },
  detailWrapperBorderless: {
    borderWidth: 0,
  },
  shimmerOverlay: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    flexDirection: "row",
    alignItems: "center",
    overflow: "hidden",
  },
  shimmerMaskRow: {
    flexDirection: "row",
    alignItems: "center",
    width: "100%",
    height: "100%",
  },
  nativeShimmerTrack: {
    position: "absolute",
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    overflow: "hidden",
  },
  nativeShimmerPeak: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
  },
}));

interface NativeExpandableBadgeShimmerProps {
  label: string;
  secondaryLabel?: string;
  rowWidth: number;
  rowHeight: number;
  peakWidth: number;
  durationSeconds: number;
  gradientId: string;
}

const NativeExpandableBadgeShimmer = memo(function NativeExpandableBadgeShimmer({
  label,
  secondaryLabel,
  rowWidth,
  rowHeight,
  peakWidth,
  durationSeconds,
  gradientId,
}: NativeExpandableBadgeShimmerProps) {
  const isPanelActive = useRetainedPanelActive();
  const shimmerTranslateX = useSharedValue(0);

  useEffect(() => {
    if (!isPanelActive) {
      cancelAnimation(shimmerTranslateX);
      return;
    }
    const startPosition = -peakWidth;
    const endPosition = rowWidth + peakWidth;
    shimmerTranslateX.value = startPosition;
    shimmerTranslateX.value = withRepeat(
      withTiming(endPosition, {
        duration: durationSeconds * 1000,
        easing: Easing.linear,
      }),
      -1,
      false,
    );
    return () => {
      cancelAnimation(shimmerTranslateX);
    };
  }, [durationSeconds, isPanelActive, peakWidth, rowWidth, shimmerTranslateX]);

  const nativeShimmerPeakStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: shimmerTranslateX.value }],
  }));

  const nativeShimmerTrackStyle = useMemo(
    () => [expandableBadgeStylesheet.nativeShimmerTrack, { width: rowWidth, height: rowHeight }],
    [rowHeight, rowWidth],
  );

  const nativeShimmerMaskStyle = useMemo(
    () => [expandableBadgeStylesheet.shimmerMaskRow, { width: rowWidth, height: rowHeight }],
    [rowHeight, rowWidth],
  );

  const nativeLabelMaskStyle = useMemo(
    () => [expandableBadgeStylesheet.label, { color: "#000000", opacity: 1 }],
    [],
  );

  const nativeSecondaryMaskStyle = useMemo(
    () => [expandableBadgeStylesheet.secondaryLabel, { color: "#000000", opacity: 1 }],
    [],
  );

  const nativeShimmerPeakCombinedStyle = useMemo(
    () => [
      expandableBadgeStylesheet.nativeShimmerPeak,
      nativeShimmerPeakStyle,
      { width: peakWidth, height: rowHeight },
    ],
    [nativeShimmerPeakStyle, peakWidth, rowHeight],
  );

  const maskElement = useMemo(
    () => (
      <View pointerEvents="none" style={nativeShimmerMaskStyle}>
        <Text style={nativeLabelMaskStyle} numberOfLines={1}>
          {label}
        </Text>
        {secondaryLabel ? (
          <Text style={nativeSecondaryMaskStyle} numberOfLines={1}>
            {secondaryLabel}
          </Text>
        ) : (
          <View style={expandableBadgeStylesheet.spacer} />
        )}
      </View>
    ),
    [nativeShimmerMaskStyle, nativeLabelMaskStyle, nativeSecondaryMaskStyle, label, secondaryLabel],
  );

  return (
    <View style={expandableBadgeStylesheet.shimmerOverlay} pointerEvents="none">
      <MaskedView pointerEvents="none" style={nativeShimmerTrackStyle} maskElement={maskElement}>
        <View pointerEvents="none" style={nativeShimmerTrackStyle}>
          <Animated.View pointerEvents="none" style={nativeShimmerPeakCombinedStyle}>
            <NativeShimmerPeakSvg gradientId={gradientId} />
          </Animated.View>
        </View>
      </MaskedView>
    </View>
  );
});

function NativeShimmerPeakSvg({ gradientId }: { gradientId: string }) {
  return (
    <Svg width="100%" height="100%" preserveAspectRatio="none">
      <Defs>
        <SvgLinearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="0%">
          <Stop offset="0%" stopColor="#ffffff" stopOpacity={0} />
          <Stop offset="50%" stopColor="#ffffff" stopOpacity={1} />
          <Stop offset="100%" stopColor="#ffffff" stopOpacity={0} />
        </SvgLinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={`url(#${gradientId})`} />
    </Svg>
  );
}

interface AssistantMessageBlockContainerProps {
  block: string;
  marginBottom: number;
  children: ReactNode;
}

function AssistantMessageBlockContainer({
  block,
  marginBottom,
  children,
}: AssistantMessageBlockContainerProps) {
  const style = useMemo(() => (marginBottom > 0 ? { marginBottom } : undefined), [marginBottom]);
  const handleLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const { width, height } = event.nativeEvent.layout;
      setAssistantMarkdownBlockHeight({ block, width, height });
    },
    [block],
  );
  return (
    <View style={style} onLayout={isWeb ? handleLayout : undefined}>
      {children}
    </View>
  );
}

interface MemoizedMarkdownBlockProps {
  text: string;
  rules: RenderRules;
  parser: MarkdownIt;
  onLinkPress: (url: string) => boolean;
}

const MemoizedMarkdownBlock = React.memo(function MemoizedMarkdownBlock({
  text,
  rules,
  parser,
  onLinkPress,
}: MemoizedMarkdownBlockProps) {
  return (
    <MarkdownRenderer
      text={text}
      enableHtmlish={false}
      rules={rules}
      markdownit={parser}
      onLinkPress={onLinkPress}
      allowedImageHandlers={MARKDOWN_ALLOWED_IMAGE_HANDLERS}
      topLevelMaxExceededItem={MARKDOWN_TOP_LEVEL_MAX_EXCEEDED_ITEM}
    />
  );
});

interface MarkdownInheritedTextProps {
  inheritedStyles: TextStyle;
  textStyle: TextStyle;
  style?: StyleProp<TextStyle>;
  monoSurface?: boolean;
  copyTag?: MarkdownCopyInlineTag;
  children: ReactNode;
}

function MarkdownInheritedText({
  inheritedStyles,
  textStyle,
  style: overrideStyle,
  monoSurface,
  copyTag,
  children,
}: MarkdownInheritedTextProps) {
  const style = useMemo(
    () => [inheritedStyles, textStyle, overrideStyle],
    [inheritedStyles, textStyle, overrideStyle],
  );
  // When this span renders link label text on iOS, pick up the link's press
  // handler from context and hand it to MarkdownTextSpan, which forwards it to
  // the leaf string children react-native-uitextview makes tappable. Null
  // outside a link (and on every other platform, where no provider mounts), so
  // ordinary text is unaffected. See assistant-file-links/link-press-context.
  // onLongPress (the link actions menu) rides the same path.
  const linkPress = useAssistantLinkPress();
  return (
    <MarkdownTextSpan
      monoSurface={monoSurface}
      copyTag={copyTag}
      style={style}
      onPress={linkPress?.onPress}
      onLongPress={linkPress?.onLongPress}
      accessibilityRole={linkPress?.accessibilityRole}
    >
      {children}
    </MarkdownTextSpan>
  );
}

interface MarkdownListItemContentProps {
  contentStyle: ViewStyle;
  children: ReactNode;
}

const MARKDOWN_LIST_ITEM_CONTENT_FLEX: ViewStyle = { flex: 1, flexShrink: 1, minWidth: 0 };

function MarkdownListItemContent({ contentStyle, children }: MarkdownListItemContentProps) {
  const style = useMemo(() => [contentStyle, MARKDOWN_LIST_ITEM_CONTENT_FLEX], [contentStyle]);
  return <View style={style}>{children}</View>;
}

interface MarkdownListViewProps {
  baseStyle: ViewStyle;
  copyTag: "ol" | "ul";
  orderedStart?: unknown;
  spacing: { marginTop: number; marginBottom: number };
  children: ReactNode;
}

function MarkdownListView({
  baseStyle,
  copyTag,
  orderedStart,
  spacing,
  children,
}: MarkdownListViewProps) {
  const style = useMemo(() => [baseStyle, spacing], [baseStyle, spacing]);
  const copyDataSet =
    copyTag === "ol" ? markdownCopyOrderedListDataSet(orderedStart) : markdownCopyDataSet.ul;
  return (
    <View style={style} dataSet={copyDataSet}>
      {children}
    </View>
  );
}

export const AssistantMessage = memo(function AssistantMessage({
  renderFullContent = false,
  occurrenceKey,
  message,
  timestamp: _timestamp,
  workspaceRoot,
  serverId,
  client,
  spacing = "default",
  phase,
  animateEntrance = false,
}: AssistantMessageProps) {
  const { t } = useTranslation();
  const { entering: entranceEntering, webStyle: entranceWebStyle } =
    useMessageEntranceAnimation(animateEntrance);
  // Read by the parser's plain-prose file-link rule on every parse (not just at mount), so the
  // one parser instance below keeps resolving relative paths against the current workspace even
  // though it isn't recreated when workspaceRoot changes.
  const workspaceRootRef = useRef(workspaceRoot);
  workspaceRootRef.current = workspaceRoot;
  const getWorkspaceRoot = useStableEvent(() => workspaceRootRef.current);
  const markdownParser = useMemo(
    () => createAssistantMarkdownParser({ getWorkspaceRoot }),
    [getWorkspaceRoot],
  );
  const streamingMarkdownParser = useMemo(
    () => createAssistantMarkdownParser({ streaming: true, getWorkspaceRoot }),
    [getWorkspaceRoot],
  );
  const renderedMessage = useMemo(() => {
    const annotated = rewriteAssistantAnnotations(message);
    return renderFullContent
      ? { text: annotated, capped: false }
      : capAssistantMessageForRender(annotated);
  }, [message, renderFullContent]);
  const revealedText = useRevealedText(renderedMessage.text, phase);
  const revealedMessage = renderFullContent ? renderedMessage.text : revealedText;
  const fullMessageByteLength = useMemo(
    () => (renderedMessage.capped && phase === "complete" ? getUtf8ByteLength(message) : null),
    [message, phase, renderedMessage.capped],
  );

  const fileLinkActions = useAssistantFileLinkActions();
  const handleMarkdownLinkPress = useStableEvent((url: string) => {
    fileLinkActions.open({ href: url }, "preferred");
    // react-native-markdown-display opens the link itself when this returns true.
    // We already handled it above, so return false to avoid duplicate opens.
    return false;
  });

  const markdownRules = useMemo<RenderRules>(() => {
    return {
      heading1: (
        node: ASTNode,
        children: ReactNode[],
        _parent: ASTNode[],
        styles: MarkdownStyles,
      ) => (
        <View key={node.key} style={styles._VIEW_SAFE_heading1} dataSet={markdownCopyDataSet.h1}>
          {children}
        </View>
      ),
      heading2: (
        node: ASTNode,
        children: ReactNode[],
        _parent: ASTNode[],
        styles: MarkdownStyles,
      ) => (
        <View key={node.key} style={styles._VIEW_SAFE_heading2} dataSet={markdownCopyDataSet.h2}>
          {children}
        </View>
      ),
      heading3: (
        node: ASTNode,
        children: ReactNode[],
        _parent: ASTNode[],
        styles: MarkdownStyles,
      ) => (
        <View key={node.key} style={styles._VIEW_SAFE_heading3} dataSet={markdownCopyDataSet.h3}>
          {children}
        </View>
      ),
      heading4: (
        node: ASTNode,
        children: ReactNode[],
        _parent: ASTNode[],
        styles: MarkdownStyles,
      ) => (
        <View key={node.key} style={styles._VIEW_SAFE_heading4} dataSet={markdownCopyDataSet.h4}>
          {children}
        </View>
      ),
      heading5: (
        node: ASTNode,
        children: ReactNode[],
        _parent: ASTNode[],
        styles: MarkdownStyles,
      ) => (
        <View key={node.key} style={styles._VIEW_SAFE_heading5} dataSet={markdownCopyDataSet.h5}>
          {children}
        </View>
      ),
      heading6: (
        node: ASTNode,
        children: ReactNode[],
        _parent: ASTNode[],
        styles: MarkdownStyles,
      ) => (
        <View key={node.key} style={styles._VIEW_SAFE_heading6} dataSet={markdownCopyDataSet.h6}>
          {children}
        </View>
      ),
      blockquote: (
        node: ASTNode,
        children: ReactNode[],
        _parent: ASTNode[],
        styles: MarkdownStyles,
      ) => (
        <View
          key={node.key}
          style={styles._VIEW_SAFE_blockquote}
          dataSet={markdownCopyDataSet.blockquote}
        >
          {children}
        </View>
      ),
      hr: (node: ASTNode, _children: ReactNode[], _parent: ASTNode[], styles: MarkdownStyles) => (
        <View key={node.key} style={styles._VIEW_SAFE_hr} dataSet={markdownCopyDataSet.hr} />
      ),
      table: (node: ASTNode, children: ReactNode[], _parent: ASTNode[], styles: MarkdownStyles) => (
        <View key={node.key} style={styles._VIEW_SAFE_table} dataSet={markdownCopyDataSet.table}>
          {children}
        </View>
      ),
      thead: (node: ASTNode, children: ReactNode[], _parent: ASTNode[], styles: MarkdownStyles) => (
        <View key={node.key} style={styles._VIEW_SAFE_thead} dataSet={markdownCopyDataSet.thead}>
          {children}
        </View>
      ),
      tbody: (node: ASTNode, children: ReactNode[], _parent: ASTNode[], styles: MarkdownStyles) => (
        <View key={node.key} style={styles._VIEW_SAFE_tbody} dataSet={markdownCopyDataSet.tbody}>
          {children}
        </View>
      ),
      tr: (node: ASTNode, children: ReactNode[], _parent: ASTNode[], styles: MarkdownStyles) => (
        <View key={node.key} style={styles._VIEW_SAFE_tr} dataSet={markdownCopyDataSet.tr}>
          {children}
        </View>
      ),
      text: (
        node: ASTNode,
        _children: ReactNode[],
        _parent: ASTNode[],
        styles: MarkdownStyles,
        inheritedStyles: TextStyle = {},
      ) => (
        <MarkdownInheritedText
          key={node.key}
          inheritedStyles={inheritedStyles}
          textStyle={styles.text}
        >
          {node.content}
        </MarkdownInheritedText>
      ),
      textgroup: (
        node: ASTNode,
        children: ReactNode[],
        _parent: ASTNode[],
        styles: MarkdownStyles,
        inheritedStyles: TextStyle = {},
      ) => (
        <MarkdownInheritedText
          key={node.key}
          inheritedStyles={inheritedStyles}
          textStyle={styles.textgroup}
        >
          {children}
        </MarkdownInheritedText>
      ),
      // strong/em/s have no custom rule in react-native-markdown-display's
      // defaults beyond wrapping children in a plain RN <Text>. On iOS the
      // paragraph/textgroup are native UITextViews (see markdown-text.ios.tsx),
      // and a plain <Text> nested inside one is not hoisted into a
      // UITextViewChild, so its content renders invisibly. Route these inline
      // marks through MarkdownTextSpan (same path as text/textgroup) so the
      // styled content composes and stays visible + selectable on iOS.
      strong: (
        node: ASTNode,
        children: ReactNode[],
        _parent: ASTNode[],
        styles: MarkdownStyles,
        inheritedStyles: TextStyle = {},
      ) => (
        <MarkdownInheritedText
          key={node.key}
          copyTag="strong"
          inheritedStyles={inheritedStyles}
          textStyle={styles.strong}
        >
          {children}
        </MarkdownInheritedText>
      ),
      em: (
        node: ASTNode,
        children: ReactNode[],
        _parent: ASTNode[],
        styles: MarkdownStyles,
        inheritedStyles: TextStyle = {},
      ) => (
        <MarkdownInheritedText
          key={node.key}
          copyTag="em"
          inheritedStyles={inheritedStyles}
          textStyle={styles.em}
        >
          {children}
        </MarkdownInheritedText>
      ),
      s: (
        node: ASTNode,
        children: ReactNode[],
        _parent: ASTNode[],
        styles: MarkdownStyles,
        inheritedStyles: TextStyle = {},
      ) => (
        <MarkdownInheritedText
          key={node.key}
          copyTag="s"
          inheritedStyles={inheritedStyles}
          textStyle={styles.s}
        >
          {children}
        </MarkdownInheritedText>
      ),
      // hardbreak/softbreak fall back to react-native-markdown-display's
      // default, a plain RN <Text>{"\n"}. Inside the paragraph UITextView that
      // plain <Text> is not hoisted into a UITextViewChild and is dropped (same
      // root cause as strong/em/s) — so on iOS a hard line break vanished, and
      // a softbreak between words jammed them together ("one\ntwo" -> "onetwo").
      // Emit the break through MarkdownTextSpan so it composes on iOS. Keep
      // the resolved break styles: hardbreak is a full-width flex-row child on
      // Android, and dropping that width joins the surrounding text spans.
      hardbreak: (
        node: ASTNode,
        _children: ReactNode[],
        _parent: ASTNode[],
        styles: MarkdownStyles,
      ) => (
        <MarkdownTextSpan key={node.key} style={styles.hardbreak} copyTag="br">
          {"\n"}
        </MarkdownTextSpan>
      ),
      softbreak: (
        node: ASTNode,
        _children: ReactNode[],
        _parent: ASTNode[],
        styles: MarkdownStyles,
      ) => (
        <MarkdownTextSpan key={node.key} style={styles.softbreak}>
          {"\n"}
        </MarkdownTextSpan>
      ),
      code_block: (
        node: ASTNode,
        _children: ReactNode[],
        _parent: ASTNode[],
        styles: MarkdownStyles,
        inheritedStyles: TextStyle = {},
      ) => (
        <HighlightedCodeBlock
          key={node.key}
          code={node.content}
          language={null}
          inheritedStyles={inheritedStyles}
          textStyle={styles.code_block}
        />
      ),
      fence: (
        node: ASTNode,
        _children: ReactNode[],
        _parent: ASTNode[],
        styles: MarkdownStyles,
        inheritedStyles: TextStyle = {},
      ) => (
        <MarkdownFenceBlock
          key={node.key}
          code={node.content}
          info={node.sourceInfo}
          phase={phase}
          inheritedStyles={inheritedStyles}
          textStyle={styles.fence}
        />
      ),
      code_inline: (
        node: ASTNode,
        _children: ReactNode[],
        parent: ASTNode[],
        styles: MarkdownStyles,
        inheritedStyles: TextStyle = {},
      ) => {
        const content = node.content ?? "";
        const isLinkedInlineCode = nodeHasParentType(parent, "link");
        const inlineCodeSource: AssistantFileLinkSource = {
          href: content,
          text: content,
          sourceType: "inline-code",
        };
        const shouldResolveInlinePath =
          !isLinkedInlineCode && fileLinkActions.canResolveFile(inlineCodeSource);

        if (shouldResolveInlinePath) {
          return (
            <AssistantInlineCodePathLink
              key={node.key}
              content={content}
              inheritedStyles={inheritedStyles}
              codeInlineStyle={styles.code_inline}
              linkStyle={styles.link}
            />
          );
        }

        const inlineCodeLinkUrl = getInlineCodeAutoLinkUrl(markdownParser, content);
        if (inlineCodeLinkUrl) {
          const source = getInlineCodeAutoLinkSource({
            href: inlineCodeLinkUrl,
            content,
          });
          return (
            <AssistantMarkdownCodeLink
              key={node.key}
              source={source}
              inheritedStyles={inheritedStyles}
              codeInlineStyle={styles.code_inline}
              linkStyle={styles.link}
            >
              {content}
            </AssistantMarkdownCodeLink>
          );
        }

        return (
          <MarkdownInheritedText
            key={node.key}
            copyTag="code"
            inheritedStyles={inheritedStyles}
            textStyle={styles.code_inline}
            monoSurface
          >
            {content}
          </MarkdownInheritedText>
        );
      },
      bullet_list: (
        node: ASTNode,
        children: ReactNode[],
        parent: ASTNode[],
        styles: MarkdownStyles,
      ) => (
        <MarkdownListView
          key={node.key}
          baseStyle={styles.bullet_list}
          copyTag="ul"
          spacing={getMarkdownListSpacing(node, parent)}
        >
          {children}
        </MarkdownListView>
      ),
      ordered_list: (
        node: ASTNode,
        children: ReactNode[],
        parent: ASTNode[],
        styles: MarkdownStyles,
      ) => (
        <MarkdownListView
          key={node.key}
          baseStyle={styles.ordered_list}
          copyTag="ol"
          orderedStart={node.attributes?.start}
          spacing={getMarkdownListSpacing(node, parent)}
        >
          {children}
        </MarkdownListView>
      ),
      list_item: (
        node: ASTNode,
        children: ReactNode[],
        parent: ASTNode[],
        styles: MarkdownStyles,
      ) => {
        const { isOrdered, marker } = getMarkdownListMarker(node, parent);
        const iconStyle = isOrdered ? styles.ordered_list_icon : styles.bullet_list_icon;
        const contentStyle = isOrdered ? styles.ordered_list_content : styles.bullet_list_content;

        return (
          <View key={node.key} style={styles.list_item} dataSet={markdownCopyDataSet.li}>
            <Text style={iconStyle} dataSet={markdownCopyDataSet.listMarker}>
              {marker}
            </Text>
            <MarkdownListItemContent contentStyle={contentStyle}>
              {children}
            </MarkdownListItemContent>
          </View>
        );
      },
      th: (node: ASTNode, children: ReactNode[], _parent: ASTNode[], styles: MarkdownStyles) => (
        <MarkdownTableCellText key={node.key}>
          <View
            style={styles._VIEW_SAFE_th}
            dataSet={markdownCopyTableCellDataSet("th", node.attributes?.style)}
          >
            {children}
          </View>
        </MarkdownTableCellText>
      ),
      td: (node: ASTNode, children: ReactNode[], _parent: ASTNode[], styles: MarkdownStyles) => (
        <MarkdownTableCellText key={node.key}>
          <View
            style={styles._VIEW_SAFE_td}
            dataSet={markdownCopyTableCellDataSet("td", node.attributes?.style)}
          >
            {children}
          </View>
        </MarkdownTableCellText>
      ),
      paragraph: (
        node: ASTNode,
        children: ReactNode[],
        _parent: ASTNode[],
        styles: MarkdownStyles,
      ) => (
        <MarkdownParagraphView
          key={node.key}
          paragraphStyle={styles.paragraph}
          containsImage={markdownNodeContainsType(node, "image")}
        >
          {children}
        </MarkdownParagraphView>
      ),
      link: (node: ASTNode, children: ReactNode[], _parent: ASTNode[], styles: MarkdownStyles) => (
        <AssistantMarkdownLink
          key={node.key}
          source={getMarkdownLinkSource(node)}
          style={styles.link}
        >
          {colorMarkdownLinkChildren(children, styles.link.color)}
        </AssistantMarkdownLink>
      ),
      image: (
        node: ASTNode,
        _children: ReactNode[],
        parent: ASTNode[],
        _styles: MarkdownStyles,
      ) => {
        const paragraphNode = Array.isArray(parent)
          ? parent.find((ancestor) => ancestor?.type === "paragraph")
          : null;
        const paragraphChildren = Array.isArray(paragraphNode?.children)
          ? paragraphNode.children
          : [];
        const imageIndex = paragraphChildren.findIndex((child: ASTNode) => child?.key === node.key);
        const hasLeadingContent = imageIndex > 0;

        return (
          <AssistantMarkdownImage
            key={node.key}
            source={String(node.attributes?.src ?? "")}
            occurrenceKey={`${occurrenceKey}:${node.key}`}
            alt={typeof node.attributes?.alt === "string" ? node.attributes.alt : undefined}
            hasLeadingContent={hasLeadingContent}
            client={client}
            workspaceRoot={workspaceRoot}
            serverId={serverId}
          />
        );
      },
    };
  }, [client, fileLinkActions, markdownParser, occurrenceKey, phase, serverId, workspaceRoot]);

  const blocks = useMemo(() => splitMarkdownBlocks(revealedMessage), [revealedMessage]);
  const keyedBlocks = useMemo(
    () => blocks.map((block, index) => ({ key: `block:${index}`, block })),
    [blocks],
  );

  const assistantContainerStyle = useMemo(
    () => [
      assistantMessageStylesheet.container,
      (spacing === "compactTop" || spacing === "compactBoth") &&
        assistantMessageStylesheet.containerCompactTop,
      (spacing === "compactBottom" || spacing === "compactBoth") &&
        assistantMessageStylesheet.containerCompactBottom,
    ],
    [spacing],
  );
  const revealDataSet = useMemo(
    () =>
      isRenderProfileEnabled()
        ? {
            ...MESSAGE_PROSE_DATASET,
            revealKey: occurrenceKey,
            revealLength: String(revealedMessage.length),
          }
        : MESSAGE_PROSE_DATASET,
    [occurrenceKey, revealedMessage.length],
  );

  const prose = (
    <View testID="assistant-message" dataSet={revealDataSet} style={assistantContainerStyle}>
      {keyedBlocks.map(({ key, block }, index) => (
        <AssistantMessageBlockContainer
          key={key}
          block={block}
          marginBottom={index < keyedBlocks.length - 1 ? 12 : 0}
        >
          <MemoizedMarkdownBlock
            text={block}
            rules={markdownRules}
            parser={
              phase === "streaming" && index === keyedBlocks.length - 1
                ? streamingMarkdownParser
                : markdownParser
            }
            onLinkPress={handleMarkdownLinkPress}
          />
        </AssistantMessageBlockContainer>
      ))}
      {fullMessageByteLength !== null ? (
        <Text
          testID="assistant-message-capped-notice"
          style={assistantMessageStylesheet.cappedNotice}
        >
          {t("agentStream.messageCapped", { bytes: fullMessageByteLength })}
        </Text>
      ) : null}
    </View>
  );

  return (
    <Animated.View entering={entranceEntering} style={entranceWebStyle}>
      {prose}
    </Animated.View>
  );
});

interface SpeakMessageProps {
  message: string;
  timestamp: number;
  disableOuterSpacing?: boolean;
}

const speakMessageStylesheet = StyleSheet.create((theme) => ({
  container: {
    paddingVertical: theme.spacing[3],
  },
  containerSpacing: {
    marginBottom: theme.spacing[4],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    marginBottom: theme.spacing[2],
  },
  headerLabel: {
    fontFamily: theme.fontFamily.ui,
    fontSize: theme.fontSize.base,
    fontWeight: theme.fontWeight.normal,
    color: theme.colors.foregroundMuted,
  },
  text: {
    fontFamily: theme.fontFamily.content,
    fontSize: theme.fontSize.content,
    lineHeight: Math.round(theme.fontSize.content * 1.4),
    color: theme.colors.foreground,
  },
}));

export const SpeakMessage = memo(function SpeakMessage({
  message,
  timestamp: _timestamp,
  disableOuterSpacing,
}: SpeakMessageProps) {
  const { t } = useTranslation();
  const resolvedDisableOuterSpacing = useDisableOuterSpacing(disableOuterSpacing);
  const containerStyle = useMemo(
    () => [
      speakMessageStylesheet.container,
      !resolvedDisableOuterSpacing && speakMessageStylesheet.containerSpacing,
    ],
    [resolvedDisableOuterSpacing],
  );

  return (
    <View testID="speak-message" style={containerStyle}>
      <View style={speakMessageStylesheet.header}>
        <ThemedMicVocal size={12} uniProps={foregroundMutedColorMapping} />
        <Text style={speakMessageStylesheet.headerLabel}>{t("message.speak.header")}</Text>
      </View>
      <Text dataSet={CONTENT_SURFACE_DATASET} style={speakMessageStylesheet.text}>
        {message}
      </Text>
    </View>
  );
});

interface NotificationProps {
  level: "info" | "warning" | "error";
  message: string;
  disableOuterSpacing?: boolean;
}

const notificationStylesheet = StyleSheet.create((theme) => ({
  container: {
    borderRadius: theme.borderRadius.md,
    overflow: "hidden",
  },
  containerSpacing: {
    marginBottom: theme.spacing[1],
  },
  infoBg: {
    backgroundColor: "rgba(147, 197, 253, 0.1)",
  },
  warningBg: {
    backgroundColor: "rgba(245, 158, 11, 0.1)",
  },
  errorBg: {
    backgroundColor: "rgba(239, 68, 68, 0.1)",
  },
  content: {
    paddingHorizontal: theme.spacing[3],
    paddingVertical: 10,
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[2],
  },
  iconContainer: {
    flexShrink: 0,
    height: 20,
    justifyContent: "center",
  },
  textContainer: {
    flex: 1,
  },
  messageText: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    lineHeight: 20,
  },
}));

export const Notification = memo(function Notification({
  level,
  message,
  disableOuterSpacing,
}: NotificationProps) {
  const resolvedDisableOuterSpacing = useDisableOuterSpacing(disableOuterSpacing);

  const typeConfig = {
    info: {
      bg: notificationStylesheet.infoBg,
      iconColorMapping: infoColorMapping,
      Icon: ThemedNotificationInfo,
    },
    warning: {
      bg: notificationStylesheet.warningBg,
      iconColorMapping: warningColorMapping,
      Icon: ThemedNotificationWarning,
    },
    error: {
      bg: notificationStylesheet.errorBg,
      iconColorMapping: destructiveColorMapping,
      Icon: ThemedNotificationError,
    },
  };

  const config = typeConfig[level];
  const IconComponent = config.Icon;

  const containerStyle = useMemo(
    () => [
      notificationStylesheet.container,
      !resolvedDisableOuterSpacing && notificationStylesheet.containerSpacing,
      config.bg,
    ],
    [resolvedDisableOuterSpacing, config.bg],
  );
  return (
    <View style={containerStyle}>
      <View style={notificationStylesheet.content}>
        <View style={notificationStylesheet.row}>
          <View style={notificationStylesheet.iconContainer}>
            <IconComponent size={16} uniProps={config.iconColorMapping} />
          </View>
          <View style={notificationStylesheet.textContainer}>
            <Text style={notificationStylesheet.messageText} selectable>
              {message}
            </Text>
          </View>
        </View>
      </View>
    </View>
  );
});

interface CompactionMarkerProps {
  status: "loading" | "completed";
  trigger?: "auto" | "manual";
  preTokens?: number;
}

const compactionStylesheet = StyleSheet.create((theme) => ({
  container: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: theme.spacing[3],
    paddingHorizontal: theme.spacing[4],
    gap: theme.spacing[2],
  },
  line: {
    flex: 1,
    height: 1,
    backgroundColor: theme.colors.border,
  },
  label: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
  },
  text: {
    fontFamily: theme.fontFamily.ui,
    fontSize: 13,
    color: theme.colors.foregroundMuted,
  },
}));

export const CompactionMarker = memo(function CompactionMarker({
  status,
  trigger,
  preTokens,
}: CompactionMarkerProps) {
  const label = getCompactionMarkerLabel({ status, trigger, preTokens });

  return (
    <View style={compactionStylesheet.container}>
      <View style={compactionStylesheet.line} />
      <View style={compactionStylesheet.label}>
        {status === "loading" ? (
          <LoadingSpinner size="small" color="#a1a1aa" />
        ) : (
          <Scissors size={12} color="#a1a1aa" />
        )}
        <Text style={compactionStylesheet.text}>{label}</Text>
      </View>
      <View style={compactionStylesheet.line} />
    </View>
  );
});

interface TodoListCardProps {
  items: TodoEntry[];
  activity: TaskActivity;
  disableOuterSpacing?: boolean;
}

function taskActivityIcon(activity: TaskActivity) {
  switch (activity.type) {
    case "added":
      return Plus;
    case "started":
      return CircleDot;
    case "completed":
      return Check;
    default:
      return CheckSquare;
  }
}

const todoListCardStylesheet = StyleSheet.create((theme) => ({
  detailsWrapper: {
    padding: theme.spacing[2],
  },
  list: {
    gap: theme.spacing[1],
  },
  emptyText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
  },
}));

export const TodoListCard = memo(function TodoListCard({
  items,
  activity,
  disableOuterSpacing,
}: TodoListCardProps) {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);
  const activityDisplay = useMemo(() => {
    if (activity.type === "created") {
      return {
        label: t("message.todo.activity.created", { count: activity.count }),
        secondaryLabel: undefined,
      };
    }
    return {
      label: t(`message.todo.activity.${activity.type}`),
      secondaryLabel: activity.task,
    };
  }, [activity, t]);

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const renderDetails = useCallback(() => {
    return (
      <View style={todoListCardStylesheet.detailsWrapper}>
        <View style={todoListCardStylesheet.list}>
          {items.length === 0 ? (
            <Text style={todoListCardStylesheet.emptyText}>{t("message.todo.empty")}</Text>
          ) : (
            items.map((item) => <TaskListRow key={item.id ?? item.text} task={item} />)
          )}
        </View>
      </View>
    );
  }, [items, t]);

  return (
    <ExpandableBadge
      label={activityDisplay.label}
      secondaryLabel={activityDisplay.secondaryLabel}
      icon={taskActivityIcon(activity)}
      isExpanded={isExpanded}
      onToggle={handleToggle}
      renderDetails={renderDetails}
      disableOuterSpacing={disableOuterSpacing}
    />
  );
});

interface ExpandableBadgeProps {
  label: string;
  secondaryLabel?: string;
  icon?: ComponentType<{ size?: number; color?: string }>;
  isExpanded: boolean;
  style?: StyleProp<ViewStyle>;
  onToggle?: () => void;
  onOpenFile?: () => void;
  onDetailHoverChange?: (hovered: boolean) => void;
  renderDetails?: () => ReactNode;
  isLoading?: boolean;
  isError?: boolean;
  isLastInSequence?: boolean;
  disableOuterSpacing?: boolean;
  borderlessWhenExpanded?: boolean;
  testID?: string;
  /**
   * The one-line "Ran N commands, read N files..." row that collapses a whole
   * turn's tool calls. Unlike the default badge, the leading icon never swaps
   * for the chevron — both are fixed (leading glyph, trailing chevron), the
   * label stays muted instead of brightening on hover, and hover/expanded
   * state paints with `interactionHighlight` instead of a bordered fill.
   */
  activitySummary?: boolean;
}

interface ExpandableBadgeSecondaryLabelProps {
  secondaryLabel?: string;
  secondaryLabelStyle: StyleProp<TextStyle>;
  shouldMeasureWebShimmer: boolean;
  onSecondaryLayout: (event: LayoutChangeEvent) => void;
}

function ExpandableBadgeSecondaryLabel({
  secondaryLabel,
  secondaryLabelStyle,
  shouldMeasureWebShimmer,
  onSecondaryLayout,
}: ExpandableBadgeSecondaryLabelProps) {
  if (!secondaryLabel) {
    return null;
  }
  return (
    <Text
      style={secondaryLabelStyle}
      numberOfLines={1}
      onLayout={shouldMeasureWebShimmer ? onSecondaryLayout : undefined}
    >
      {secondaryLabel}
    </Text>
  );
}

interface ExpandableBadgeWebShimmerOverlayProps {
  label: string;
  secondaryLabel?: string;
  shimmerLabelTextStyle: StyleProp<TextStyle>;
  shimmerSecondaryTextStyle: StyleProp<TextStyle>;
  showOpenFileButton: boolean;
}

function ExpandableBadgeWebShimmerOverlay({
  label,
  secondaryLabel,
  shimmerLabelTextStyle,
  shimmerSecondaryTextStyle,
  showOpenFileButton,
}: ExpandableBadgeWebShimmerOverlayProps) {
  return (
    <View style={expandableBadgeStylesheet.shimmerOverlay} pointerEvents="none">
      <Text style={shimmerLabelTextStyle} numberOfLines={1}>
        {label}
      </Text>
      {secondaryLabel ? (
        <Text style={shimmerSecondaryTextStyle} numberOfLines={1}>
          {secondaryLabel}
        </Text>
      ) : null}
      {showOpenFileButton ? (
        <View style={expandableBadgeStylesheet.openFileButton}>
          <View style={expandableBadgeStylesheet.openFileButtonPlaceholderIcon} />
        </View>
      ) : null}
      {!secondaryLabel && !showOpenFileButton ? (
        <View style={expandableBadgeStylesheet.spacer} />
      ) : null}
    </View>
  );
}

interface ExpandableBadgeLabelRowProps {
  label: string;
  labelStyle: StyleProp<TextStyle>;
  secondaryLabel?: string;
  secondaryLabelStyle: StyleProp<TextStyle>;
  shouldMeasureWebShimmer: boolean;
  shouldMeasureNativeShimmer: boolean;
  isWebShimmer: boolean;
  isNativeShimmer: boolean;
  shimmerLabelTextStyle: StyleProp<TextStyle>;
  shimmerSecondaryTextStyle: StyleProp<TextStyle>;
  labelRowWidth: number;
  labelRowHeight: number;
  nativeShimmerPeakWidth: number;
  shimmerDuration: number;
  nativeGradientId: string;
  onLabelRowLayout: (event: LayoutChangeEvent) => void;
  onLabelLayout: (event: LayoutChangeEvent) => void;
  onSecondaryLayout: (event: LayoutChangeEvent) => void;
  showOpenFileButton: boolean;
  isOpenFileHovered: boolean;
  onOpenFilePress: (event: GestureResponderEvent) => void;
  onOpenFileHoverIn: () => void;
  onOpenFileHoverOut: () => void;
}

function ExpandableBadgeLabelRow({
  label,
  labelStyle,
  secondaryLabel,
  secondaryLabelStyle,
  shouldMeasureWebShimmer,
  shouldMeasureNativeShimmer,
  isWebShimmer,
  isNativeShimmer,
  shimmerLabelTextStyle,
  shimmerSecondaryTextStyle,
  labelRowWidth,
  labelRowHeight,
  nativeShimmerPeakWidth,
  shimmerDuration,
  nativeGradientId,
  onLabelRowLayout,
  onLabelLayout,
  onSecondaryLayout,
  showOpenFileButton,
  isOpenFileHovered,
  onOpenFilePress,
  onOpenFileHoverIn,
  onOpenFileHoverOut,
}: ExpandableBadgeLabelRowProps) {
  const { t } = useTranslation();
  return (
    <View
      style={expandableBadgeStylesheet.labelRow}
      onLayout={shouldMeasureNativeShimmer ? onLabelRowLayout : undefined}
    >
      <Text
        style={labelStyle}
        numberOfLines={1}
        onLayout={shouldMeasureWebShimmer ? onLabelLayout : undefined}
      >
        {label}
      </Text>
      <ExpandableBadgeSecondaryLabel
        secondaryLabel={secondaryLabel}
        secondaryLabelStyle={secondaryLabelStyle}
        shouldMeasureWebShimmer={shouldMeasureWebShimmer}
        onSecondaryLayout={onSecondaryLayout}
      />
      {showOpenFileButton ? (
        <Pressable
          onPress={onOpenFilePress}
          onHoverIn={onOpenFileHoverIn}
          onHoverOut={onOpenFileHoverOut}
          accessibilityRole="button"
          accessibilityLabel={t("message.actions.openFile")}
          testID="tool-call-open-file"
          style={expandableBadgeStylesheet.openFileButton}
          hitSlop={6}
        >
          <ThemedFileSymlinkIcon
            size={14}
            uniProps={isOpenFileHovered ? foregroundColorMapping : foregroundMutedColorMapping}
          />
        </Pressable>
      ) : null}
      {isWebShimmer ? (
        <ExpandableBadgeWebShimmerOverlay
          label={label}
          secondaryLabel={secondaryLabel}
          shimmerLabelTextStyle={shimmerLabelTextStyle}
          shimmerSecondaryTextStyle={shimmerSecondaryTextStyle}
          showOpenFileButton={showOpenFileButton}
        />
      ) : null}
      {isNativeShimmer ? (
        <NativeExpandableBadgeShimmer
          label={label}
          secondaryLabel={secondaryLabel}
          rowWidth={labelRowWidth}
          rowHeight={labelRowHeight}
          peakWidth={nativeShimmerPeakWidth}
          durationSeconds={shimmerDuration}
          gradientId={nativeGradientId}
        />
      ) : null}
    </View>
  );
}

// HACK: lucide ships every icon inside a 24×24 viewBox where the path
// doesn't touch the edges — there's per-icon internal padding. The layout
// already places the SVG element's box on the rail, but the visible glyph
// inside the SVG sits inset by a few pixels (and the inset amount differs
// per icon — chevron-right paints only in the right half of its viewBox,
// regular tool icons paint roughly the full viewBox minus ~1 unit margin).
//
// Lucide has no viewBox knob, so the only way to nudge the visible glyph
// flush with the rail is a per-icon negative margin. Cosmetic; not exact —
// every lucide icon has slightly different padding and we're not measuring
// each one. Two buckets is the compromise:
//   - LUCIDE_TOOL_ICON_NUDGE_LEFT: regular tool icons (path mostly fills
//     the viewBox); needs ~1px left shift.
//   - LUCIDE_CHEVRON_NUDGE_LEFT: chevron-right (path in right half of
//     viewBox, and we scale it 1.3×); needs ~4px left shift.
// If we ever want this exact, the principled fix is a custom <Svg> wrapper
// with a tight viewBox per icon — see option (2) in the design discussion.
const LUCIDE_TOOL_ICON_NUDGE_LEFT: ViewStyle = { marginLeft: -1 };
const LUCIDE_CHEVRON_NUDGE_LEFT: ViewStyle = { marginLeft: -4 };

function renderExpandableBadgeIcon({
  isError,
  isActive,
  ThemedIcon,
}: {
  isError: boolean;
  isActive: boolean;
  ThemedIcon: ComponentType<{ size?: number; uniProps?: typeof foregroundColorMapping }> | null;
}): ReactNode {
  if (isError) {
    return (
      <View style={LUCIDE_TOOL_ICON_NUDGE_LEFT}>
        <ThemedTriangleAlertIcon size={12} opacity={0.8} uniProps={destructiveColorMapping} />
      </View>
    );
  }
  if (ThemedIcon) {
    return (
      <View style={LUCIDE_TOOL_ICON_NUDGE_LEFT}>
        <ThemedIcon
          size={12}
          uniProps={isActive ? foregroundColorMapping : mutedForegroundColorMapping}
        />
      </View>
    );
  }
  return null;
}

function renderExpandableBadgeIconSlot({
  activitySummary,
  isInteractive,
  isHovered,
  isExpanded,
  chevronStyle,
  iconNode,
}: {
  activitySummary: boolean;
  isInteractive: boolean;
  isHovered: boolean;
  isExpanded: boolean;
  chevronStyle: ComponentProps<typeof Animated.View>["style"];
  iconNode: ReactNode;
}): ReactNode {
  // The activity-summary row pins the leading glyph in place — it never swaps for
  // the chevron, unlike the default badge (see the `activitySummary` note above).
  if (activitySummary) {
    return iconNode;
  }
  if (isInteractive && (isHovered || isExpanded)) {
    return (
      <Animated.View style={chevronStyle}>
        <ThemedChevronRightIcon size={12} uniProps={foregroundColorMapping} />
      </Animated.View>
    );
  }
  return iconNode;
}

/**
 * The activity-summary row's hover/expanded background is a translucent
 * `interactionHighlight`, not the default badge's solid `surface1` fill —
 * see the `activitySummary` note on `ExpandableBadgeProps`.
 */
function resolveExpandableBadgeHighlightStyle(input: {
  activitySummary: boolean;
  isExpanded: boolean;
  isHovered: boolean;
}): StyleProp<ViewStyle> {
  if (input.activitySummary) {
    return input.isHovered || input.isExpanded
      ? expandableBadgeStylesheet.pressableActivitySummaryHighlighted
      : null;
  }
  return input.isExpanded ? expandableBadgeStylesheet.pressableExpanded : null;
}

function renderExpandableBadgeTrailingChevron(input: {
  activitySummary: boolean;
  isInteractive: boolean;
}): ReactNode {
  if (!input.activitySummary || !input.isInteractive) {
    return null;
  }
  return (
    <View style={expandableBadgeStylesheet.trailingChevron}>
      <ThemedChevronRightIcon size={ICON_SIZE.sm} uniProps={foregroundMutedColorMapping} />
    </View>
  );
}

function computeShimmerMetrics(input: {
  label: string;
  secondaryLabel: string | undefined;
  isLoading: boolean;
  labelRowWidth: number;
  labelRowHeight: number;
  labelOffsetX: number;
  labelWidth: number;
  secondaryOffsetX: number;
  secondaryWidth: number;
}) {
  const totalShimmerChars = input.label.trim().length + (input.secondaryLabel?.trim().length ?? 0);
  const shortTextDurationAdjustment = totalShimmerChars <= 12 ? 0.25 : 0;
  const shimmerDuration = Math.max(
    1,
    Math.min(2.3, 1.25 + totalShimmerChars * 0.008 - shortTextDurationAdjustment),
  );
  const nativeShimmerPeakWidth = Math.max(
    32,
    Math.min(120, input.labelRowWidth > 0 ? input.labelRowWidth * 0.28 : 0),
  );
  const isWebShimmer = input.isLoading && isWeb;
  // React Native Web only observes a node when onLayout exists at mount. Keep
  // measuring while idle so a retained badge has dimensions when it starts loading.
  const shouldMeasureWebShimmer = isWeb;
  const shouldMeasureNativeShimmer = input.isLoading && isNative;
  const isNativeShimmer =
    shouldMeasureNativeShimmer && input.labelRowWidth > 0 && input.labelRowHeight > 0;
  const webShimmerSpanStartX = input.labelOffsetX;
  const webShimmerSpanEndX = input.secondaryLabel
    ? input.secondaryOffsetX + input.secondaryWidth
    : input.labelOffsetX + input.labelWidth;
  const webShimmerSpanWidth = Math.max(1, webShimmerSpanEndX - webShimmerSpanStartX);
  const webShimmerPeakWidth = Math.max(42, Math.min(120, webShimmerSpanWidth * 0.22));
  const webShimmerTrackStart = webShimmerSpanStartX - webShimmerPeakWidth;
  const webShimmerTrackEnd = webShimmerSpanEndX;
  return {
    shimmerDuration,
    nativeShimmerPeakWidth,
    isWebShimmer,
    shouldMeasureWebShimmer,
    shouldMeasureNativeShimmer,
    isNativeShimmer,
    webShimmerPeakWidth,
    webShimmerTrackStart,
    webShimmerTrackEnd,
  };
}

function useDetailWheelPropagationBlocker(input: {
  detailWrapperRef: React.RefObject<View | null>;
  enabled: boolean;
}): void {
  const { detailWrapperRef, enabled } = input;
  useEffect(() => {
    if (!enabled) {
      return () => {};
    }
    const rawRef: unknown = detailWrapperRef.current;
    if (!(rawRef instanceof HTMLElement)) {
      return () => {};
    }
    const node = rawRef;
    const stopWheelPropagation = (event: WheelEvent) => {
      if (shouldStopDetailWheelPropagation(node, event)) {
        event.stopPropagation();
      }
    };
    node.addEventListener("wheel", stopWheelPropagation, { passive: true });
    return () => {
      node.removeEventListener("wheel", stopWheelPropagation);
    };
  }, [detailWrapperRef, enabled]);
}

const SHIMMER_GRADIENT =
  "linear-gradient(90deg, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.45) 24%, #ffffff 40%, #ffffff 60%, rgba(255, 255, 255, 0.45) 76%, rgba(255, 255, 255, 0) 100%)";

function buildShimmerTextStyle(input: {
  isWebShimmer: boolean;
  webShimmerPeakWidth: number;
  shimmerDuration: number;
  webShimmerTrackStart: number;
  webShimmerTrackEnd: number;
  offsetX: number;
  paused: boolean;
}): object | null {
  if (!input.isWebShimmer) return null;
  return inlineUnistylesStyle({
    opacity: 1,
    color: "transparent",
    backgroundImage: SHIMMER_GRADIENT,
    backgroundSize: `${input.webShimmerPeakWidth}px 100%`,
    backgroundRepeat: "no-repeat",
    backgroundClip: "text",
    WebkitBackgroundClip: "text",
    WebkitTextFillColor: "transparent",
    animation: `${WEB_TOOLCALL_SHIMMER_ANIMATION_NAME} ${input.shimmerDuration}s linear infinite`,
    // Stops with the window in the background, like every web loop (docs/design.md
    // "Continuous loops on web").
    animationPlayState: input.paused ? "paused" : "running",
    "--paseo-shimmer-start": `${input.webShimmerTrackStart - input.offsetX}px`,
    "--paseo-shimmer-end": `${input.webShimmerTrackEnd - input.offsetX}px`,
  });
}

export const ExpandableBadge = memo(function ExpandableBadge({
  label,
  style,
  secondaryLabel,
  icon,
  isExpanded,
  onToggle,
  onOpenFile,
  onDetailHoverChange,
  renderDetails,
  isLoading = false,
  isError = false,
  isLastInSequence = false,
  disableOuterSpacing,
  borderlessWhenExpanded = false,
  activitySummary = false,
  testID,
}: ExpandableBadgeProps) {
  const resolvedDisableOuterSpacing = useDisableOuterSpacing(disableOuterSpacing);
  const [isHovered, setIsHovered] = useState(false);
  const [isOpenFileHovered, setIsOpenFileHovered] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const isInteractive = Boolean(onToggle);
  const hasDetailContent = Boolean(renderDetails);
  const detailWrapperRef = useRef<View | null>(null);
  const reducedMotion = useAppReducedMotion();

  // M2 (docs/design.md "17. Motion", docs/ui-gap-gpt.md): the detail block animates open/closed
  // instead of snapping. `isDetailMounted` keeps the content (and this Pressable) in the tree for
  // the duration of the collapse animation — the mount/unmount moment itself still matches the
  // old behavior, just delayed until the shrink finishes. `detailHeight`/`detailOpacity` drive the
  // wrapper; `isDetailHeightFree` switches the wrapper to natural (`auto`) height once an
  // expansion settles, so content that grows afterwards (a streaming tool result) reflows without
  // fighting a stale clamp — collapsing re-measures the live height before animating back to 0.
  const [isDetailMounted, setIsDetailMounted] = useState(hasDetailContent && isExpanded);
  // Starts "free" (natural height, no animation) when the badge mounts already expanded —
  // e.g. a default-expanded tool-call group — so existing content never plays the open
  // animation it would otherwise get from a height starting at 0. Only a later, genuine
  // toggle (isExpanded flips) re-clamps and animates.
  const [isDetailHeightFree, setIsDetailHeightFree] = useState(
    () => hasDetailContent && isExpanded,
  );
  const detailHeight = useSharedValue(0);
  const detailOpacity = useSharedValue(0);
  const detailNaturalHeightRef = useRef(0);
  const detailContent = hasDetailContent && isDetailMounted ? renderDetails?.() : null;

  useEffect(() => {
    if (!hasDetailContent) {
      return;
    }
    if (isExpanded) {
      setIsDetailMounted(true);
      setIsDetailHeightFree(false);
      return;
    }
    if (!isDetailMounted) {
      return;
    }
    setIsDetailHeightFree(false);
    // Re-clamp from the content's last known natural height (kept live by
    // handleDetailContentLayout below, including while the height is "free") so collapsing
    // out of a settled, auto-height expansion never visibly snaps before it shrinks.
    detailHeight.value = detailNaturalHeightRef.current;
    if (reducedMotion) {
      detailHeight.value = 0;
      detailOpacity.value = 0;
      setIsDetailMounted(false);
      return;
    }
    detailOpacity.value = withTiming(0, {
      duration: MOTION_DURATION.base,
      easing: MOTION_EASING.standard,
    });
    detailHeight.value = withTiming(
      0,
      { duration: MOTION_DURATION.base, easing: MOTION_EASING.standard },
      (finished) => {
        "worklet";
        if (finished) {
          runOnJS(setIsDetailMounted)(false);
        }
      },
    );
  }, [isExpanded, hasDetailContent, reducedMotion, isDetailMounted, detailHeight, detailOpacity]);

  const handleDetailContentLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const measured = event.nativeEvent.layout.height;
      detailNaturalHeightRef.current = measured;
      if (!isExpanded || isDetailHeightFree) {
        return;
      }
      if (reducedMotion) {
        detailHeight.value = measured;
        detailOpacity.value = 1;
        setIsDetailHeightFree(true);
        return;
      }
      detailOpacity.value = withTiming(1, {
        duration: MOTION_DURATION.base,
        easing: MOTION_EASING.standard,
      });
      detailHeight.value = withTiming(
        measured,
        { duration: MOTION_DURATION.base, easing: MOTION_EASING.standard },
        (finished) => {
          "worklet";
          if (finished) {
            runOnJS(setIsDetailHeightFree)(true);
          }
        },
      );
    },
    [isExpanded, isDetailHeightFree, reducedMotion, detailHeight, detailOpacity],
  );

  const detailAnimatedStyle = useAnimatedStyle(
    () => ({
      height: isDetailHeightFree ? undefined : detailHeight.value,
      opacity: detailOpacity.value,
    }),
    [isDetailHeightFree],
  );

  const handleHoverIn = useCallback(() => setIsHovered(true), []);
  const handleHoverOut = useCallback(() => {
    setIsHovered(false);
    setIsPressed(false);
  }, []);
  const handlePressIn = useCallback(() => setIsPressed(true), []);
  const handlePressOut = useCallback(() => setIsPressed(false), []);
  const handleDetailHoverIn = useCallback(() => onDetailHoverChange?.(true), [onDetailHoverChange]);
  const handleDetailHoverOut = useCallback(
    () => onDetailHoverChange?.(false),
    [onDetailHoverChange],
  );
  const handleOpenFilePress = useCallback(
    (event: GestureResponderEvent) => {
      event.stopPropagation?.();
      onOpenFile?.();
    },
    [onOpenFile],
  );
  const handleOpenFileHoverIn = useCallback(() => setIsOpenFileHovered(true), []);
  const handleOpenFileHoverOut = useCallback(() => setIsOpenFileHovered(false), []);

  const nativeGradientIdRef = useRef(
    `shimmer-gradient-${Math.random().toString(36).substring(2, 9)}`,
  );
  const [labelRowWidth, setLabelRowWidth] = useState(0);
  const [labelRowHeight, setLabelRowHeight] = useState(0);
  const [labelOffsetX, setLabelOffsetX] = useState(0);
  const [labelWidth, setLabelWidth] = useState(0);
  const [secondaryOffsetX, setSecondaryOffsetX] = useState(0);
  const [secondaryWidth, setSecondaryWidth] = useState(0);

  const {
    shimmerDuration,
    nativeShimmerPeakWidth,
    isWebShimmer,
    shouldMeasureWebShimmer,
    shouldMeasureNativeShimmer,
    isNativeShimmer,
    webShimmerPeakWidth,
    webShimmerTrackStart,
    webShimmerTrackEnd,
  } = computeShimmerMetrics({
    label,
    secondaryLabel,
    isLoading,
    labelRowWidth,
    labelRowHeight,
    labelOffsetX,
    labelWidth,
    secondaryOffsetX,
    secondaryWidth,
  });

  const handleLabelRowLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (!shouldMeasureNativeShimmer) {
        return;
      }
      const { width, height } = event.nativeEvent.layout;
      setLabelRowWidth((previous) => (Math.abs(previous - width) > 0.5 ? width : previous));
      setLabelRowHeight((previous) => (Math.abs(previous - height) > 0.5 ? height : previous));
    },
    [shouldMeasureNativeShimmer],
  );

  const handleLabelLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (!shouldMeasureWebShimmer) {
        return;
      }
      const { x, width } = event.nativeEvent.layout;
      setLabelOffsetX((previous) => (Math.abs(previous - x) > 0.5 ? x : previous));
      setLabelWidth((previous) => (Math.abs(previous - width) > 0.5 ? width : previous));
    },
    [shouldMeasureWebShimmer],
  );

  const handleSecondaryLayout = useCallback(
    (event: LayoutChangeEvent) => {
      if (!shouldMeasureWebShimmer || !secondaryLabel) {
        return;
      }
      const { x, width } = event.nativeEvent.layout;
      setSecondaryOffsetX((previous) => (Math.abs(previous - x) > 0.5 ? x : previous));
      setSecondaryWidth((previous) => (Math.abs(previous - width) > 0.5 ? width : previous));
    },
    [shouldMeasureWebShimmer, secondaryLabel],
  );

  useEffect(() => {
    if (!isWebShimmer) {
      return;
    }
    ensureWebToolCallShimmerKeyframes();
  }, [isWebShimmer]);

  useDetailWheelPropagationBlocker({
    detailWrapperRef,
    enabled: !isNative && isDetailMounted && hasDetailContent,
  });

  const windowActive = useAppActivelyVisible();
  const shimmerLabelStyle = useMemo<StyleProp<TextStyle>>(
    () =>
      buildShimmerTextStyle({
        isWebShimmer,
        webShimmerPeakWidth,
        shimmerDuration,
        webShimmerTrackStart,
        webShimmerTrackEnd,
        offsetX: labelOffsetX,
        paused: !windowActive,
      }),
    [
      isWebShimmer,
      webShimmerPeakWidth,
      shimmerDuration,
      webShimmerTrackStart,
      webShimmerTrackEnd,
      labelOffsetX,
      windowActive,
    ],
  );

  const shimmerSecondaryStyle = useMemo<StyleProp<TextStyle>>(
    () =>
      buildShimmerTextStyle({
        isWebShimmer,
        webShimmerPeakWidth,
        shimmerDuration,
        webShimmerTrackStart,
        webShimmerTrackEnd,
        offsetX: secondaryOffsetX,
        paused: !windowActive,
      }),
    [
      isWebShimmer,
      webShimmerPeakWidth,
      shimmerDuration,
      webShimmerTrackStart,
      webShimmerTrackEnd,
      secondaryOffsetX,
      windowActive,
    ],
  );

  const containerStyle = useMemo(
    () => [
      expandableBadgeStylesheet.container,
      !resolvedDisableOuterSpacing &&
        (isLastInSequence
          ? expandableBadgeStylesheet.containerLastInSequence
          : expandableBadgeStylesheet.containerSpacing),
      style,
    ],
    [isLastInSequence, resolvedDisableOuterSpacing, style],
  );

  const pressableStyle = useMemo(
    () => [
      expandableBadgeStylesheet.pressable,
      isPressed && isInteractive ? expandableBadgeStylesheet.pressablePressed : null,
      resolveExpandableBadgeHighlightStyle({ activitySummary, isExpanded, isHovered }),
      isExpanded && !borderlessWhenExpanded && expandableBadgeStylesheet.pressableExpandedAttached,
    ],
    [activitySummary, borderlessWhenExpanded, isExpanded, isHovered, isInteractive, isPressed],
  );

  const detailWrapperStyle = useMemo(
    () => [
      expandableBadgeStylesheet.detailWrapper,
      borderlessWhenExpanded && expandableBadgeStylesheet.detailWrapperBorderless,
    ],
    [borderlessWhenExpanded],
  );

  const accessibilityState = useMemo(
    () => (isInteractive ? { expanded: isExpanded } : undefined),
    [isExpanded, isInteractive],
  );

  const isActive = isHovered || isExpanded;
  // The activity-summary row keeps its sentence muted at every state — the row
  // background (interactionHighlight) carries hover/expanded feedback instead.
  const labelIsActive = isActive && !activitySummary;

  const labelStyle = useMemo(
    () => [
      expandableBadgeStylesheet.label,
      labelIsActive && expandableBadgeStylesheet.labelActive,
      isLoading && expandableBadgeStylesheet.labelLoading,
    ],
    [labelIsActive, isLoading],
  );

  const secondaryLabelStyle = useMemo(
    () => [
      expandableBadgeStylesheet.secondaryLabel,
      isActive && expandableBadgeStylesheet.secondaryLabelActive,
    ],
    [isActive],
  );

  const shimmerLabelTextStyle = useMemo(
    () => [
      expandableBadgeStylesheet.label,
      isLoading && expandableBadgeStylesheet.labelLoading,
      expandableBadgeStylesheet.shimmerText,
      shimmerLabelStyle,
    ],
    [isLoading, shimmerLabelStyle],
  );

  const shimmerSecondaryTextStyle = useMemo(
    () => [
      expandableBadgeStylesheet.secondaryLabel,
      expandableBadgeStylesheet.shimmerText,
      shimmerSecondaryStyle,
    ],
    [shimmerSecondaryStyle],
  );

  // M2: the leading chevron (default badge only — the activity-summary row's trailing chevron
  // stays fixed, see `renderExpandableBadgeTrailingChevron`) rotates instead of snapping.
  const chevronRotationDegrees = useSharedValue(isExpanded ? 90 : 0);
  useEffect(() => {
    const target = isExpanded ? 90 : 0;
    chevronRotationDegrees.value = reducedMotion
      ? target
      : withTiming(target, { duration: MOTION_DURATION.base, easing: MOTION_EASING.standard });
  }, [isExpanded, reducedMotion, chevronRotationDegrees]);
  const chevronAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1.3 }, { rotate: `${chevronRotationDegrees.value}deg` }],
  }));
  const chevronStyle = useMemo(
    () => [expandableBadgeStylesheet.chevron, LUCIDE_CHEVRON_NUDGE_LEFT, chevronAnimatedStyle],
    [chevronAnimatedStyle],
  );

  const ThemedIcon = useMemo(() => (icon ? withUnistyles(icon) : null), [icon]);
  const iconNode = renderExpandableBadgeIcon({ isError, isActive: labelIsActive, ThemedIcon });
  const iconSlotNode = renderExpandableBadgeIconSlot({
    activitySummary,
    isInteractive,
    isHovered,
    isExpanded,
    chevronStyle,
    iconNode,
  });

  const pressHandlers = isInteractive
    ? {
        onPress: onToggle,
        onPressIn: handlePressIn,
        onPressOut: handlePressOut,
        accessibilityRole: "button" as const,
      }
    : {};

  return (
    <View
      style={containerStyle}
      testID={testID}
      onPointerEnter={isWeb ? handleHoverIn : undefined}
      onPointerLeave={isWeb ? handleHoverOut : undefined}
    >
      <Pressable
        {...pressHandlers}
        disabled={!isInteractive}
        accessibilityState={accessibilityState}
        style={pressableStyle}
      >
        <View style={expandableBadgeStylesheet.headerRow}>
          <View style={expandableBadgeStylesheet.iconBadge}>{iconSlotNode}</View>
          <ExpandableBadgeLabelRow
            label={label}
            labelStyle={labelStyle}
            secondaryLabel={secondaryLabel}
            secondaryLabelStyle={secondaryLabelStyle}
            shouldMeasureWebShimmer={shouldMeasureWebShimmer}
            shouldMeasureNativeShimmer={shouldMeasureNativeShimmer}
            isWebShimmer={isWebShimmer}
            isNativeShimmer={isNativeShimmer}
            shimmerLabelTextStyle={shimmerLabelTextStyle}
            shimmerSecondaryTextStyle={shimmerSecondaryTextStyle}
            labelRowWidth={labelRowWidth}
            labelRowHeight={labelRowHeight}
            nativeShimmerPeakWidth={nativeShimmerPeakWidth}
            shimmerDuration={shimmerDuration}
            nativeGradientId={nativeGradientIdRef.current}
            onLabelRowLayout={handleLabelRowLayout}
            onLabelLayout={handleLabelLayout}
            onSecondaryLayout={handleSecondaryLayout}
            showOpenFileButton={Boolean(onOpenFile && isHovered)}
            isOpenFileHovered={isOpenFileHovered}
            onOpenFilePress={handleOpenFilePress}
            onOpenFileHoverIn={handleOpenFileHoverIn}
            onOpenFileHoverOut={handleOpenFileHoverOut}
          />
          {renderExpandableBadgeTrailingChevron({ activitySummary, isInteractive })}
        </View>
      </Pressable>
      {detailContent ? (
        <Animated.View style={[detailWrapperStyle, detailAnimatedStyle]}>
          <Pressable
            ref={detailWrapperRef}
            onHoverIn={handleDetailHoverIn}
            onHoverOut={handleDetailHoverOut}
            onLayout={handleDetailContentLayout}
          >
            {detailContent}
          </Pressable>
        </Animated.View>
      ) : null}
    </View>
  );
}, areExpandableBadgePropsEqual);

function areExpandableBadgePropsEqual(previous: ExpandableBadgeProps, next: ExpandableBadgeProps) {
  if (previous.label !== next.label) return false;
  if (previous.secondaryLabel !== next.secondaryLabel) return false;
  if (previous.icon !== next.icon) return false;
  if (previous.isExpanded !== next.isExpanded) return false;
  if (previous.style !== next.style) return false;
  if (previous.isLoading !== next.isLoading) return false;
  if (previous.isError !== next.isError) return false;
  if (previous.isLastInSequence !== next.isLastInSequence) return false;
  if (previous.disableOuterSpacing !== next.disableOuterSpacing) return false;
  if (previous.borderlessWhenExpanded !== next.borderlessWhenExpanded) return false;
  if (previous.activitySummary !== next.activitySummary) return false;
  if (previous.testID !== next.testID) return false;
  if (previous.onToggle !== next.onToggle) return false;
  if (previous.onOpenFile !== next.onOpenFile) return false;
  if (previous.onDetailHoverChange !== next.onDetailHoverChange) return false;
  if (previous.renderDetails !== next.renderDetails) return false;
  return true;
}

interface ToolCallProps {
  toolName: string;
  args?: unknown;
  result?: unknown;
  error?: unknown;
  status: "executing" | "running" | "completed" | "failed" | "canceled";
  detail?: ToolCallDetail;
  cwd?: string;
  metadata?: Record<string, unknown>;
  isLastInSequence?: boolean;
  disableOuterSpacing?: boolean;
  onInlineDetailsHoverChange?: (hovered: boolean) => void;
  onInlineDetailsExpandedChange?: (expanded: boolean) => void;
  onOpenFilePath?: (filePath: string) => void;
  defaultExpanded?: boolean;
  forceInline?: boolean;
  maxDetailHeight?: number;
  /** The native provider that produced this call — only set for provider-sourced tool calls. */
  provider?: string;
  /** The call's own id — Claude's provider-subagent descriptors are keyed under this. */
  callId?: string;
  serverId?: string;
  /** The hosting pane's own top-level agent id, for subagent-row lookups; see
   * `SubagentToolCallRowProps.parentAgentId`. */
  agentId?: string;
  workspaceId?: string;
  /** A read-only (nested provider-subagent) pane — `agentId` there is a synthetic stream id, not
   * a real managed agent id, so subagent-row native lookups must not trust it. */
  readOnly?: boolean;
}

export const ToolCall = memo(function ToolCall({
  toolName,
  args,
  result,
  error,
  status,
  detail,
  cwd,
  metadata,
  isLastInSequence = false,
  disableOuterSpacing,
  onInlineDetailsHoverChange,
  onInlineDetailsExpandedChange,
  onOpenFilePath,
  defaultExpanded,
  forceInline = false,
  maxDetailHeight = 400,
  provider,
  callId,
  serverId,
  agentId,
  workspaceId,
  readOnly = false,
}: ToolCallProps) {
  const { openToolCall } = useToolCallSheet();
  const [isExpanded, setIsExpanded] = useState(defaultExpanded ?? false);

  const isMobile = useIsCompactFormFactor();
  const shouldRenderInline = !isMobile || forceInline;

  const effectiveDetail = useMemo<ToolCallDetail | undefined>(() => {
    if (detail) {
      return detail;
    }
    if (args !== undefined || result !== undefined) {
      return {
        type: "unknown",
        input: args ?? null,
        output: result ?? null,
      };
    }
    return undefined;
  }, [detail, args, result]);

  const presentation = useMemo(
    () =>
      buildToolCallPresentation({
        toolName,
        status,
        error: error ?? null,
        detail: effectiveDetail,
        metadata,
        cwd,
        resolveIcon: resolveToolCallIcon,
      }),
    [toolName, status, error, effectiveDetail, metadata, cwd],
  );

  const subagentLink = useMemo(
    () => resolveSubagentToolCallLink({ toolName, detail: effectiveDetail, provider, callId }),
    [toolName, effectiveDetail, provider, callId],
  );

  const handleOpenFile = useMemo(() => {
    const openFilePath = presentation.openFilePath;
    if (!openFilePath || !onOpenFilePath) {
      return undefined;
    }
    return () => onOpenFilePath(openFilePath);
  }, [presentation.openFilePath, onOpenFilePath]);

  const handleToggle = useCallback(() => {
    if (!shouldRenderInline) {
      openToolCall({
        toolName,
        displayName: presentation.displayName,
        summary: presentation.summary,
        detail: effectiveDetail,
        errorText: presentation.errorText,
        icon: presentation.icon,
        showLoadingSkeleton: presentation.isLoadingDetails,
      });
    } else {
      setIsExpanded((prev) => !prev);
    }
  }, [
    shouldRenderInline,
    openToolCall,
    toolName,
    presentation.displayName,
    presentation.summary,
    presentation.errorText,
    presentation.icon,
    presentation.isLoadingDetails,
    effectiveDetail,
  ]);

  useEffect(() => {
    if (!onInlineDetailsHoverChange || !shouldRenderInline || isExpanded) {
      return;
    }
    onInlineDetailsHoverChange(false);
  }, [isExpanded, shouldRenderInline, onInlineDetailsHoverChange]);

  useEffect(() => {
    if (!onInlineDetailsExpandedChange) {
      return;
    }
    if (!shouldRenderInline) {
      onInlineDetailsExpandedChange(false);
      return;
    }
    onInlineDetailsExpandedChange(isExpanded);
  }, [isExpanded, shouldRenderInline, onInlineDetailsExpandedChange]);

  useEffect(() => {
    if (!onInlineDetailsExpandedChange) {
      return () => {};
    }
    return () => {
      onInlineDetailsExpandedChange(false);
    };
  }, [onInlineDetailsExpandedChange]);

  // Render inline details for desktop
  const renderDetails = useCallback(() => {
    if (!shouldRenderInline) return null;
    return (
      <ToolCallDetailsContent
        toolName={toolName}
        detail={effectiveDetail}
        errorText={presentation.errorText}
        maxHeight={maxDetailHeight}
        showLoadingSkeleton={presentation.isLoadingDetails}
      />
    );
  }, [
    shouldRenderInline,
    toolName,
    effectiveDetail,
    presentation.errorText,
    presentation.isLoadingDetails,
    maxDetailHeight,
  ]);

  if (presentation.isPlan && effectiveDetail?.type === "plan") {
    return (
      <PlanCard
        text={effectiveDetail.text}
        outcome={presentation.planOutcome}
        testID="timeline-plan-card"
        disableOuterSpacing={disableOuterSpacing}
      />
    );
  }

  if (subagentLink && serverId && effectiveDetail) {
    return (
      <SubagentToolCallRow
        link={subagentLink}
        toolName={toolName}
        detail={effectiveDetail}
        toolCallStatus={status}
        errorText={presentation.errorText}
        isLoadingDetails={presentation.isLoadingDetails}
        serverId={serverId}
        parentAgentId={readOnly ? null : (agentId ?? null)}
        workspaceId={workspaceId}
        isLastInSequence={isLastInSequence}
        disableOuterSpacing={disableOuterSpacing}
      />
    );
  }

  return (
    <ExpandableBadge
      testID="tool-call-badge"
      label={presentation.displayName}
      secondaryLabel={presentation.summary}
      icon={presentation.icon}
      isExpanded={shouldRenderInline && isExpanded}
      onToggle={presentation.canOpenDetails ? handleToggle : undefined}
      onOpenFile={handleOpenFile}
      renderDetails={presentation.canOpenDetails && shouldRenderInline ? renderDetails : undefined}
      isLoading={status === "running" || status === "executing"}
      isError={status === "failed"}
      isLastInSequence={isLastInSequence}
      disableOuterSpacing={disableOuterSpacing}
      onDetailHoverChange={onInlineDetailsHoverChange}
    />
  );
}, areToolCallPropsEqual);

function areToolCallPropsEqual(previous: ToolCallProps, next: ToolCallProps) {
  return areToolCallCorePropsEqual(previous, next) && areSubagentRowPropsEqual(previous, next);
}

function areToolCallCorePropsEqual(previous: ToolCallProps, next: ToolCallProps) {
  if (previous.toolName !== next.toolName) return false;
  if (previous.args !== next.args) return false;
  if (previous.result !== next.result) return false;
  if (previous.error !== next.error) return false;
  if (previous.status !== next.status) return false;
  if (previous.detail !== next.detail) return false;
  if (previous.cwd !== next.cwd) return false;
  if (previous.metadata !== next.metadata) return false;
  if (previous.isLastInSequence !== next.isLastInSequence) return false;
  if (previous.disableOuterSpacing !== next.disableOuterSpacing) return false;
  if (previous.onOpenFilePath !== next.onOpenFilePath) return false;
  if (previous.defaultExpanded !== next.defaultExpanded) return false;
  if (previous.forceInline !== next.forceInline) return false;
  if (previous.maxDetailHeight !== next.maxDetailHeight) return false;
  return true;
}

/** The props `SubagentToolCallRow` reads — split out so the comparator stays under the
 * complexity ceiling rather than growing one giant function every time a prop is added. */
function areSubagentRowPropsEqual(previous: ToolCallProps, next: ToolCallProps) {
  if (previous.provider !== next.provider) return false;
  if (previous.callId !== next.callId) return false;
  if (previous.serverId !== next.serverId) return false;
  if (previous.agentId !== next.agentId) return false;
  if (previous.workspaceId !== next.workspaceId) return false;
  if (previous.readOnly !== next.readOnly) return false;
  return true;
}
