import { sql } from "drizzle-orm";
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

export const studioProjects = sqliteTable("studio_projects", {
  workspaceId: text("workspace_id").primaryKey(),
  projectId: text("project_id").notNull(),
  payload: text("payload").notNull(),
  revision: integer("revision").notNull().default(1),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const studioChangeSets = sqliteTable("studio_change_sets", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  projectId: text("project_id").notNull(),
  baseRevision: integer("base_revision").notNull(),
  operationDigest: text("operation_digest").notNull(),
  payload: text("payload").notNull(),
  status: text("status").notNull().default("staged"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  consumedAt: text("consumed_at"),
}, (table) => [
  index("studio_change_sets_workspace_revision_idx").on(table.workspaceId, table.baseRevision),
]);

export const studioCommits = sqliteTable("studio_commits", {
  id: text("id").primaryKey(),
  workspaceId: text("workspace_id").notNull(),
  projectId: text("project_id").notNull(),
  parentRevision: integer("parent_revision").notNull(),
  revision: integer("revision").notNull(),
  kind: text("kind").notNull(),
  revertedChangeId: text("reverted_change_id"),
  operationDigest: text("operation_digest").notNull(),
  summary: text("summary").notNull(),
  beforePayload: text("before_payload").notNull(),
  afterPayload: text("after_payload").notNull(),
  committedAt: text("committed_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [
  uniqueIndex("studio_commits_workspace_revision_unique").on(table.workspaceId, table.revision),
  index("studio_commits_workspace_committed_idx").on(table.workspaceId, table.committedAt),
]);

export const modelRequestWindows = sqliteTable("model_request_windows", {
  principalId: text("principal_id").notNull(),
  route: text("route").notNull(),
  windowStart: integer("window_start").notNull(),
  requestCount: integer("request_count").notNull(),
}, (table) => [
  primaryKey({ columns: [table.principalId, table.route, table.windowStart] }),
  index("model_request_windows_cleanup_idx").on(table.windowStart),
]);

/** Always empty; an insert is a transactional assertion that aborts via D1 trigger. */
export const modelRequestBudgetGuard = sqliteTable("model_request_budget_guard", {
  attempt: integer("attempt").notNull(),
});

export const modelRequestDailyBudgets = sqliteTable("model_request_daily_budgets", {
  principalId: text("principal_id").notNull(),
  dayStart: integer("day_start").notNull(),
  requestCount: integer("request_count").notNull(),
}, (table) => [
  primaryKey({ columns: [table.principalId, table.dayStart] }),
  index("model_request_daily_budgets_cleanup_idx").on(table.dayStart),
]);

/** Always empty; an insert is a transactional daily-budget assertion. */
export const modelRequestDailyBudgetGuard = sqliteTable("model_request_daily_budget_guard", {
  attempt: integer("attempt").notNull(),
});
