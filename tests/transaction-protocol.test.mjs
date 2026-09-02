import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
after(async () => vite.close());

const registry = await vite.ssrLoadModule("/lib/ghosa/operation-registry.ts");
const transaction = await vite.ssrLoadModule("/lib/ghosa/transaction-core.ts");
const { seedProject } = await vite.ssrLoadModule("/lib/ghosa/seed.ts");

const web = seedProject.artifacts.find((artifact) => artifact.kind === "web");
const context = { projectId: seedProject.id, workspaceId: "workspace-protocol-test", baseRevision: 9, artifact: web };
const expressions = [
  ["Make the headline coral", "web-headline", "fill", "coral"],
  ["Set the headline exactly", "web-headline", "content", "Pearls, precisely."],
  ["Center the headline", "web-headline", "alignment", "center"],
  ["Stack the copy", "web-copy", "direction", "column"],
  ["Set warmth", "", "warmth", 61],
  ["Set contrast", "", "contrast", 73],
  ["Set spacing", "", "spacing", 44],
  ["Set focus", "", "focalStrength", 82],
  ["Set corners", "", "cornerRadius", 38],
  ["Set type size", "web-headline", "typeScale", 76],
];

test("failure-first: the registry rejects non-executable and ill-typed advertised operations", () => {
  assert.throws(() => registry.groundSurfaceOperation("webmcp", { ...context, targetIds: ["web-image"], property: "content", value: "No" }));
  assert.throws(() => registry.groundSurfaceOperation("direct", { ...context, targetIds: ["web-headline"], property: "alignment", value: "justify" }));
  assert.throws(() => registry.groundSurfaceOperation("typed", { ...context, targetIds: [], property: "spacing", value: 101 }));
});

test("registry and named-color lookups reject inherited object properties", () => {
  assert.throws(() => registry.normalizeColor("__proto__"), /Unsupported color value/);
  assert.throws(() => registry.normalizeColor("constructor"), /Unsupported color value/);
  assert.throws(() => registry.groundOperation({
    ...context,
    targetIds: ["web-headline"],
    property: "constructor",
    value: "x",
  }), /Unknown operation property/);
});

test("numeric transaction receipts report the effective inherited before value", () => {
  const inherited = structuredClone(seedProject);
  const inheritedWeb = inherited.artifacts.find((artifact) => artifact.kind === "web");
  inheritedWeb.values.contrast = 50;
  inheritedWeb.nodes.find((node) => node.id === "web-copy").values = { contrast: 72 };
  delete inheritedWeb.nodes.find((node) => node.id === "web-headline").values;
  const operation = registry.groundSurfaceOperation("webmcp", {
    ...context,
    artifact: inheritedWeb,
    targetIds: ["web-headline"],
    property: "contrast",
    value: 80,
  });

  assert.equal(transaction.valueForOperationTarget(inherited, operation, "web-headline"), 72);
});

test("fractional numeric inputs canonicalize to the exact executable value", () => {
  const operation = registry.groundSurfaceOperation("webmcp", {
    ...context,
    targetIds: ["web-headline"],
    property: "contrast",
    value: 72.5,
  });
  assert.equal(operation.value, 73);
  const candidate = transaction.applyCanonicalOperations(seedProject, [operation]);
  const postconditions = transaction.verifyRequestedPostconditions(seedProject, candidate, [operation]);
  assert.equal(postconditions.ok, true);
  assert.equal(transaction.valueForOperationTarget(candidate, operation, "web-headline"), 73);
});

test("legacy operation digests commit to exact execution order", async () => {
  const lower = registry.groundSurfaceOperation("typed", { ...context, targetIds: ["web-headline"], property: "contrast", value: 40 });
  const higher = registry.groundSurfaceOperation("voice", { ...context, targetIds: ["web-headline"], property: "contrast", value: 80 });
  const lowThenHigh = transaction.applyCanonicalOperations(seedProject, [lower, higher]);
  const highThenLow = transaction.applyCanonicalOperations(seedProject, [higher, lower]);

  assert.notEqual(
    transaction.valueForOperationTarget(lowThenHigh, higher, "web-headline"),
    transaction.valueForOperationTarget(highThenLow, lower, "web-headline"),
  );
  assert.notEqual(registry.canonicalOperationsBytes([lower, higher]), registry.canonicalOperationsBytes([higher, lower]));
  assert.notEqual(await registry.operationDigest([lower, higher]), await registry.operationDigest([higher, lower]));
});

test("10 representative expressions are byte-equivalent across typed, voice, Tune, canvas, and WebMCP", () => {
  for (const [expression, targetId, property, value] of expressions) {
    const input = { ...context, targetIds: targetId ? [targetId] : [], property, value };
    const operations = ["typed", "voice", "direct", "canvas", "webmcp"].map((surface) => registry.groundSurfaceOperation(surface, input));
    const bytes = operations.map(registry.canonicalOperationBytes);
    assert.equal(new Set(bytes).size, 1, expression);
    assert.equal(new Set(operations.map((operation) => operation.operationId)).size, 1, expression);
  }
});

test("exact coral normalization is preserved as one explicit brand color", () => {
  const named = registry.groundSurfaceOperation("typed", { ...context, targetIds: ["web-headline"], property: "fill", value: "coral" });
  const explicit = registry.groundSurfaceOperation("webmcp", { ...context, targetIds: ["web-headline"], property: "fill", value: "#f46666" });
  assert.equal(named.value, "#F46666");
  assert.equal(registry.canonicalOperationBytes(named), registry.canonicalOperationBytes(explicit));
});

test("failure-first: a requested postcondition mismatch blocks the commit candidate", () => {
  const operation = registry.groundSurfaceOperation("direct", { ...context, targetIds: ["web-headline"], property: "content", value: "Exact copy" });
  const unchanged = structuredClone(seedProject);
  const result = transaction.verifyRequestedPostconditions(seedProject, unchanged, [operation]);
  assert.equal(result.ok, false);
  assert.equal(result.affectedTargetIds.length, 0);
});

test("deterministic postconditions pass only after the exact target changes", () => {
  const operation = registry.groundSurfaceOperation("voice", { ...context, targetIds: ["web-headline"], property: "content", value: "Exact copy" });
  const candidate = transaction.applyCanonicalOperations(seedProject, [operation]);
  const result = transaction.verifyRequestedPostconditions(seedProject, candidate, [operation]);
  assert.equal(result.ok, true);
  assert.deepEqual(result.affectedTargetIds, ["web-headline"]);
});

class DurableStore {
  constructor(project) { this.project = structuredClone(project); this.revision = 1; this.history = []; this.failNext = false; this.queue = Promise.resolve(); }
  transact(expectedRevision, changeId, mutate) {
    const run = async () => {
      if (this.failNext) { this.failNext = false; throw new Error("simulated persistence failure"); }
      if (this.revision !== expectedRevision) return { ok: false, conflict: true, authoritativeRevision: this.revision };
      const before = structuredClone(this.project);
      const after = mutate(structuredClone(this.project));
      this.project = after;
      this.revision += 1;
      this.history.unshift({ id: changeId, parentRevision: expectedRevision, revision: this.revision, before, after: structuredClone(after) });
      return { ok: true, committedChangeId: changeId, newRevision: this.revision };
    };
    const result = this.queue.then(run, run);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }
  undo(changeId, expectedRevision) {
    return this.transact(expectedRevision, `revert-${changeId}`, () => {
      const change = this.history.find((item) => item.id === changeId);
      if (!change || change.revision !== expectedRevision) throw new Error("explicit rebase required");
      return structuredClone(change.before);
    });
  }
}

test("failure-first: success is never acknowledged when persistence fails", async () => {
  const store = new DurableStore(seedProject);
  store.failNext = true;
  await assert.rejects(store.transact(1, "change-fail", (project) => project), /persistence failure/);
  assert.equal(store.revision, 1);
  assert.equal(store.history.length, 0);
});

test("success acknowledgement follows durable project and history persistence", async () => {
  const store = new DurableStore(seedProject);
  const result = await store.transact(1, "change-ok", (project) => ({ ...project, name: "Durable" }));
  assert.deepEqual(result, { ok: true, committedChangeId: "change-ok", newRevision: 2 });
  assert.equal(store.project.name, "Durable");
  assert.equal(store.history[0].id, "change-ok");
});

test("reload-persistent undo requires the explicit latest change and creates a revert commit", async () => {
  const store = new DurableStore(seedProject);
  await store.transact(1, "change-1", (project) => ({ ...project, name: "Changed" }));
  const reloaded = store;
  await assert.rejects(reloaded.undo("missing", 2), /rebase required/);
  const result = await reloaded.undo("change-1", 2);
  assert.equal(result.ok, true);
  assert.equal(reloaded.project.name, seedProject.name);
  assert.equal(reloaded.history[0].id, "revert-change-1");
});

test("the retained development editor bootstraps the authoritative project, workspace, and revision", async () => {
  const projectRoute = await readFile(new URL("../app/api/project/route.ts", import.meta.url), "utf8");
  const studio = await readFile(new URL("../app/studio.tsx", import.meta.url), "utf8");
  assert.match(projectRoute, /identity: \{ projectId: row\.projectId, workspaceId, revision: row\.revision \}/);
  assert.match(projectRoute, /workspaceId: scope\.storageWorkspaceId/);
  assert.match(studio, /workspaceId: workspaceIdRef\.current/);
  assert.match(studio, /revision: projectRevisionRef\.current/);
  assert.match(projectRoute, /inserted\[0\]\?\.payload !== payload/);
  assert.match(projectRoute, /Project bootstrap conflict/);
});

test("20 repeated two-tab races lose no updates and permit no stale apply or cross-revision undo", async () => {
  for (let run = 0; run < 20; run += 1) {
    const store = new DurableStore(seedProject);
    const [left, right] = await Promise.all([
      store.transact(1, `left-${run}`, (project) => ({ ...project, brief: `left-${run}` })),
      store.transact(1, `right-${run}`, (project) => ({ ...project, brief: `right-${run}` })),
    ]);
    assert.equal([left, right].filter((result) => result.ok).length, 1);
    assert.equal([left, right].filter((result) => result.conflict && result.authoritativeRevision === 2).length, 1);
    const winner = left.ok ? `left-${run}` : `right-${run}`;
    const followup = await store.transact(2, `followup-${run}`, (project) => ({ ...project, name: `followup-${run}` }));
    assert.equal(followup.ok, true);
    await assert.rejects(store.undo(winner, 3), /rebase required/);
    assert.equal(store.revision, 3);
    assert.equal(store.history.filter((entry) => !entry.id.startsWith("revert-")).length, 2);
  }
});

test("source contract disables whole-project PUT and verifies before atomic D1 batch acknowledgement", async () => {
  const projectRoute = await readFile(new URL("../app/api/project/route.ts", import.meta.url), "utf8");
  const applyRoute = await readFile(new URL("../app/api/transactions/apply/route.ts", import.meta.url), "utf8");
  const undoRoute = await readFile(new URL("../app/api/transactions/undo/route.ts", import.meta.url), "utf8");
  assert.match(projectRoute, /Whole-project last-writer-wins saves are disabled/);
  assert.ok(applyRoute.indexOf("verifyRequestedPostconditions") < applyRoute.indexOf("raw.batch"));
  assert.match(applyRoute, /WHERE workspace_id = \? AND project_id = \? AND revision = \?/);
  assert.match(
    applyRoute,
    /AND EXISTS \(SELECT 1 FROM studio_commits WHERE id = \? AND workspace_id = \? AND project_id = \? AND parent_revision = \? AND revision = \?\)/,
    "a losing apply must not consume its still-reusable staged change set",
  );
  assert.match(undoRoute, /committedChangeId/);
  assert.match(undoRoute, /domain\?: "composition" \| "artifact"/);
  assert.match(undoRoute, /Committed change does not belong to this editor/);
  assert.match(undoRoute, /explicit rebase choice required/);
  assert.match(undoRoute, /commit\.operationDigest/);
  assert.doesNotMatch(undoRoute, /SELECT \?, workspace_id, project_id, revision, revision \+ 1, 'revert', \?, operation_digest/);
});
