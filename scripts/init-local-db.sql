CREATE TABLE IF NOT EXISTS studio_projects (
  workspace_id text PRIMARY KEY NOT NULL,
  project_id text NOT NULL,
  payload text NOT NULL,
  revision integer DEFAULT 1 NOT NULL,
  created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  updated_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS studio_change_sets (
  id text PRIMARY KEY NOT NULL,
  workspace_id text NOT NULL,
  project_id text NOT NULL,
  base_revision integer NOT NULL,
  operation_digest text NOT NULL,
  payload text NOT NULL,
  status text DEFAULT 'staged' NOT NULL,
  created_at text DEFAULT CURRENT_TIMESTAMP NOT NULL,
  consumed_at text
);

CREATE TABLE IF NOT EXISTS studio_commits (
  id text PRIMARY KEY NOT NULL,
  workspace_id text NOT NULL,
  project_id text NOT NULL,
  parent_revision integer NOT NULL,
  revision integer NOT NULL,
  kind text NOT NULL,
  reverted_change_id text,
  operation_digest text NOT NULL,
  summary text NOT NULL,
  before_payload text NOT NULL,
  after_payload text NOT NULL,
  committed_at text DEFAULT CURRENT_TIMESTAMP NOT NULL
);

CREATE TABLE IF NOT EXISTS model_request_windows (
  principal_id text NOT NULL,
  route text NOT NULL,
  window_start integer NOT NULL,
  request_count integer NOT NULL,
  PRIMARY KEY (principal_id, route, window_start)
);

CREATE TABLE IF NOT EXISTS model_request_budget_guard (
  attempt integer NOT NULL
);

CREATE TABLE IF NOT EXISTS model_request_daily_budgets (
  principal_id text NOT NULL,
  day_start integer NOT NULL,
  request_count integer NOT NULL,
  PRIMARY KEY (principal_id, day_start)
);

CREATE TABLE IF NOT EXISTS model_request_daily_budget_guard (
  attempt integer NOT NULL
);

CREATE TRIGGER IF NOT EXISTS reject_model_request_budget_guard
BEFORE INSERT ON model_request_budget_guard
BEGIN
  SELECT RAISE(ABORT, 'MEANT_MODEL_BUDGET_EXCEEDED');
END;

CREATE TRIGGER IF NOT EXISTS reject_model_request_daily_budget_guard
BEFORE INSERT ON model_request_daily_budget_guard
BEGIN
  SELECT RAISE(ABORT, 'MEANT_MODEL_DAILY_BUDGET_EXCEEDED');
END;

CREATE INDEX IF NOT EXISTS studio_change_sets_workspace_revision_idx ON studio_change_sets (workspace_id, base_revision);
CREATE UNIQUE INDEX IF NOT EXISTS studio_commits_workspace_revision_unique ON studio_commits (workspace_id, revision);
CREATE INDEX IF NOT EXISTS studio_commits_workspace_committed_idx ON studio_commits (workspace_id, committed_at);
CREATE INDEX IF NOT EXISTS model_request_windows_cleanup_idx ON model_request_windows (window_start);
CREATE INDEX IF NOT EXISTS model_request_daily_budgets_cleanup_idx ON model_request_daily_budgets (day_start);
