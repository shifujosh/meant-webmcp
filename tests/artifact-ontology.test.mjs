import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
after(async () => vite.close());

const validation = await vite.ssrLoadModule("/lib/server/model-request-validation.ts");
const ontology = await vite.ssrLoadModule("/lib/ghosa/artifact-ontology.ts");
const intent = await vite.ssrLoadModule("/lib/ghosa/intent.ts");
const { seedArtifacts, seedProject } = await vite.ssrLoadModule("/lib/ghosa/seed.ts");
const projectValidation = await vite.ssrLoadModule("/lib/server/studio-project-validation.ts");

function fixture() {
  const source = seedArtifacts.find((artifact) => artifact.kind === "web");
  return structuredClone(source);
}

test("shared artifact validation rejects missing parents, self cycles, and two-node cycles", () => {
  const missing = fixture();
  missing.nodes[1].parentId = "missing-parent";
  assert.equal(validation.validCreativeArtifact(missing), false);
  assert.throws(() => ontology.assertValidArtifactOntology(missing), /missing parent/);

  const self = fixture();
  self.nodes[0].parentId = self.nodes[0].id;
  assert.equal(validation.validCreativeArtifact(self), false);
  assert.throws(() => ontology.assertValidArtifactOntology(self), /semantic cycle/);

  const pair = fixture();
  pair.nodes[0].parentId = pair.nodes[1].id;
  pair.nodes[1].parentId = pair.nodes[0].id;
  assert.equal(validation.validCreativeArtifact(pair), false);
  assert.throws(() => ontology.assertValidArtifactOntology(pair), /semantic cycle/);
});

test("shared artifact validation rejects capabilities unsupported by the node kind", () => {
  const artifact = fixture();
  const textNode = artifact.nodes.find((node) => node.kind === "text");
  textNode.capabilities = [...textNode.capabilities, "cropScale"];
  assert.equal(validation.validCreativeArtifact(artifact), false);
  assert.throws(() => ontology.assertValidArtifactOntology(artifact), /not supported/);
});

test("persisted primitive fills accept explicit colors but reject CSS network values", () => {
  const safe = fixture();
  safe.nodes.find((node) => node.kind === "text").primitives = { fill: "#F46666" };
  assert.equal(validation.validCreativeArtifact(safe), true);

  const unsafe = fixture();
  unsafe.nodes.find((node) => node.kind === "text").primitives = { fill: "url(https://example.invalid/pixel)" };
  assert.equal(validation.validCreativeArtifact(unsafe), false);
});

test("resolver fails closed on malformed ancestry and resolves a valid deep lineage", () => {
  const cyclic = fixture();
  cyclic.nodes[0].parentId = cyclic.nodes[0].id;
  assert.throws(() => intent.resolveNodeValues(cyclic, cyclic.nodes[0].id), /cycle/);

  const missing = fixture();
  missing.nodes[1].parentId = "missing-parent";
  assert.throws(() => intent.resolveNodeValues(missing, missing.nodes[1].id), /missing parent/);

  const valid = fixture();
  const rootNode = valid.nodes[0];
  const child = valid.nodes[1];
  const grandchild = valid.nodes[2];
  rootNode.values = { contrast: 61 };
  child.values = { contrast: 72 };
  grandchild.parentId = child.id;
  grandchild.values = { typeScale: 83 };
  assert.deepEqual(intent.resolveNodeValues(valid, grandchild.id), { ...valid.values, contrast: 72, typeScale: 83 });
});

test("project bootstrap validation rejects a cyclic artifact before durable storage", () => {
  const project = structuredClone(seedProject);
  project.id = "project-cycle-rejection";
  const cyclic = fixture();
  cyclic.id = "artifact-cycle";
  cyclic.nodes[0].parentId = cyclic.nodes[0].id;
  project.artifacts = [cyclic];
  assert.equal(projectValidation.isStudioProject(project), false);
});
