CREATE TABLE `slack_feedbacks` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`run_id` text NOT NULL,
	`feedback_type` text NOT NULL,
	`user_id` text NOT NULL,
	`message_ts` text,
	`created_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `slack_research_runs`(`run_id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `idx_slack_feedbacks_run_id` ON `slack_feedbacks` (`run_id`);--> statement-breakpoint
CREATE INDEX `idx_slack_feedbacks_created_at` ON `slack_feedbacks` (`created_at`);--> statement-breakpoint
CREATE TABLE `slack_metadata` (
	`run_id` text PRIMARY KEY NOT NULL,
	`channel_id` text NOT NULL,
	`message_ts` text,
	`thread_ts` text,
	`approval_message_ts` text,
	`requester` text NOT NULL,
	`deadline_at` integer NOT NULL,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_slack_metadata_deadline` ON `slack_metadata` (`deadline_at`);--> statement-breakpoint
CREATE INDEX `idx_slack_metadata_channel` ON `slack_metadata` (`channel_id`);--> statement-breakpoint
CREATE TABLE `slack_research_runs` (
	`run_id` text PRIMARY KEY NOT NULL,
	`query` text,
	`plan` text,
	`report` text,
	`created_at` integer NOT NULL,
	`updated_at` integer NOT NULL,
	FOREIGN KEY (`run_id`) REFERENCES `slack_metadata`(`run_id`) ON UPDATE no action ON DELETE no action
);
