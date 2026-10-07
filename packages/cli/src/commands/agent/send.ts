import { type Command } from "commander";
import { collectMultiple } from "../../utils/command-options.js";
import { connectToDaemon } from "../../utils/client.js";
import type {
  CommandOptions,
  SingleResult,
  OutputSchema,
  CommandError,
} from "../../output/index.js";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";

/** Result type for agent send command */
export interface AgentSendResult {
  agentId: string;
  status: "sent" | "queued" | "completed" | "timeout" | "permission" | "error";
  message: string;
}

/** Schema for agent send output */
export const agentSendSchema: OutputSchema<AgentSendResult> = {
  idField: "agentId",
  columns: [
    { header: "AGENT ID", field: "agentId", width: 12 },
    { header: "STATUS", field: "status", width: 12 },
    { header: "MESSAGE", field: "message", width: 40 },
  ],
};

export interface AgentSendOptions extends CommandOptions {
  wait?: boolean;
  image?: string[];
  prompt?: string;
  promptFile?: string;
  queue?: boolean;
  interrupt?: boolean;
}

export function addSendOptions(cmd: Command): Command {
  return cmd
    .description("Send a message/task to an existing agent")
    .argument("<id>", "Agent ID (or prefix)")
    .argument("[prompt]", "The message to send")
    .option("--prompt <text>", "Provide the message inline as a flag")
    .option("--prompt-file <path>", "Read the message from a UTF-8 text file")
    .option("--image <path>", "Attach image(s) to the message", collectMultiple, [])
    .option(
      "--queue",
      "If the agent is running, queue the message for after its current turn instead of steering it",
    )
    .option(
      "--interrupt",
      "If the agent is running, stop its current turn and send the message as a new one",
    )
    .option("--no-wait", "Return immediately without waiting for completion");
}

type SendMode = "steer" | "queue" | "interrupt";

/**
 * A message sent to a running agent steers its current turn by default: it reaches the agent at
 * the next tool boundary without stopping running tools or background jobs, matching the app's
 * Enter key. --queue waits for the turn to end; --interrupt is the only mode that cancels work.
 */
function resolveSendMode(options: AgentSendOptions): SendMode {
  if (options.queue && options.interrupt) {
    const error: CommandError = {
      code: "CONFLICTING_SEND_MODE",
      message: "Use either --queue or --interrupt, not both",
    };
    throw error;
  }
  if (options.queue && options.image && options.image.length > 0) {
    const error: CommandError = {
      code: "QUEUE_IMAGES_UNSUPPORTED",
      message: "Queued messages cannot carry images",
      details: "Send without --queue to steer the running turn with the image instead",
    };
    throw error;
  }
  if (options.queue) return "queue";
  if (options.interrupt) return "interrupt";
  return "steer";
}

async function queueMessage(
  client: Awaited<ReturnType<typeof connectToDaemon>>,
  agentIdArg: string,
  text: string,
): Promise<AgentSendResult> {
  // The queue is keyed by the full agent id, so resolve a prefix first.
  const fetched = await client.fetchAgent({ agentId: agentIdArg });
  if (!fetched) {
    const error: CommandError = {
      code: "AGENT_NOT_FOUND",
      message: `No agent found matching: ${agentIdArg}`,
      details: "Use `stroll ls` to list available agents",
    };
    throw error;
  }
  const agentId = fetched.agent.id;
  const response = await client.createAgentQueuePrompt({ agentId, text });
  if (response.error) {
    const error: CommandError = { code: "QUEUE_FAILED", message: response.error };
    throw error;
  }
  return {
    agentId,
    status: "queued",
    message: "Message queued; it runs when the agent's current turn ends",
  };
}

/**
 * Read image files and convert them to base64 data URIs
 */
async function readImageFiles(
  imagePaths: string[],
): Promise<Array<{ data: string; mimeType: string }>> {
  return Promise.all(
    imagePaths.map(async (path) => {
      try {
        const buffer = await readFile(path);
        const ext = extname(path).toLowerCase();

        let mimeType = "image/jpeg";
        switch (ext) {
          case ".png":
            mimeType = "image/png";
            break;
          case ".jpg":
          case ".jpeg":
            mimeType = "image/jpeg";
            break;
          case ".gif":
            mimeType = "image/gif";
            break;
          case ".webp":
            mimeType = "image/webp";
            break;
          default:
            mimeType = "image/jpeg";
        }

        return { data: buffer.toString("base64"), mimeType };
      } catch (err) {
        if (err && typeof err === "object" && "code" in err) throw err;
        const message = err instanceof Error ? err.message : String(err);
        throw {
          code: "IMAGE_READ_ERROR",
          message: `Failed to read image file: ${path}`,
          details: message,
        } satisfies CommandError;
      }
    }),
  );
}

async function resolvePromptInput(options: {
  promptArgument: string | undefined;
  promptOption: string | undefined;
  promptFile: string | undefined;
}): Promise<string> {
  const promptText = options.promptArgument?.trim();
  const promptOptionText = options.promptOption?.trim();
  const promptFilePath = options.promptFile?.trim();
  const providedSourceCount = [promptText, promptOptionText, promptFilePath].filter(Boolean).length;

  if (providedSourceCount > 1) {
    const error: CommandError = {
      code: "CONFLICTING_PROMPT_INPUT",
      message: "Provide exactly one of prompt argument, --prompt, or --prompt-file",
    };
    throw error;
  }

  if (promptText) {
    return options.promptArgument as string;
  }

  if (promptOptionText) {
    return options.promptOption as string;
  }

  if (!promptFilePath) {
    const error: CommandError = {
      code: "MISSING_PROMPT",
      message: "A prompt is required",
      details:
        "Usage: stroll agent send [options] <id> [prompt] | --prompt <text> | --prompt-file <path>",
    };
    throw error;
  }

  try {
    return await readFile(resolve(promptFilePath), "utf8");
  } catch (err) {
    if (err && typeof err === "object" && "code" in err) throw err;
    const message = err instanceof Error ? err.message : String(err);
    const error: CommandError = {
      code: "PROMPT_FILE_READ_ERROR",
      message: `Failed to read prompt file: ${promptFilePath}`,
      details: message,
    };
    throw error;
  }
}

type SendWaitState = Awaited<
  ReturnType<Awaited<ReturnType<typeof connectToDaemon>>["waitForFinish"]>
>;

function buildSendResult(agentIdArg: string, state: SendWaitState): AgentSendResult {
  const agentId = state.final?.id ?? agentIdArg;
  if (state.status === "timeout") {
    return { agentId, status: "timeout", message: "Timed out waiting for agent to finish" };
  }
  if (state.status === "permission") {
    return { agentId, status: "permission", message: "Agent is waiting for permission" };
  }
  if (state.status === "error") {
    return {
      agentId,
      status: "error",
      message: state.error ?? "Agent finished with error",
    };
  }
  return { agentId, status: "completed", message: "Agent completed processing the message" };
}

export async function runSendCommand(
  agentIdArg: string,
  prompt: string | undefined,
  options: AgentSendOptions,
  _command: Command,
): Promise<SingleResult<AgentSendResult>> {
  // Validate arguments
  if (!agentIdArg || agentIdArg.trim().length === 0) {
    const error: CommandError = {
      code: "MISSING_AGENT_ID",
      message: "Agent ID is required",
      details: "Usage: stroll agent send [options] <id> [prompt]",
    };
    throw error;
  }

  const promptInput = await resolvePromptInput({
    promptArgument: prompt,
    promptOption: options.prompt,
    promptFile: options.promptFile,
  });

  const mode = resolveSendMode(options);
  const client = await connectToDaemon({ target: options.daemonTarget });

  try {
    if (mode === "queue") {
      const queued = await queueMessage(client, agentIdArg, promptInput);
      await client.close();
      return { type: "single", data: queued, schema: agentSendSchema };
    }

    // Read image files if provided
    const images =
      options.image && options.image.length > 0 ? await readImageFiles(options.image) : undefined;

    const { dispatch } = await client.sendAgentMessage(agentIdArg, promptInput, {
      images,
      activeTurnBehavior: mode,
    });

    // The agent could not take a steer mid-turn, so the daemon queued it for after the turn.
    // Waiting now would report the current turn's outcome, not this message's.
    if (dispatch === "queued_fallback") {
      await client.close();
      return {
        type: "single",
        data: {
          agentId: agentIdArg,
          status: "queued",
          message: "Agent could not take the message mid-turn; queued for after the current turn",
        },
        schema: agentSendSchema,
      };
    }

    // If --no-wait, return immediately
    if (options.wait === false) {
      await client.close();

      return {
        type: "single",
        data: {
          agentId: agentIdArg,
          status: "sent",
          message: "Message sent, not waiting for completion",
        },
        schema: agentSendSchema,
      };
    }

    const state = await client.waitForFinish(agentIdArg, 600000); // 10 minute timeout
    await client.close();

    return {
      type: "single",
      data: buildSendResult(agentIdArg, state),
      schema: agentSendSchema,
    };
  } catch (err) {
    await client.close().catch(() => {});

    // Re-throw CommandError as-is
    if (err && typeof err === "object" && "code" in err) {
      throw err;
    }

    const message = err instanceof Error ? err.message : String(err);
    const error: CommandError = {
      code: "SEND_FAILED",
      message: `Failed to send message: ${message}`,
    };
    throw error;
  }
}
