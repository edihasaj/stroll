import { describe, expect, it, vi } from "vitest";
import {
  applyDictationTranscript,
  computeCanStartDictation,
  resolveActiveSendBehavior,
  resolveAlternateSendAction,
  resolveComposerSendKey,
  resolveComposerSurfacePresentation,
  resolveOutgoingTurnBehavior,
  runAlternateSendAction,
  runDefaultSendAction,
  runMessageInputKeyboardAction,
  stopRealtimeVoice,
} from "./state";

const connected = { isConnected: true } as never;
const disconnected = { isConnected: false } as never;

function createDictationKeyboard({ startsRecording }: { startsRecording: boolean }) {
  let isRecording = false;
  const actions: string[] = [];

  return {
    actions,
    pressDictationShortcut: () =>
      runMessageInputKeyboardAction("dictation-toggle", {
        focusInput: () => undefined,
        isDictationRecording: () => isRecording,
        markTranscriptForSend: () => actions.push("send transcript"),
        startDictation: () => {
          actions.push("start");
          isRecording = startsRecording;
        },
        confirmDictation: () => {
          actions.push("confirm");
          isRecording = false;
        },
        cancelDictation: () => undefined,
        toggleRealtimeVoice: () => undefined,
        isRealtimeVoiceActive: false,
        toggleRealtimeVoiceMute: () => undefined,
      }),
  };
}

describe("composer surface presentation", () => {
  it("shows only the input when no voice overlay is active", () => {
    expect(resolveComposerSurfacePresentation(false)).toEqual({
      input: { opacity: 1, pointerEvents: "auto" },
      overlay: { opacity: 0, pointerEvents: "none" },
    });
  });

  it("shows only the voice overlay while voice UI is active", () => {
    expect(resolveComposerSurfacePresentation(true)).toEqual({
      input: { opacity: 0, pointerEvents: "none" },
      overlay: { opacity: 1, pointerEvents: "auto" },
    });
  });
});

describe("computeCanStartDictation", () => {
  it("returns false when socket is disconnected", () => {
    expect(
      computeCanStartDictation({
        client: disconnected,
        isReadyForDictation: true,
        disabled: false,
        dictationUnavailableMessage: null,
      }),
    ).toBe(false);
  });

  it("returns false when isReadyForDictation is explicitly false", () => {
    expect(
      computeCanStartDictation({
        client: connected,
        isReadyForDictation: false,
        disabled: false,
        dictationUnavailableMessage: null,
      }),
    ).toBe(false);
  });

  it("returns true when connected and ready", () => {
    expect(
      computeCanStartDictation({
        client: connected,
        isReadyForDictation: true,
        disabled: false,
        dictationUnavailableMessage: null,
      }),
    ).toBe(true);
  });

  it("falls back to socket connected state when isReadyForDictation is undefined", () => {
    expect(
      computeCanStartDictation({
        client: connected,
        isReadyForDictation: undefined,
        disabled: false,
        dictationUnavailableMessage: null,
      }),
    ).toBe(true);

    expect(
      computeCanStartDictation({
        client: disconnected,
        isReadyForDictation: undefined,
        disabled: false,
        dictationUnavailableMessage: null,
      }),
    ).toBe(false);
  });

  it("returns false when the input is disabled", () => {
    expect(
      computeCanStartDictation({
        client: connected,
        isReadyForDictation: true,
        disabled: true,
        dictationUnavailableMessage: null,
      }),
    ).toBe(false);
  });

  it("returns false when a dictation unavailable message is present", () => {
    expect(
      computeCanStartDictation({
        client: connected,
        isReadyForDictation: true,
        disabled: false,
        dictationUnavailableMessage: "Microphone unavailable",
      }),
    ).toBe(false);
  });

  it("returns false when client is null", () => {
    expect(
      computeCanStartDictation({
        client: null,
        isReadyForDictation: true,
        disabled: false,
        dictationUnavailableMessage: null,
      }),
    ).toBe(false);
  });
});

describe("dictation keyboard behavior", () => {
  it("starts dictation again after the previous dictation finishes", () => {
    const keyboard = createDictationKeyboard({ startsRecording: true });

    keyboard.pressDictationShortcut();
    keyboard.pressDictationShortcut();
    keyboard.pressDictationShortcut();

    expect(keyboard.actions).toEqual(["start", "send transcript", "confirm", "start"]);
  });

  it("can retry when starting dictation does not enter the recording state", () => {
    const keyboard = createDictationKeyboard({ startsRecording: false });

    keyboard.pressDictationShortcut();
    keyboard.pressDictationShortcut();

    expect(keyboard.actions).toEqual(["start", "start"]);
  });
});

describe("dictation transcript behavior", () => {
  it("publishes an auto-sent transcript to the composer before submitting it", () => {
    const actions: string[] = [];

    applyDictationTranscript("spoken prompt", {
      value: "typed context",
      defaultSendBehavior: "interrupt",
      isAgentRunning: false,
      onQueue: undefined,
      replaceText: (text) => actions.push(`replace:${text}`),
      onSubmit: (payload) => actions.push(`submit:${payload.text}`),
      attachments: [],
      cwd: "/repo",
      autoSend: true,
    });

    expect(actions).toEqual([
      "replace:typed context spoken prompt",
      "submit:typed context spoken prompt",
    ]);
  });
});

describe("composer send behavior", () => {
  it("steers into the parked turn when queue mode cannot advance past a permission", () => {
    expect(resolveActiveSendBehavior("queue", true)).toBe("steer");
    expect(resolveActiveSendBehavior("queue", false)).toBe("queue");
    expect(resolveActiveSendBehavior("steer", true)).toBe("steer");
    expect(resolveActiveSendBehavior("interrupt", true)).toBe("interrupt");
  });

  it("never makes the alternate gesture an interrupt", () => {
    expect(resolveAlternateSendAction("steer")).toBe("queue");
    expect(resolveAlternateSendAction("interrupt")).toBe("queue");
    expect(resolveAlternateSendAction("queue")).toBe("steer");
  });

  it("interrupts a running turn only when interrupt is the chosen default", () => {
    expect(resolveOutgoingTurnBehavior("steer")).toBe("steer");
    expect(resolveOutgoingTurnBehavior("queue")).toBe("steer");
    expect(resolveOutgoingTurnBehavior("interrupt")).toBe("interrupt");
  });

  function actions() {
    const calls: string[] = [];
    return {
      calls,
      handleSendMessage: () => calls.push("send"),
      handleQueueMessage: () => calls.push("queue"),
      onQueue: () => undefined,
    };
  }

  it("uses Enter to interrupt and Tab to queue when interrupt is selected", () => {
    const defaultAction = actions();
    runDefaultSendAction({
      defaultSendBehavior: "interrupt",
      isAgentRunning: true,
      onQueue: defaultAction.onQueue,
      handleSendMessage: defaultAction.handleSendMessage,
      handleQueueMessage: defaultAction.handleQueueMessage,
    });

    const alternateAction = actions();
    runAlternateSendAction({
      defaultSendBehavior: "interrupt",
      isAgentRunning: true,
      onQueue: alternateAction.onQueue,
      handleSendMessage: alternateAction.handleSendMessage,
      handleQueueMessage: alternateAction.handleQueueMessage,
    });

    expect(defaultAction.calls).toEqual(["send"]);
    expect(alternateAction.calls).toEqual(["queue"]);
  });

  it("uses Enter to steer and Tab to queue when steer is selected", () => {
    const defaultAction = actions();
    runDefaultSendAction({
      defaultSendBehavior: "steer",
      isAgentRunning: true,
      onQueue: defaultAction.onQueue,
      handleSendMessage: defaultAction.handleSendMessage,
      handleQueueMessage: defaultAction.handleQueueMessage,
    });

    const alternateAction = actions();
    runAlternateSendAction({
      defaultSendBehavior: "steer",
      isAgentRunning: true,
      onQueue: alternateAction.onQueue,
      handleSendMessage: alternateAction.handleSendMessage,
      handleQueueMessage: alternateAction.handleQueueMessage,
    });

    expect(defaultAction.calls).toEqual(["send"]);
    expect(alternateAction.calls).toEqual(["queue"]);
  });

  it("uses Enter to queue and Tab to steer when queue is selected", () => {
    const defaultAction = actions();
    runDefaultSendAction({
      defaultSendBehavior: "queue",
      isAgentRunning: true,
      onQueue: defaultAction.onQueue,
      handleSendMessage: defaultAction.handleSendMessage,
      handleQueueMessage: defaultAction.handleQueueMessage,
    });

    const alternateAction = actions();
    runAlternateSendAction({
      defaultSendBehavior: "queue",
      isAgentRunning: true,
      onQueue: alternateAction.onQueue,
      handleSendMessage: alternateAction.handleSendMessage,
      handleQueueMessage: alternateAction.handleQueueMessage,
    });

    expect(defaultAction.calls).toEqual(["queue"]);
    expect(alternateAction.calls).toEqual(["send"]);
  });
});

describe("composer send keys", () => {
  const running = {
    shiftKey: false,
    metaKey: false,
    ctrlKey: false,
    altKey: false,
    isAgentRunning: true,
    canQueue: true,
    hasSendableContent: true,
  };

  it("sends with Enter and runs the alternate action with Tab while a turn runs", () => {
    expect(resolveComposerSendKey({ ...running, key: "Enter" })).toBe("default");
    expect(resolveComposerSendKey({ ...running, key: "Tab" })).toBe("alternate");
  });

  it("keeps Mod+Enter as an alias for the alternate action", () => {
    expect(resolveComposerSendKey({ ...running, key: "Enter", metaKey: true })).toBe("alternate");
    expect(resolveComposerSendKey({ ...running, key: "Enter", ctrlKey: true })).toBe("alternate");
  });

  it("leaves Shift+Enter to insert a newline", () => {
    expect(resolveComposerSendKey({ ...running, key: "Enter", shiftKey: true })).toBeNull();
  });

  it("leaves Tab to focus navigation when there is nothing to queue", () => {
    expect(resolveComposerSendKey({ ...running, key: "Tab", hasSendableContent: false })).toBe(
      null,
    );
    expect(resolveComposerSendKey({ ...running, key: "Tab", isAgentRunning: false })).toBe(null);
    expect(resolveComposerSendKey({ ...running, key: "Tab", canQueue: false })).toBe(null);
  });

  it("leaves modified Tab to the global shortcuts", () => {
    expect(resolveComposerSendKey({ ...running, key: "Tab", shiftKey: true })).toBeNull();
    expect(resolveComposerSendKey({ ...running, key: "Tab", ctrlKey: true })).toBeNull();
    expect(resolveComposerSendKey({ ...running, key: "Tab", altKey: true })).toBeNull();
  });

  it("sends with Enter and ignores Mod+Enter's alternate while idle", () => {
    const idle = { ...running, isAgentRunning: false };
    expect(resolveComposerSendKey({ ...idle, key: "Enter" })).toBe("default");
    expect(resolveComposerSendKey({ ...idle, key: "Enter", metaKey: true })).toBe("default");
  });
});

describe("stopRealtimeVoice", () => {
  it("keeps voice mode active when the running agent refuses cancellation", async () => {
    const cancellationError = new Error("active run cancellation was not acknowledged");
    const cancelAgent = vi.fn().mockRejectedValue(cancellationError);
    const stopVoice = vi.fn().mockResolvedValue(undefined);

    await expect(
      stopRealtimeVoice({
        voice: { stopVoice },
        isRealtimeVoiceForCurrentAgent: true,
        isAgentRunning: true,
        client: { cancelAgent },
        voiceAgentId: "agent-1",
      }),
    ).rejects.toBe(cancellationError);

    expect(stopVoice).not.toHaveBeenCalled();
  });

  it("stops voice mode after the running agent acknowledges cancellation", async () => {
    const calls: string[] = [];

    await stopRealtimeVoice({
      voice: {
        stopVoice: async () => {
          calls.push("stop voice");
        },
      },
      isRealtimeVoiceForCurrentAgent: true,
      isAgentRunning: true,
      client: {
        cancelAgent: async () => {
          calls.push("cancel agent");
        },
      },
      voiceAgentId: "agent-1",
    });

    expect(calls).toEqual(["cancel agent", "stop voice"]);
  });
});
