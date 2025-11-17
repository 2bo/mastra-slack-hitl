import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * テーブル命名規則:
 * - このアプリが管理するテーブルには `slack_` プレフィックスを付ける
 * - Mastraが作成するテーブルは `mastra_` プレフィックス
 * - drizzle.config.ts の tablesFilter で `slack_*` を指定することで、
 *   Mastraのテーブルに影響を与えずに自動マイグレーションが可能
 */

export const slackMetadata = sqliteTable(
  'slack_metadata',
  {
    runId: text('run_id').primaryKey(),
    channelId: text('channel_id').notNull(),
    messageTs: text('message_ts'),
    threadTs: text('thread_ts'),
    approvalMessageTs: text('approval_message_ts'),
    requester: text('requester').notNull(),
    deadlineAt: integer('deadline_at').notNull(),
    timeoutNotifiedAt: integer('timeout_notified_at'),
    createdAt: integer('created_at').notNull(),
    updatedAt: integer('updated_at').notNull(),
  },
  (table) => ({
    deadlineIdx: index('idx_slack_metadata_deadline').on(table.deadlineAt),
    channelIdx: index('idx_slack_metadata_channel').on(table.channelId),
  }),
);

export type SlackMetadataSelect = typeof slackMetadata.$inferSelect;
export type SlackMetadataInsert = typeof slackMetadata.$inferInsert;

/**
 * 調査実行内容テーブル
 * ワークフローの実行ごとに調査クエリ・計画・結果を保存
 */
export const slackResearchRuns = sqliteTable('slack_research_runs', {
  runId: text('run_id')
    .primaryKey()
    .references(() => slackMetadata.runId),
  query: text('query'),
  plan: text('plan'),
  report: text('report'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export type SlackResearchRunSelect = typeof slackResearchRuns.$inferSelect;
export type SlackResearchRunInsert = typeof slackResearchRuns.$inferInsert;

export const slackFeedbacks = sqliteTable(
  'slack_feedbacks',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    runId: text('run_id')
      .notNull()
      .references(() => slackResearchRuns.runId),
    feedbackType: text('feedback_type', { enum: ['positive', 'negative'] }).notNull(),
    userId: text('user_id').notNull(),
    messageTs: text('message_ts'),
    createdAt: integer('created_at').notNull(),
  },
  (table) => ({
    runIdIdx: index('idx_slack_feedbacks_run_id').on(table.runId),
    createdAtIdx: index('idx_slack_feedbacks_created_at').on(table.createdAt),
  }),
);

export type SlackFeedbackSelect = typeof slackFeedbacks.$inferSelect;
export type SlackFeedbackInsert = typeof slackFeedbacks.$inferInsert;
