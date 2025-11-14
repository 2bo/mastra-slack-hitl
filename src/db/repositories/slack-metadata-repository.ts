import { asc, eq, lt } from 'drizzle-orm';

import { type SQLiteDb } from '../connection';
import { slackMetadata, type SlackMetadataInsert, type SlackMetadataSelect } from '../schema';

const DEFAULT_MAX_RETRIES = Number(process.env.DB_MAX_RETRIES ?? 5);
const DEFAULT_INITIAL_BACKOFF_MS = Number(process.env.DB_INITIAL_BACKOFF_MS ?? 100);

interface RetryOptions {
  maxRetries: number;
  initialBackoffMs: number;
}

const DEFAULT_RETRY_OPTIONS: RetryOptions = {
  maxRetries: Number.isFinite(DEFAULT_MAX_RETRIES) ? DEFAULT_MAX_RETRIES : 5,
  initialBackoffMs: Number.isFinite(DEFAULT_INITIAL_BACKOFF_MS) ? DEFAULT_INITIAL_BACKOFF_MS : 100,
};

export type SlackMetadataCreateInput = Omit<SlackMetadataInsert, 'createdAt' | 'updatedAt'>;

export class SlackMetadataRepository {
  private readonly options: RetryOptions;

  constructor(
    private readonly db: SQLiteDb,
    options?: Partial<RetryOptions>,
  ) {
    this.options = {
      maxRetries: options?.maxRetries ?? DEFAULT_RETRY_OPTIONS.maxRetries,
      initialBackoffMs: options?.initialBackoffMs ?? DEFAULT_RETRY_OPTIONS.initialBackoffMs,
    };
  }

  async create(data: SlackMetadataCreateInput): Promise<void> {
    const now = Date.now();
    await this.executeWithRetry(() =>
      this.db.insert(slackMetadata).values({
        ...data,
        messageTs: data.messageTs ?? null,
        threadTs: data.threadTs ?? null,
        createdAt: now,
        updatedAt: now,
      }),
    );
  }

  async updateMessageTs(runId: string, messageTs: string): Promise<void> {
    await this.executeWithRetry(() =>
      this.db
        .update(slackMetadata)
        .set({ messageTs, updatedAt: Date.now() })
        .where(eq(slackMetadata.runId, runId)),
    );
  }

  async updateThreadTs(runId: string, threadTs: string): Promise<void> {
    await this.executeWithRetry(() =>
      this.db
        .update(slackMetadata)
        .set({ threadTs, updatedAt: Date.now() })
        .where(eq(slackMetadata.runId, runId)),
    );
  }

  async getByRunId(runId: string): Promise<SlackMetadataSelect | null> {
    return this.executeWithRetry(async () => {
      const record = await this.db.query.slackMetadata.findFirst({
        where: (table, { eq: equals }) => equals(table.runId, runId),
      });

      return record ?? null;
    });
  }

  async getExpiredApprovals(now = Date.now()): Promise<SlackMetadataSelect[]> {
    return this.executeWithRetry(() =>
      this.db
        .select()
        .from(slackMetadata)
        .where(lt(slackMetadata.deadlineAt, now))
        .orderBy(asc(slackMetadata.deadlineAt)),
    );
  }

  async deleteByRunId(runId: string): Promise<void> {
    await this.executeWithRetry(() =>
      this.db.delete(slackMetadata).where(eq(slackMetadata.runId, runId)),
    );
  }

  private async executeWithRetry<T>(operation: () => Promise<T>, attempt = 0): Promise<T> {
    try {
      return await operation();
    } catch (error) {
      if (this.shouldRetry(error) && attempt < this.options.maxRetries) {
        const backoff = this.options.initialBackoffMs * 2 ** attempt;
        await delay(backoff);
        return this.executeWithRetry(operation, attempt + 1);
      }

      throw error;
    }
  }

  private shouldRetry(error: unknown): boolean {
    if (!isRecord(error)) {
      return false;
    }

    const code = typeof error.code === 'string' ? error.code : undefined;
    const message = typeof error.message === 'string' ? error.message : undefined;

    if (code === 'SQLITE_BUSY') {
      return true;
    }

    if (message?.toLowerCase().includes('database is locked')) {
      return true;
    }

    return false;
  }
}

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
