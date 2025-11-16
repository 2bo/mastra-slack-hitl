import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'sqlite',
  schema: './src/db/schema.ts',
  out: './drizzle',
  // `slack_*` プレフィックスのテーブルのみをマイグレーション対象とする
  // これによりMastraが管理する `mastra_*` テーブルに影響を与えずにスキーマ変更が可能
  tablesFilter: ['slack_*'],
  dbCredentials: {
    url: process.env.DATABASE_URL ?? 'file:./data/mastra.db',
  },
  verbose: process.env.LOG_LEVEL === 'debug',
  strict: true,
});
