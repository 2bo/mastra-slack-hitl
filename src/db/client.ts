import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { createClient, type Client, type Row } from '@libsql/client';

import { SLACK_METADATA_SCHEMA } from './schema';

const DEFAULT_DB_URL = 'file:./data/mastra.db';
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

export type SQLiteStorage = Client;

export const initDatabase = async (): Promise<SQLiteStorage> => {
  const config = buildConnectionConfig();
  ensureFileDirectory(config.url);

  const storage = createClient(config);

  if (isLocalDatabase(config.url)) {
    await storage.execute('PRAGMA journal_mode=WAL;');
    await storage.execute('PRAGMA busy_timeout = 5000;');
    await storage.execute('PRAGMA foreign_keys = ON;');
  }

  await runSchemaMigrations(storage, SLACK_METADATA_SCHEMA);

  return storage;
};

const buildConnectionConfig = () => {
  const url = process.env.DATABASE_URL ?? DEFAULT_DB_URL;
  const authToken = process.env.LIBSQL_AUTH_TOKEN;
  const syncUrl = process.env.LIBSQL_SYNC_URL;
  const syncInterval = process.env.LIBSQL_SYNC_INTERVAL
    ? Number(process.env.LIBSQL_SYNC_INTERVAL)
    : undefined;

  return {
    url,
    ...(authToken ? { authToken } : {}),
    ...(syncUrl ? { syncUrl } : {}),
    ...(Number.isFinite(syncInterval) ? { syncInterval } : {}),
  };
};

const ensureFileDirectory = (url: string) => {
  if (!url.startsWith('file:')) {
    return;
  }

  const filePath = url.replace('file:', '');
  if (filePath.startsWith(':memory:')) {
    return;
  }
  const absolutePath = resolve(filePath);
  mkdirSync(dirname(absolutePath), { recursive: true });
};

const isLocalDatabase = (url: string): boolean =>
  url.startsWith('file:') || url.includes(':memory:');

const runSchemaMigrations = async (storage: SQLiteStorage, schema: string) => {
  const statements = schema
    .split(';')
    .map((statement) => statement.trim())
    .filter(Boolean);

  for (const statement of statements) {
    await storage.execute(statement);
  }
};

export interface SlackMetadata {
  run_id: string;
  channel_id: string;
  message_ts: string | null;
  thread_ts: string | null;
  requester: string;
  deadline_at: number;
  created_at: number;
  updated_at: number;
}

export type SlackMetadataCreateInput = Omit<SlackMetadata, 'created_at' | 'updated_at'>;

export class SlackMetadataRepository {
  private readonly options: RetryOptions;

  constructor(
    private readonly storage: SQLiteStorage,
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
      this.storage.execute({
        sql: `
          INSERT INTO slack_metadata
          (run_id, channel_id, message_ts, thread_ts, requester, deadline_at, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `,
        args: [
          data.run_id,
          data.channel_id,
          data.message_ts ?? null,
          data.thread_ts ?? null,
          data.requester,
          data.deadline_at,
          now,
          now,
        ],
      }),
    );
  }

  async updateMessageTs(runId: string, messageTs: string): Promise<void> {
    await this.executeWithRetry(() =>
      this.storage.execute({
        sql: `UPDATE slack_metadata SET message_ts = ?, updated_at = ? WHERE run_id = ?`,
        args: [messageTs, Date.now(), runId],
      }),
    );
  }

  async updateThreadTs(runId: string, threadTs: string): Promise<void> {
    await this.executeWithRetry(() =>
      this.storage.execute({
        sql: `UPDATE slack_metadata SET thread_ts = ?, updated_at = ? WHERE run_id = ?`,
        args: [threadTs, Date.now(), runId],
      }),
    );
  }

  async getByRunId(runId: string): Promise<SlackMetadata | null> {
    const result = await this.executeWithRetry(() =>
      this.storage.execute({
        sql: `SELECT * FROM slack_metadata WHERE run_id = ?`,
        args: [runId],
      }),
    );

    return result.rows[0] ? mapRow(result.rows[0]) : null;
  }

  async getExpiredApprovals(now = Date.now()): Promise<SlackMetadata[]> {
    const result = await this.executeWithRetry(() =>
      this.storage.execute({
        sql: `
          SELECT *
          FROM slack_metadata
          WHERE deadline_at < ?
          ORDER BY deadline_at ASC
        `,
        args: [now],
      }),
    );

    return result.rows.map(mapRow);
  }

  async deleteByRunId(runId: string): Promise<void> {
    await this.executeWithRetry(() =>
      this.storage.execute({
        sql: `DELETE FROM slack_metadata WHERE run_id = ?`,
        args: [runId],
      }),
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

const mapRow = (row: Row): SlackMetadata => ({
  run_id: toRequiredString(row.run_id, 'run_id'),
  channel_id: toRequiredString(row.channel_id, 'channel_id'),
  message_ts: toOptionalString(row.message_ts),
  thread_ts: toOptionalString(row.thread_ts),
  requester: toRequiredString(row.requester, 'requester'),
  deadline_at: toNumber(row.deadline_at, 'deadline_at'),
  created_at: toNumber(row.created_at, 'created_at'),
  updated_at: toNumber(row.updated_at, 'updated_at'),
});

const toRequiredString = (value: unknown, field: string): string => {
  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }

  throw new Error(`Unexpected ${field} value.`);
};

const toOptionalString = (value: unknown): string | null => {
  if (value === null || typeof value === 'undefined') {
    return null;
  }

  if (typeof value === 'string') {
    return value;
  }

  if (typeof value === 'number' || typeof value === 'bigint') {
    return String(value);
  }

  return null;
};

const toNumber = (value: unknown, field: string): number => {
  if (typeof value === 'number') {
    return value;
  }

  if (typeof value === 'bigint') {
    return Number(value);
  }

  if (typeof value === 'string') {
    const numericValue = Number(value);
    if (!Number.isNaN(numericValue)) {
      return numericValue;
    }
  }

  throw new Error(`Unexpected ${field} value.`);
};
