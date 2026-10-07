import { readFile } from "node:fs/promises";
import { z } from "zod";
import { writeJsonFileAtomic } from "../atomic-file.js";

/**
 * A subagent this daemon created on another computer's peer (docs/peers.md), tracked so
 * follow-up tool calls and the finish watch can find it by child agent id, including after a
 * daemon restart.
 */
export const RemoteSubagentRecordSchema = z.object({
  childAgentId: z.string(),
  peerId: z.string(),
  parentAgentId: z.string(),
  title: z.string(),
  createdAt: z.string(),
  notifyOnFinish: z.boolean(),
  /** Set once the finish watch observes a terminal state. Absent while still being watched. */
  finishedAt: z.string().optional(),
});
export type RemoteSubagentRecord = z.infer<typeof RemoteSubagentRecordSchema>;

/**
 * Persists remote subagent records as one JSON array at `$PASEO_HOME/remote-subagents.json`.
 * Loads lazily on first access and serializes writes so concurrent creations cannot clobber each
 * other's updates.
 */
export class RemoteSubagentRegistry {
  private records: Map<string, RemoteSubagentRecord> | null = null;
  private loading: Promise<Map<string, RemoteSubagentRecord>> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly filePath: string,
    private readonly write: (
      filePath: string,
      value: unknown,
    ) => Promise<void> = writeJsonFileAtomic,
  ) {}

  async list(): Promise<RemoteSubagentRecord[]> {
    const records = await this.ensureLoaded();
    return Array.from(records.values());
  }

  async get(childAgentId: string): Promise<RemoteSubagentRecord | null> {
    const records = await this.ensureLoaded();
    return records.get(childAgentId) ?? null;
  }

  async add(record: RemoteSubagentRecord): Promise<void> {
    await this.mutate((records) => {
      records.set(record.childAgentId, record);
    });
  }

  /** No-op once a record is already marked finished, so a late reconnect cannot clear it. */
  async markFinished(childAgentId: string, finishedAt: string): Promise<void> {
    await this.mutate((records) => {
      const existing = records.get(childAgentId);
      if (!existing || existing.finishedAt) {
        return;
      }
      records.set(childAgentId, { ...existing, finishedAt });
    });
  }

  private async mutate(apply: (records: Map<string, RemoteSubagentRecord>) => void): Promise<void> {
    const records = await this.ensureLoaded();
    apply(records);
    const next = this.writeQueue.then(() => this.persist(records));
    this.writeQueue = next.catch(() => undefined);
    await next;
  }

  private async persist(records: Map<string, RemoteSubagentRecord>): Promise<void> {
    await this.write(this.filePath, Array.from(records.values()));
  }

  private async ensureLoaded(): Promise<Map<string, RemoteSubagentRecord>> {
    if (this.records) {
      return this.records;
    }
    this.loading ??= this.load();
    this.records = await this.loading;
    return this.records;
  }

  private async load(): Promise<Map<string, RemoteSubagentRecord>> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      const parsed = z.array(RemoteSubagentRecordSchema).parse(JSON.parse(raw));
      return new Map(parsed.map((record) => [record.childAgentId, record]));
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return new Map();
      }
      throw error;
    }
  }
}
