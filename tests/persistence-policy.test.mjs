import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test from "node:test";

import {
  COMMIT_SNAPSHOT_LIMIT,
  COMPACT_COMMIT_SNAPSHOTS_SQL,
  PROJECT_REQUEST_BYTE_LIMIT,
  PROJECT_SNAPSHOT_CHARACTER_LIMIT,
  PRUNE_STAGED_CHANGE_SETS_SQL,
  STAGED_CHANGE_SET_LIMIT,
} from "../lib/server/persistence-policy.ts";

test("durable project storage has explicit bounded request, snapshot, and history ceilings", () => {
  assert.equal(PROJECT_REQUEST_BYTE_LIMIT, 320_000);
  assert.equal(PROJECT_SNAPSHOT_CHARACTER_LIMIT, 256_000);
  assert.equal(COMMIT_SNAPSHOT_LIMIT, 40);
  assert.equal(STAGED_CHANGE_SET_LIMIT, 8);
  assert.ok(PROJECT_REQUEST_BYTE_LIMIT > PROJECT_SNAPSHOT_CHARACTER_LIMIT);
});

test("history compaction keeps every receipt while retaining full snapshots for the newest forty revisions", () => {
  const db = new DatabaseSync(":memory:");
  db.exec("CREATE TABLE studio_commits (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, revision INTEGER NOT NULL, before_payload TEXT NOT NULL, after_payload TEXT NOT NULL)");
  const insert = db.prepare("INSERT INTO studio_commits (id, workspace_id, revision, before_payload, after_payload) VALUES (?, ?, ?, '{\"before\":true}', '{\"after\":true}')");
  db.prepare(COMPACT_COMMIT_SNAPSHOTS_SQL).run("workspace-a", "missing-commit", "workspace-a", "workspace-a");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM studio_commits WHERE before_payload = '{}'").get().count, 0);
  for (let revision = 1; revision <= 45; revision += 1) {
    insert.run(`commit-${revision}`, "workspace-a", revision);
    db.prepare(COMPACT_COMMIT_SNAPSHOTS_SQL).run("workspace-a", `commit-${revision}`, "workspace-a", "workspace-a");
  }
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM studio_commits").get().count, 45, "audit receipts must remain append-only");
  const compacted = db.prepare("SELECT revision FROM studio_commits WHERE before_payload = '{}' AND after_payload = '{}' ORDER BY revision").all().map((row) => row.revision);
  assert.deepEqual(compacted, [1, 2, 3, 4, 5]);
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM studio_commits WHERE before_payload <> '{}'").get().count, COMMIT_SNAPSHOT_LIMIT);
  db.close();
});

test("staged proposal pruning retains eight recent rows without deleting concurrent drafts", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(`CREATE TABLE studio_change_sets (
    id TEXT PRIMARY KEY,
    workspace_id TEXT NOT NULL,
    created_at TEXT NOT NULL,
    status TEXT NOT NULL
  )`);
  const insert = db.prepare("INSERT INTO studio_change_sets (id, workspace_id, created_at, status) VALUES (?, ?, ?, 'staged')");
  for (let index = 1; index <= 10; index += 1) {
    insert.run(`stage-${index}`, "workspace-a", `2026-09-02T12:00:${String(index).padStart(2, "0")}Z`);
  }
  db.prepare(PRUNE_STAGED_CHANGE_SETS_SQL).run("workspace-a", "missing-stage", "workspace-a", "workspace-a");
  assert.equal(db.prepare("SELECT COUNT(*) AS count FROM studio_change_sets").get().count, 10);
  db.prepare(PRUNE_STAGED_CHANGE_SETS_SQL).run("workspace-a", "stage-10", "workspace-a", "workspace-a");
  const retained = db.prepare("SELECT id FROM studio_change_sets ORDER BY created_at").all().map((row) => row.id);
  assert.equal(retained.length, STAGED_CHANGE_SET_LIMIT);
  assert.deepEqual(retained, Array.from({ length: 8 }, (_, index) => `stage-${index + 3}`));
  db.close();
});

test("every durable mutation route enforces bounded snapshots and commit retention", async () => {
  const commitRoutes = [
    "../app/api/composition/commit/route.ts",
    "../app/api/transactions/apply/route.ts",
    "../app/api/transactions/undo/route.ts",
  ];
  for (const path of commitRoutes) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /PROJECT_SNAPSHOT_CHARACTER_LIMIT/);
    assert.match(source, /COMPACT_COMMIT_SNAPSHOTS_SQL/);
  }
  const project = await readFile(new URL("../app/api/project/route.ts", import.meta.url), "utf8");
  assert.match(project, /PROJECT_REQUEST_BYTE_LIMIT/);
  assert.match(project, /PROJECT_SNAPSHOT_CHARACTER_LIMIT/);
  const stage = await readFile(new URL("../app/api/transactions/stage/route.ts", import.meta.url), "utf8");
  assert.match(stage, /PRUNE_STAGED_CHANGE_SETS_SQL/);
  assert.doesNotMatch(stage, /DELETE FROM studio_change_sets WHERE workspace_id = \?"/);
  assert.match(stage, /PROJECT_SNAPSHOT_CHARACTER_LIMIT/);
});

test("History is paginated in the canonical product without deleting older receipts", async () => {
  const projectRoute = await readFile(new URL("../app/api/project/route.ts", import.meta.url), "utf8");
  const studio = await readFile(new URL("../app/composition-studio.tsx", import.meta.url), "utf8");
  assert.match(projectRoute, /historyBeforeRevision/);
  assert.match(projectRoute, /historyHasMore/);
  assert.match(projectRoute, /HISTORY_PAGE_SIZE \+ 1/);
  assert.match(studio, /loadEarlierHistory/);
  assert.match(studio, /"Load earlier revisions"/);
});
