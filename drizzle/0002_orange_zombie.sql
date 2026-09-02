CREATE INDEX `studio_change_sets_workspace_revision_idx` ON `studio_change_sets` (`workspace_id`,`base_revision`);--> statement-breakpoint
CREATE UNIQUE INDEX `studio_commits_workspace_revision_unique` ON `studio_commits` (`workspace_id`,`revision`);--> statement-breakpoint
CREATE INDEX `studio_commits_workspace_committed_idx` ON `studio_commits` (`workspace_id`,`committed_at`);