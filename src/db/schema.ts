import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

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
