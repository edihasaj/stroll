import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import type pino from "pino";
import { AgentBriefSchema, AgentRouteEventSchema } from "@getpaseo/protocol/agent-route";
import type { AgentBrief, AgentRouteEvent } from "@getpaseo/protocol/agent-route";
import { writeJsonFileAtomic } from "../../atomic-file.js";

/** Briefs live outside the agent record directory: docs/agent-routes.md. */
const AGENT_BRIEFS_DIRNAME = "agent-briefs";

const AgentBriefRecordSchema = z.object({
  brief: AgentBriefSchema.nullable(),
  events: z.array(AgentRouteEventSchema),
});

export type AgentBriefRecord = z.infer<typeof AgentBriefRecordSchema>;

const EMPTY_RECORD: AgentBriefRecord = { brief: null, events: [] };

/** Per-thread JSON at `$PASEO_HOME/agent-briefs/<threadId>.json` (docs/agent-routes.md). */
export interface AgentBriefStore {
  /** A missing or corrupt file reads as an empty record; corruption is logged. */
  read(threadId: string): Promise<AgentBriefRecord>;
  /** Replaces the stored brief, keeping the thread's event history. */
  writeBrief(threadId: string, brief: AgentBrief | null): Promise<void>;
  /** Appends one route event to the thread's history, keeping the stored brief. */
  appendEvent(threadId: string, event: AgentRouteEvent): Promise<void>;
}

export function createAgentBriefStore(options: {
  paseoHome: string;
  logger: Pick<pino.Logger, "warn">;
}): AgentBriefStore {
  const root = path.join(options.paseoHome, AGENT_BRIEFS_DIRNAME);
  const writesByThread = new Map<string, Promise<void>>();

  function filePath(threadId: string): string {
    return path.join(root, `${sanitizeThreadIdForFileName(threadId)}.json`);
  }

  async function read(threadId: string): Promise<AgentBriefRecord> {
    let raw: string;
    try {
      raw = await fs.readFile(filePath(threadId), "utf8");
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return { ...EMPTY_RECORD };
      }
      options.logger.warn(
        { err: error, threadId },
        "Failed to read agent brief file, treating thread as empty",
      );
      return { ...EMPTY_RECORD };
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch (error) {
      options.logger.warn(
        { err: error, threadId },
        "Corrupt agent brief file (invalid JSON), treating thread as empty",
      );
      return { ...EMPTY_RECORD };
    }

    const parsed = AgentBriefRecordSchema.safeParse(parsedJson);
    if (!parsed.success) {
      options.logger.warn(
        { threadId, issues: parsed.error.issues },
        "Corrupt agent brief file (schema mismatch), treating thread as empty",
      );
      return { ...EMPTY_RECORD };
    }
    return parsed.data;
  }

  function mutate(
    threadId: string,
    mutation: (current: AgentBriefRecord) => AgentBriefRecord,
  ): Promise<void> {
    const previous = writesByThread.get(threadId) ?? Promise.resolve();
    const next = previous
      .catch(() => undefined)
      .then(async () => {
        const current = await read(threadId);
        return writeJsonFileAtomic(filePath(threadId), mutation(current));
      });
    const tracked = next.finally(() => {
      if (writesByThread.get(threadId) === tracked) {
        writesByThread.delete(threadId);
      }
    });
    writesByThread.set(threadId, tracked);
    return tracked;
  }

  return {
    read,
    writeBrief(threadId, brief) {
      return mutate(threadId, (current) => ({ ...current, brief }));
    },
    appendEvent(threadId, event) {
      return mutate(threadId, (current) => ({ ...current, events: [...current.events, event] }));
    },
  };
}

function sanitizeThreadIdForFileName(threadId: string): string {
  const sanitized = threadId.trim().replace(/[^A-Za-z0-9._-]/g, "_");
  return sanitized.length > 0 ? sanitized : "_";
}
