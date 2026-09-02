import assert from "node:assert/strict";
import test, { after } from "node:test";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
after(async () => vite.close());

const { createCompositionWebMcpTools, registerCompositionWebMcpTools } = await vite.ssrLoadModule("/lib/meant/composition-webmcp.ts");

test("WebMCP exposes the complete create, inspect, explore, keep, discard, and undo composition loop", async () => {
  const calls = [];
  const commands = {
    getContext: () => calls.push(["context"]),
    create: (input) => calls.push(["create", input]),
    previewTurn: (input) => calls.push(["turn", input]),
    preview: (input) => calls.push(["preview", input]),
    keep: (draftId) => calls.push(["keep", draftId]),
    discard: (draftId) => calls.push(["discard", draftId]),
    undo: (changeId, revision) => calls.push(["undo", changeId, revision]),
  };
  const tools = createCompositionWebMcpTools(() => commands);
  assert.deepEqual(tools.map((tool) => tool.name), [
    "get_composition_context",
    "create_composition_draft",
    "preview_composition_turn",
    "preview_composition_change",
    "keep_composition_draft",
    "discard_composition_draft",
    "undo_composition_change",
  ]);
  await tools[0].execute({});
  await tools[1].execute({ kind: "poster", brief: "A neighborhood climate action plan" });
  await tools[2].execute({ transcript: "Make the title quieter" });
  await tools[3].execute({
    summary: "Precise change",
    operations: [{
      kind: "node.update",
      frameId: "frame-opening",
      targetId: "opening-title",
      patch: { content: "Make what you mean." },
    }],
  });
  await tools[4].execute({ draftId: "draft-1" });
  await tools[5].execute({ draftId: "draft-2" });
  await tools[6].execute({ committedChangeId: "commit-1", expectedRevision: 8 });
  assert.deepEqual(calls.map(([name]) => name), ["context", "create", "turn", "preview", "keep", "discard", "undo"]);
});

test("WebMCP operation schemas are discriminated, closed, and expose only preview-safe changes", () => {
  const tools = createCompositionWebMcpTools(() => ({
    getContext() {}, create() {}, previewTurn() {}, preview() {}, keep() {}, discard() {}, undo() {},
  }));
  const preview = tools.find((tool) => tool.name === "preview_composition_change");
  const operation = preview.inputSchema.properties.operations.items;
  assert.ok(Array.isArray(operation.oneOf));
  assert.deepEqual(operation.oneOf.map((branch) => branch.properties.kind.const), [
    "node.update",
    "frame.update",
    "contract.update",
  ]);
  assert.ok(operation.oneOf.every((branch) => branch.additionalProperties === false));
  assert.equal(operation.oneOf[0].properties.patch.additionalProperties, false);
  assert.equal(operation.oneOf[0].properties.patch.properties.style.additionalProperties, false);
  assert.equal(tools[0].annotations.readOnlyHint, true);
  assert.equal(tools[0].annotations.untrustedContentHint, true);
  assert.deepEqual(Object.keys(tools[0].annotations).sort(), ["readOnlyHint", "untrustedContentHint"]);
});

test("WebMCP rejects malformed inputs at runtime before command handlers run", async () => {
  let called = false;
  const tools = createCompositionWebMcpTools(() => ({
    getContext() {}, create() {}, previewTurn() {},
    preview() { called = true; },
    keep() {}, discard() {}, undo() {},
  }));
  const preview = tools.find((tool) => tool.name === "preview_composition_change");
  await assert.rejects(() => preview.execute({
    summary: "Forge metadata",
    operations: [{
      kind: "node.update",
      frameId: "frame-opening",
      targetId: "opening-title",
      patch: { role: "system" },
    }],
  }), /unsupported|unknown|patch/i);
  assert.equal(called, false);
});

test("WebMCP registration awaits every tool and passes only the abort signal", async () => {
  const calls = [];
  const releases = [];
  const context = {
    registerTool(tool, options) {
      calls.push([tool.name, options]);
      return new Promise((resolve) => releases.push(resolve));
    },
  };
  const controller = new AbortController();
  let settled = false;
  const registration = registerCompositionWebMcpTools(context, () => ({
    getContext() {}, create() {}, previewTurn() {}, preview() {}, keep() {}, discard() {}, undo() {},
  }), controller.signal).then(() => { settled = true; });

  await Promise.resolve();
  assert.equal(calls.length, 7);
  assert.equal(settled, false);
  assert.ok(calls.every(([, options]) => options.signal === controller.signal));
  assert.ok(calls.every(([, options]) => !("exposedTo" in options)));
  releases.forEach((release) => release());
  await registration;
  assert.equal(settled, true);
});

test("WebMCP registration also settles when the browser registers tools synchronously", async () => {
  const names = [];
  const controller = new AbortController();
  await registerCompositionWebMcpTools({
    registerTool(tool, options) {
      names.push(tool.name);
      assert.equal(options.signal, controller.signal);
    },
  }, () => ({
    getContext() {}, create() {}, previewTurn() {}, preview() {}, keep() {}, discard() {}, undo() {},
  }), controller.signal);
  assert.equal(names.length, 7);
});

test("the durable Keep route verifies identity before a two-write compare-and-swap batch", async () => {
  const route = await readFile(new URL("../app/api/composition/commit/route.ts", import.meta.url), "utf8");
  assert.ok(route.indexOf("rebindCompositionOperations") < route.indexOf("raw.batch"));
  assert.ok(route.indexOf("keepCompositionDraft") < route.indexOf("raw.batch"));
  assert.match(route, /draft\.id !== body\.draftId/);
  assert.match(route, /WHERE workspace_id = \? AND project_id = \? AND revision = \?/);
  assert.match(route, /studio_commits/);
  assert.match(route, /studio_projects SET payload = \?, revision = revision \+ 1/);
});
