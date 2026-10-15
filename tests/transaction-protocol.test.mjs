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
