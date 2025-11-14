import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

import { createClient, type Client } from '@libsql/client';
import { drizzle, type LibSQLDatabase } from 'drizzle-orm/libsql';
import { migrate } from 'drizzle-orm/libsql/migrator';

import { slackMetadata } from './schema';

const DEFAULT_DB_URL = 'file:./data/mastra.db';

const schema = { slackMetadata };

export type SQLiteDb = LibSQLDatabase<typeof schema>;

export interface DatabaseConnections {
  client: Client;
  db: SQLiteDb;
}

export const initDatabase = async (): Promise<DatabaseConnections> => {
  const config = buildConnectionConfig();
  ensureFileDirectory(config.url);

  const client = createClient(config);

  if (isLocalDatabase(config.url)) {
    await applyPragmas(client);
  }

  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: 'drizzle' });

  return { client, db };
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
  } satisfies Parameters<typeof createClient>[0];
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

const applyPragmas = async (client: Client) => {
  await client.execute('PRAGMA journal_mode=WAL;');
  await client.execute('PRAGMA busy_timeout = 5000;');
  await client.execute('PRAGMA foreign_keys = ON;');
};
