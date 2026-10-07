import { useCallback, useMemo, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import { Platform, Text, View, type StyleProp, type TextStyle, type ViewStyle } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { isNative, isWeb } from "@/constants/platform";
import { MarkdownTextSpan } from "@/components/markdown-text";
import { MarkdownLinkText } from "@/components/markdown/link-text";
import { ContextMenu } from "@/components/ui/context-menu";
import { AssistantLinkPressProvider, type AssistantLinkPress } from "./link-press-context";
import { LinkActionsMenuContent, useLinkActionsMenuGesture } from "./link-actions-menu";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { CODE_SURFACE_DATASET } from "@/styles/code-surface";
import { markdownCopyDataSet } from "@/assistant-selection-copy/markup";
import { useAssistantFileLinkResolverContext } from "./provider";
import type { InlinePathTarget } from "./parse";
import type { AssistantFileLinkSource } from "./resolver";
import { formatFileLinkTooltipPath } from "./tooltip-path";
import { useFileLink } from "./use-file-link";

interface AssistantMarkdownLinkProps {
  source: AssistantFileLinkSource;
  style: StyleProp<TextStyle>;
  monoSurface?: boolean;
  children: ReactNode;
}

const MARKDOWN_CODE_LINK_DATASET = {
  ...CODE_SURFACE_DATASET,
  ...markdownCopyDataSet.code,
} as const;

export function AssistantMarkdownLink({
  source,
  style,
  monoSurface,
  children,
}: AssistantMarkdownLinkProps) {
  const { target, onHoverIn, onPress, open } = useFileLink(source);
  const { configRef } = useAssistantFileLinkResolverContext();
  const workspaceRoot = configRef.current.workspaceRoot;
  const serverId = configRef.current.serverId;
  const tooltipPath = useMemo(
    () => (target ? formatFileLinkTooltipPath({ target, workspaceRoot }) : null),
    [target, workspaceRoot],
  );
  const handleOpenToSide = useCallback(() => open(source, "side"), [open, source]);

  const linkRender = (
    <AssistantMarkdownLinkRender
      source={source}
      style={style}
      monoSurface={monoSurface}
      tooltipPath={tooltipPath}
      onPress={onPress}
      onHoverIn={onHoverIn}
    >
      {children}
    </AssistantMarkdownLinkRender>
  );

  // Only a resolved file/folder target gets the right-click/long-press actions menu — an
  // external or unresolved link keeps its plain click behavior unchanged.
  if (!target) {
    return linkRender;
  }

  return (
    <ContextMenu>
      <AssistantFileLinkMenuMount
        source={source}
        style={style}
        monoSurface={monoSurface}
        tooltipPath={tooltipPath}
        onPress={onPress}
        onHoverIn={onHoverIn}
        target={target}
        serverId={serverId}
        workspaceRoot={workspaceRoot}
        onOpenToSide={handleOpenToSide}
      >
        {children}
      </AssistantFileLinkMenuMount>
    </ContextMenu>
  );
}

interface AssistantFileLinkMenuMountProps {
  source: AssistantFileLinkSource;
  style: StyleProp<TextStyle>;
  monoSurface?: boolean;
  tooltipPath: string | null;
  onPress: () => void;
  onHoverIn: () => void;
  target: InlinePathTarget;
  serverId?: string;
  workspaceRoot?: string;
  onOpenToSide: () => void;
  children: ReactNode;
}

/**
 * Mounted only once a link resolves to a file/folder target, inside the `<ContextMenu>` this
 * file renders around it. `useContextMenu()` needs that ancestor, which is why the gesture
 * handlers live here rather than in `AssistantMarkdownLink` itself.
 *
 * This opens the menu by calling `setAnchorRect`/`setOpen` directly instead of rendering a
 * `ContextMenuTrigger` around the link: that trigger wraps its children in a View, and on iOS the
 * link is a UITextView leaf span that a wrapping View would break out of (see
 * AssistantMarkdownLinkRender's native branch below) — the same hoisting failure mode a plain
 * `<Text>` hits there.
 */
function AssistantFileLinkMenuMount({
  source,
  style,
  monoSurface,
  tooltipPath,
  onPress,
  onHoverIn,
  target,
  serverId,
  workspaceRoot,
  onOpenToSide,
  children,
}: AssistantFileLinkMenuMountProps) {
  const { onLongPress, onContextMenu } = useLinkActionsMenuGesture();

  return (
    <>
      <AssistantMarkdownLinkRender
        source={source}
        style={style}
        monoSurface={monoSurface}
        tooltipPath={tooltipPath}
        onPress={onPress}
        onHoverIn={onHoverIn}
        onLongPress={isNative ? onLongPress : undefined}
        onContextMenu={isWeb ? onContextMenu : undefined}
      >
        {children}
      </AssistantMarkdownLinkRender>
      <LinkActionsMenuContent
        target={target}
        serverId={serverId}
        workspaceRoot={workspaceRoot}
        onOpen={onPress}
        onOpenToSide={onOpenToSide}
        testIDPrefix="assistant-file-link"
      />
    </>
  );
}

interface AssistantMarkdownLinkRenderProps {
  source: AssistantFileLinkSource;
  style: StyleProp<TextStyle>;
  monoSurface?: boolean;
  children: ReactNode;
  tooltipPath: string | null;
  onPress: () => void;
  onHoverIn: () => void;
  onLongPress?: (event: unknown) => void;
  onContextMenu?: (event: unknown) => void;
}

function AssistantMarkdownLinkRender({
  source,
  style,
  monoSurface,
  children,
  tooltipPath,
  onPress,
  onHoverIn,
  onLongPress,
  onContextMenu,
}: AssistantMarkdownLinkRenderProps) {
  const linkPress = useMemo<AssistantLinkPress>(
    () => ({ onPress, onLongPress, accessibilityRole: "link" }),
    [onPress, onLongPress],
  );
  const unwrapForMarkdownCopy = source.sourceType === "inline-code" || source.markup === "linkify";

  if (isNative) {
    // Must be a MarkdownTextSpan, not a plain <Text>: on iOS the link renders
    // inside the paragraph's native UITextView, and a plain <Text> nested there
    // is not hoisted into a UITextViewChild, so its text is silently dropped
    // (the link disappears). The span composes correctly and stays selectable.
    //
    // Tap-to-open: react-native-uitextview only wires onPress onto the *string*
    // children it turns into RNUITextViewChild nodes — the element children that
    // markdown emits for link text pass through untouched, so an onPress placed
    // here never reaches a tappable native node. We thread it down through
    // AssistantLinkPressProvider so each leaf text span re-attaches it to its
    // own string children, where the native tap recognizer can find it. iOS
    // only: Android forwards onPress through nested <Text> already, and web uses
    // the <a> path below. onLongPress (the link actions menu) rides the same
    // leaf-span path as onPress for the same reason.
    const span = (
      <MarkdownTextSpan
        accessibilityRole="link"
        monoSurface={monoSurface}
        onPress={onPress}
        onLongPress={onLongPress}
        style={style}
      >
        {children}
      </MarkdownTextSpan>
    );
    return (
      <FileLinkHoverTooltip filePath={tooltipPath}>
        {Platform.OS === "ios" ? (
          <AssistantLinkPressProvider value={linkPress}>{span}</AssistantLinkPressProvider>
        ) : (
          span
        )}
      </FileLinkHoverTooltip>
    );
  }

  const anchor = (
    <a
      {...(unwrapForMarkdownCopy ? { "data-paseo-markdown-unwrap": "true" } : {})}
      href={source.href}
      title={source.title}
      onClickCapture={preventAnchorNavigation}
      onAuxClickCapture={preventAnchorNavigation}
      onContextMenu={onContextMenu}
      style={LINK_ANCHOR_STYLE}
    >
      <MarkdownLinkText
        dataSet={monoSurface ? MARKDOWN_CODE_LINK_DATASET : undefined}
        style={style}
        onPress={onPress}
        onHoverIn={onHoverIn}
      >
        {children}
      </MarkdownLinkText>
    </a>
  );

  return <FileLinkHoverTooltip filePath={tooltipPath}>{anchor}</FileLinkHoverTooltip>;
}

interface AssistantMarkdownCodeLinkProps {
  source: AssistantFileLinkSource;
  inheritedStyles: TextStyle;
  codeInlineStyle: TextStyle;
  linkStyle: TextStyle;
  children: ReactNode;
}

export function AssistantMarkdownCodeLink({
  source,
  inheritedStyles,
  codeInlineStyle,
  linkStyle,
  children,
}: AssistantMarkdownCodeLinkProps) {
  const style = useMemo(
    () => [inheritedStyles, codeInlineStyle, linkStyle],
    [inheritedStyles, codeInlineStyle, linkStyle],
  );
  return (
    <AssistantMarkdownLink source={source} style={style} monoSurface>
      {children}
    </AssistantMarkdownLink>
  );
}

interface AssistantInlineCodePathLinkProps {
  content: string;
  inheritedStyles: TextStyle;
  codeInlineStyle: TextStyle;
  linkStyle: TextStyle;
}

export function AssistantInlineCodePathLink({
  content,
  inheritedStyles,
  codeInlineStyle,
  linkStyle,
}: AssistantInlineCodePathLinkProps) {
  const source = useMemo<AssistantFileLinkSource>(
    () => ({
      href: content,
      text: content,
      sourceType: "inline-code",
    }),
    [content],
  );

  return (
    <AssistantMarkdownCodeLink
      source={source}
      inheritedStyles={inheritedStyles}
      codeInlineStyle={codeInlineStyle}
      linkStyle={linkStyle}
    >
      {content}
    </AssistantMarkdownCodeLink>
  );
}

const FILE_LINK_TOOLTIP_TRIGGER_STYLE: ViewStyle = {
  // RN doesn't type "inline-flex" but RN-web honors it at runtime, which keeps
  // the tooltip wrapper from breaking inline link flow.
  display: "inline-flex" as ViewStyle["display"],
};

function FileLinkHoverTooltip({
  filePath,
  children,
}: {
  filePath: string | null;
  children: ReactNode;
}) {
  if (!isWeb) {
    return children;
  }
  return (
    <Tooltip delayDuration={400}>
      <TooltipTrigger asChild>
        <View style={FILE_LINK_TOOLTIP_TRIGGER_STYLE}>{children}</View>
      </TooltipTrigger>
      {filePath ? (
        <TooltipContent side="top" align="start" maxWidth={520}>
          <Text selectable={false} style={styles.tooltipPath}>
            {filePath}
          </Text>
        </TooltipContent>
      ) : null}
    </Tooltip>
  );
}

const LINK_ANCHOR_STYLE: CSSProperties = {
  display: "contents",
  color: "inherit",
  textDecoration: "none",
};

function preventAnchorNavigation(event: MouseEvent<HTMLAnchorElement>): void {
  event.preventDefault();
}

const styles = StyleSheet.create((theme) => ({
  tooltipPath: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.normal,
  },
}));
