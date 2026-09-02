import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { convertV4MiniflareOptions, Miniflare } from "miniflare";

const securitySource = await readFile(new URL("../lib/server/request-security.ts", import.meta.url), "utf8");

function templateSql(name) {
  const prefix = `export const ${name} = \``;
  const start = securitySource.indexOf(prefix);
  assert.notEqual(start, -1, `Missing ${name}`);
  const valueStart = start + prefix.length;
  const end = securitySource.indexOf("`;", valueStart);
  assert.notEqual(end, -1, `Unterminated ${name}`);
  return securitySource.slice(valueStart, end);
}

function quotedSql(name) {
  const match = securitySource.match(new RegExp(`export const ${name} = ("(?:[^"\\\\]|\\\\.)*");`));
  assert.ok(match, `Missing ${name}`);
  return JSON.parse(match[1]);
}

const sql = {
  minuteTable: templateSql("MODEL_REQUEST_WINDOW_TABLE_SQL"),
  minuteGuardTable: templateSql("MODEL_REQUEST_BUDGET_GUARD_TABLE_SQL"),
  minuteGuardTrigger: templateSql("MODEL_REQUEST_BUDGET_GUARD_TRIGGER_SQL"),
  minuteIncrement: templateSql("MODEL_REQUEST_INCREMENT_SQL"),
  minuteAssert: quotedSql("MODEL_REQUEST_ASSERT_CHANGED_SQL"),
  dailyTable: templateSql("MODEL_REQUEST_DAILY_TABLE_SQL"),
  dailyGuardTable: templateSql("MODEL_REQUEST_DAILY_GUARD_TABLE_SQL"),
  dailyGuardTrigger: templateSql("MODEL_REQUEST_DAILY_GUARD_TRIGGER_SQL"),
  dailyIncrement: templateSql("MODEL_REQUEST_DAILY_INCREMENT_SQL"),
  dailyAssert: quotedSql("MODEL_REQUEST_DAILY_ASSERT_CHANGED_SQL"),
};

async function createDatabase() {
  const runtime = new Miniflare(convertV4MiniflareOptions({
    modules: true,
    script: "export default { fetch() { return new Response('ok') } }",
    d1Databases: { DB: "model-admission-integration" },
  }));
  const db = await runtime.getD1Database("DB");
  for (const statement of [
    sql.minuteTable,
    sql.minuteGuardTable,
    sql.minuteGuardTrigger,
    sql.dailyTable,
    sql.dailyGuardTable,
    sql.dailyGuardTrigger,
  ]) await db.prepare(statement).run();
  return { db, runtime };
}

function reserve(db, principalId, route, { minute = 1234, day = 5678, routeLimit = 12, principalDailyLimit = 250 } = {}) {
  return db.batch([
    db.prepare(sql.dailyIncrement).bind(principalId, day, principalDailyLimit),
    db.prepare(sql.dailyAssert),
    db.prepare(sql.dailyIncrement).bind("deployment", day, 5_000),
    db.prepare(sql.dailyAssert),
    ...(route === "realtime" ? [
      db.prepare(sql.dailyIncrement).bind(`realtime:${principalId}`, day, 10),
      db.prepare(sql.dailyAssert),
      db.prepare(sql.dailyIncrement).bind("realtime:deployment", day, 100),
      db.prepare(sql.dailyAssert),
    ] : []),
    db.prepare(sql.minuteIncrement).bind(principalId, route, minute, routeLimit),
    db.prepare(sql.minuteAssert),
    db.prepare(sql.minuteIncrement).bind("deployment", "all-model-routes", minute, 80),
    db.prepare(sql.minuteAssert),
    ...(route === "realtime" ? [
      db.prepare(sql.minuteIncrement).bind("realtime:deployment", "realtime", minute, 10),
      db.prepare(sql.minuteAssert),
    ] : []),
  ]);
}

function reserveMutation(db, principalId, { minute = 1234, day = 5678 } = {}) {
  const principal = `mutation:${principalId}`;
  const deployment = "mutation:deployment";
  return db.batch([
    db.prepare(sql.dailyIncrement).bind(principal, day, 120),
    db.prepare(sql.dailyAssert),
    db.prepare(sql.dailyIncrement).bind(deployment, day, 2_000),
    db.prepare(sql.dailyAssert),
    db.prepare(sql.minuteIncrement).bind(principal, "all-mutations", minute, 30),
    db.prepare(sql.minuteAssert),
    db.prepare(sql.minuteIncrement).bind(deployment, "all-mutations", minute, 200),
    db.prepare(sql.minuteAssert),
  ]);
}

async function count(db, table, where, bindings) {
  const result = await db.prepare(`SELECT request_count FROM ${table} WHERE ${where}`).bind(...bindings).first();
  return result?.request_count ?? 0;
}

test("local D1 rolls back every other counter when the daily guard rejects", async () => {
  const { db, runtime } = await createDatabase();
  try {
    await reserve(db, "principal-a", "intent", { principalDailyLimit: 1 });
    await assert.rejects(
      reserve(db, "principal-a", "intent", { principalDailyLimit: 1 }),
      /MEANT_MODEL_DAILY_BUDGET_EXCEEDED/,
    );
    assert.equal(await count(db, "model_request_windows", "principal_id = ? AND route = ?", ["deployment", "all-model-routes"]), 1);
    assert.equal(await count(db, "model_request_daily_budgets", "principal_id = ?", ["deployment"]), 1);
    assert.equal((await db.prepare("SELECT COUNT(*) AS count FROM model_request_daily_budget_guard").first()).count, 0);
  } finally {
    await runtime.dispose();
  }
});

test("local D1 serializes concurrent reservations at the exact route ceiling", async () => {
  const { db, runtime } = await createDatabase();
  try {
    const attempts = await Promise.allSettled(
      Array.from({ length: 20 }, () => reserve(db, "principal-concurrent", "realtime", { routeLimit: 1 })),
    );
    assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 1);
    assert.equal(attempts.filter((attempt) => attempt.status === "rejected").length, 19);
    assert.ok(attempts.filter((attempt) => attempt.status === "rejected").every((attempt) =>
      String(attempt.reason).includes("MEANT_MODEL_BUDGET_EXCEEDED"),
    ));
    assert.equal(await count(db, "model_request_windows", "principal_id = ? AND route = ?", ["principal-concurrent", "realtime"]), 1);
    assert.equal(await count(db, "model_request_windows", "principal_id = ? AND route = ?", ["deployment", "all-model-routes"]), 1);
    assert.equal(await count(db, "model_request_daily_budgets", "principal_id = ?", ["principal-concurrent"]), 1);
    assert.equal(await count(db, "model_request_daily_budgets", "principal_id = ?", ["deployment"]), 1);
  } finally {
    await runtime.dispose();
  }
});

test("local D1 serializes concurrent durable mutations at the exact principal ceiling", async () => {
  const { db, runtime } = await createDatabase();
  try {
    const attempts = await Promise.allSettled(
      Array.from({ length: 40 }, () => reserveMutation(db, "principal-mutation")),
    );
    assert.equal(attempts.filter((attempt) => attempt.status === "fulfilled").length, 30);
    assert.equal(attempts.filter((attempt) => attempt.status === "rejected").length, 10);
    assert.equal(await count(db, "model_request_windows", "principal_id = ? AND route = ?", ["mutation:principal-mutation", "all-mutations"]), 30);
    assert.equal(await count(db, "model_request_windows", "principal_id = ? AND route = ?", ["mutation:deployment", "all-mutations"]), 30);
    assert.equal(await count(db, "model_request_daily_budgets", "principal_id = ?", ["mutation:principal-mutation"]), 30);
    assert.equal(await count(db, "model_request_daily_budgets", "principal_id = ?", ["mutation:deployment"]), 30);
  } finally {
    await runtime.dispose();
  }
});
