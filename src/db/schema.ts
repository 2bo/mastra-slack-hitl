export const SLACK_METADATA_SCHEMA = `
CREATE TABLE IF NOT EXISTS slack_metadata (
  run_id TEXT PRIMARY KEY,
  channel_id TEXT NOT NULL,
  message_ts TEXT,
  thread_ts TEXT,
  requester TEXT NOT NULL,
  deadline_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_slack_metadata_deadline ON slack_metadata(deadline_at);
CREATE INDEX IF NOT EXISTS idx_slack_metadata_channel ON slack_metadata(channel_id);
`;
