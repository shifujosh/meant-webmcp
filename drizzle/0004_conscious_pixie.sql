CREATE TABLE `model_request_daily_budget_guard` (
	`attempt` integer NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER `reject_model_request_daily_budget_guard`
BEFORE INSERT ON `model_request_daily_budget_guard`
BEGIN
	SELECT RAISE(ABORT, 'MEANT_MODEL_DAILY_BUDGET_EXCEEDED');
END;
--> statement-breakpoint
CREATE TABLE `model_request_daily_budgets` (
	`principal_id` text NOT NULL,
	`day_start` integer NOT NULL,
	`request_count` integer NOT NULL,
	PRIMARY KEY(`principal_id`, `day_start`)
);
--> statement-breakpoint
CREATE INDEX `model_request_daily_budgets_cleanup_idx` ON `model_request_daily_budgets` (`day_start`);
