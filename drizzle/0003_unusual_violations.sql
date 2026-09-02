CREATE TABLE `model_request_budget_guard` (
	`attempt` integer NOT NULL
);
--> statement-breakpoint
CREATE TRIGGER `reject_model_request_budget_guard`
BEFORE INSERT ON `model_request_budget_guard`
BEGIN
	SELECT RAISE(ABORT, 'MEANT_MODEL_BUDGET_EXCEEDED');
END;
--> statement-breakpoint
CREATE TABLE `model_request_windows` (
	`principal_id` text NOT NULL,
	`route` text NOT NULL,
	`window_start` integer NOT NULL,
	`request_count` integer NOT NULL,
	PRIMARY KEY(`principal_id`, `route`, `window_start`)
);
--> statement-breakpoint
CREATE INDEX `model_request_windows_cleanup_idx` ON `model_request_windows` (`window_start`);
