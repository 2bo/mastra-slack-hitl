import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  tablesFilter: ['slack_metadata'],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'file:./data/mastra.db',
  },
  verbose: process.env.LOG_LEVEL === 'debug',
  strict: true,
});
