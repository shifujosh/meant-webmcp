import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true, hmr: false },
});

after(async () => vite.close());

const { createWebMcpTools } = await vite.ssrLoadModule("/lib/ghosa/webmcp.ts");

test("WebMCP exposes one complete reversible GHOSA command chain", async () => {
  const calls = [];
  const commands = {
    getProjectContext: () => calls.push(["context"]),
    listPackets: (status) => calls.push(["list", status]),
    inspectArtifact: (artifactId) => calls.push(["inspect", artifactId]),
    stageChangeSet: (input) => calls.push(["stage", input]),
    reviseChangeSet: (input) => calls.push(["revise", input]),
    requestClarification: (packetId, question, options) => calls.push(["clarify", packetId, question, options]),
    applyStaged: (changeSetId, revision, digest) => calls.push(["apply", changeSetId, revision, digest]),
    undoCommitted: (changeId, revision) => calls.push(["undo", changeId, revision]),
  };
  const tools = createWebMcpTools(() => commands);
  const byName = new Map(tools.map((tool) => [tool.name, tool]));

  assert.deepEqual([...byName.keys()], [
    "get_project_context",
    "list_expression_packets",
    "inspect_artifact",
    "stage_change_set",
    "revise_change_set",
    "request_clarification",
    "apply_staged_change_set",
    "undo_committed_change",
  ]);
  assert.equal(byName.has("apply_approved_change_set"), false);

  await byName.get("get_project_context").execute({});
  await byName.get("list_expression_packets").execute({ status: "captured" });
  await byName.get("inspect_artifact").execute({ artifactId: "artifact-web" });
  await byName.get("stage_change_set").execute({
    expressionPacketId: "expression-1",
    summary: "Increase headline scale",
    rationale: "Clarify the reading order",
    operations: [{ artifactId: "artifact-web", targetIds: ["web-headline"], property: "typeScale", value: 72 }],
  });
  await byName.get("revise_change_set").execute({ changeSetId: "change-1", operations: [] });
  await byName.get("request_clarification").execute({
    expressionPacketId: "expression-1",
    question: "Which layer?",
    options: ["Headline", "Supporting copy"],
  });
  await byName.get("apply_staged_change_set").execute({ changeSetId: "change-1", expectedRevision: 7, operationDigest: `sha256-${"a".repeat(64)}` });
  await byName.get("undo_committed_change").execute({ committedChangeId: "commit-1", expectedRevision: 8 });

  assert.deepEqual(calls.map(([name]) => name), [
    "context",
    "list",
    "inspect",
    "stage",
    "revise",
    "clarify",
    "apply",
    "undo",
  ]);
  assert.equal(calls[3][1].operations[0].property, "typeScale");
  assert.equal(calls[6][1], "change-1");
});

test("WebMCP tools resolve current workspace commands at execution time", () => {
  let active = { getProjectContext: () => "first" };
  const fallback = {
    listPackets: () => [],
    inspectArtifact: () => ({}),
    stageChangeSet: () => ({}),
    reviseChangeSet: () => ({}),
    requestClarification: () => ({}),
    applyStaged: () => ({}),
    undoCommitted: () => ({}),
  };
  const tools = createWebMcpTools(() => ({ ...fallback, ...active }));
  assert.equal(tools[0].execute({}), "first");
  active = { getProjectContext: () => "second" };
  assert.equal(tools[0].execute({}), "second");
});
