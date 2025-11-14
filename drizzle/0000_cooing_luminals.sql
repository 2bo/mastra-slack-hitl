CREATE TABLE `slack_metadata` (
	`run_id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`message_ts` text,
	`thread_ts` text,
	`requester` text NOT NULL,
	`deadline_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_slack_metadata_deadline` ON `slack_metadata` (`deadline_at`);--> statement-breakpoint
CREATE INDEX `idx_slack_metadata_channel` ON `slack_metadata` (`channel_id`);