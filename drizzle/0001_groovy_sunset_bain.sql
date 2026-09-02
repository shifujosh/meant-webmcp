CREATE TABLE `studio_change_sets` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`base_revision` integer NOT NULL,
	`operation_digest` text NOT NULL,
	`payload` text NOT NULL,
	`status` text DEFAULT 'staged' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`consumed_at` text
);
--> statement-breakpoint
CREATE TABLE `studio_commits` (
	`id` text PRIMARY KEY NOT NULL,
	`workspace_id` text NOT NULL,
	`project_id` text NOT NULL,
	`parent_revision` integer NOT NULL,
	`revision` integer NOT NULL,
	`kind` text NOT NULL,
	`reverted_change_id` text,
	`operation_digest` text NOT NULL,
	`summary` text NOT NULL,
	`before_payload` text NOT NULL,
	`after_payload` text NOT NULL,
	`committed_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
