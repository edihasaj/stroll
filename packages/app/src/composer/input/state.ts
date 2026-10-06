import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { ActiveTurnBehavior } from "@getpaseo/protocol/messages";
import type { MessagePayload } from "@/composer/types";
import type { MessageInputKeyboardActionKind } from "@/keyboard/actions";

export type SendBehavior = ActiveTurnBehavior | "queue";

/** What the alternate send gesture (Tab, Mod+Enter, the secondary button) does while a turn runs. */
export type AlternateSendAction = "queue" | "steer";

/** Queueing behind a permission prompt would strand the message, so it steers into the parked turn. */
export function resolveActiveSendBehavior(
  sendBehavior: SendBehavior,
  hasPendingPermission: boolean,
): SendBehavior {
  return sendBehavior === "queue" && hasPendingPermission ? "steer" : sendBehavior;
}

/**
 * The alternate gesture is never an interrupt. Codex parity: Enter steers and Tab queues, and a
 * user who made Enter queue gets steering on Tab. Only the stop button, Escape, and an explicit
 * "interrupt" default cancel a running turn.
 */
export function resolveAlternateSendAction(defaultSendBehavior: SendBehavior): AlternateSendAction {
  return defaultSendBehavior === "queue" ? "steer" : "queue";
}

/** What a message sent now (not queued) asks of a running turn. Only an explicit choice interrupts. */
export function resolveOutgoingTurnBehavior(sendBehavior: SendBehavior): ActiveTurnBehavior {
  return sendBehavior === "interrupt" ? "interrupt" : "steer";
}

export type ComposerSendKeyIntent = "default" | "alternate" | null;

export interface ComposerSendKeyInput {
  key: string;
  shiftKey: boolean;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  isAgentRunning: boolean;
  canQueue: boolean;
  hasSendableContent: boolean;
}

/**
 * Maps a composer key press to a send intent. Tab only claims the key while a turn runs and there
 * is something to send; otherwise it keeps its focus-navigation meaning.
 */
export function resolveComposerSendKey(input: ComposerSendKeyInput): ComposerSendKeyIntent {
  const hasModifier = input.shiftKey || input.metaKey || input.ctrlKey || input.altKey;
  const canRunAlternate = input.isAgentRunning && input.canQueue;
  if (input.key === "Enter") {
    if (input.shiftKey) return null;
    const isModEnter = input.metaKey || input.ctrlKey;
    return isModEnter && canRunAlternate ? "alternate" : "default";
  }
  if (input.key === "Tab") {
    return !hasModifier && canRunAlternate && input.hasSendableContent ? "alternate" : null;
  }
  return null;
}

interface ComposerSurfaceState {
  opacity: 0 | 1;
  pointerEvents: "auto" | "none";
}

export interface ComposerSurfacePresentation {
  input: ComposerSurfaceState;
  overlay: ComposerSurfaceState;
}

const INPUT_PRESENTATION: ComposerSurfacePresentation = {
  input: { opacity: 1, pointerEvents: "auto" },
  overlay: { opacity: 0, pointerEvents: "none" },
};

const OVERLAY_PRESENTATION: ComposerSurfacePresentation = {
  input: { opacity: 0, pointerEvents: "none" },
  overlay: { opacity: 1, pointerEvents: "auto" },
};

export function resolveComposerSurfacePresentation(
  showOverlay: boolean,
): ComposerSurfacePresentation {
  return showOverlay ? OVERLAY_PRESENTATION : INPUT_PRESENTATION;
}

interface StopRealtimeVoiceContext {
  voice: { stopVoice: () => Promise<unknown> } | null | undefined;
  isRealtimeVoiceForCurrentAgent: boolean;
  isAgentRunning: boolean;
  client: { cancelAgent: (agentId: string) => Promise<unknown> } | null;
  voiceAgentId: string | undefined;
}

interface SendActionContext {
  defaultSendBehavior: SendBehavior;
  isAgentRunning: boolean;
  onQueue: ((payload: MessagePayload) => void) | undefined;
  handleSendMessage: () => void;
  handleQueueMessage: () => void;
}

interface DictationTranscriptContext {
  value: string;
  defaultSendBehavior: SendBehavior;
  isAgentRunning: boolean;
  onQueue: ((payload: MessagePayload) => void) | undefined;
  onSubmit: (payload: MessagePayload) => void;
  replaceText: (text: string) => void;
  attachments: MessagePayload["attachments"];
  cwd: string;
  autoSend: boolean;
}

export function applyDictationTranscript(text: string, ctx: DictationTranscriptContext): void {
  if (!text) return;
  const shouldPad = ctx.value.length > 0 && !/\s$/.test(ctx.value);
  const nextValue = `${ctx.value}${shouldPad ? " " : ""}${text}`;

  if (!ctx.autoSend) {
    ctx.replaceText(nextValue);
    return;
  }

  ctx.replaceText(nextValue);

  if (ctx.defaultSendBehavior === "queue" && ctx.isAgentRunning && ctx.onQueue) {
    ctx.onQueue({ text: nextValue, attachments: ctx.attachments, cwd: ctx.cwd });
    ctx.replaceText("");
    return;
  }

  ctx.onSubmit({
    text: nextValue,
    attachments: ctx.attachments,
    cwd: ctx.cwd,
    forceSend: ctx.isAgentRunning || undefined,
  });
}

interface MessageInputKeyboardActions {
  focusInput: () => void;
  isDictationRecording: () => boolean;
  markTranscriptForSend: () => void;
  confirmDictation: () => void | Promise<void>;
  cancelDictation: () => void | Promise<void>;
  startDictation: () => void | Promise<void>;
  toggleRealtimeVoice: () => void;
  isRealtimeVoiceActive: boolean;
  toggleRealtimeVoiceMute: () => void;
}

export function computeCanStartDictation(input: {
  client: DaemonClient | null;
  isReadyForDictation: boolean | undefined;
  disabled: boolean;
  dictationUnavailableMessage: string | null | undefined;
}): boolean {
  const socketConnected = input.client?.isConnected ?? false;
  const readyForDictation = input.isReadyForDictation ?? socketConnected;
  return (
    socketConnected && readyForDictation && !input.disabled && !input.dictationUnavailableMessage
  );
}

export function runDefaultSendAction(ctx: SendActionContext): void {
  if (ctx.defaultSendBehavior === "queue" && ctx.isAgentRunning && ctx.onQueue) {
    ctx.handleQueueMessage();
    return;
  }
  ctx.handleSendMessage();
}

export function runAlternateSendAction(ctx: SendActionContext): void {
  if (resolveAlternateSendAction(ctx.defaultSendBehavior) === "steer") {
    ctx.handleSendMessage();
    return;
  }
  if (ctx.isAgentRunning && ctx.onQueue) {
    ctx.handleQueueMessage();
  }
}

export function runMessageInputKeyboardAction(
  action: MessageInputKeyboardActionKind,
  actions: MessageInputKeyboardActions,
): boolean {
  if (action === "focus") {
    actions.focusInput();
    return true;
  }
  if (action === "send" || action === "dictation-confirm") {
    if (actions.isDictationRecording()) {
      actions.markTranscriptForSend();
      void actions.confirmDictation();
      return true;
    }
    return false;
  }
  if (action === "voice-toggle") {
    actions.toggleRealtimeVoice();
    return true;
  }
  if (action === "voice-mute-toggle") {
    if (actions.isRealtimeVoiceActive) {
      actions.toggleRealtimeVoiceMute();
    }
    return true;
  }
  if (action === "dictation-cancel") {
    if (actions.isDictationRecording()) {
      void actions.cancelDictation();
      return true;
    }
    return false;
  }
  if (action === "dictation-toggle") {
    if (actions.isDictationRecording()) {
      actions.markTranscriptForSend();
      void actions.confirmDictation();
    } else {
      void actions.startDictation();
    }
    return true;
  }
  return false;
}

export async function stopRealtimeVoice(ctx: StopRealtimeVoiceContext): Promise<void> {
  if (!ctx.voice || !ctx.isRealtimeVoiceForCurrentAgent) return;

  if (ctx.isAgentRunning) {
    if (!ctx.client || !ctx.voiceAgentId) {
      throw new Error("Cannot stop the running voice agent while the host is unavailable");
    }
    await ctx.client.cancelAgent(ctx.voiceAgentId);
  }

  await ctx.voice.stopVoice();
}
