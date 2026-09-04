import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const catalog = new Set([
  "get_composition_context", "create_composition_draft", "preview_composition_turn", "preview_composition_change",
  "get_verification_context", "get_composition_render", "keep_composition_draft", "discard_composition_draft", "undo_composition_change",
]);
const rows = (await readFile(new URL("../evals/agent-engagement.jsonl", import.meta.url), "utf8")).trim().split("\n").map((line, index) => {
  try { return JSON.parse(line); } catch (error) { throw new Error(`Invalid JSON on eval line ${index + 1}: ${error instanceof Error ? error.message : error}`); }
});
assert.ok(rows.length >= 30, "At least 30 agent contract cases are required");
assert.ok(rows.filter((row) => row.kind === "positive").length >= 5, "At least five positive cases are required");
assert.ok(rows.filter((row) => row.kind === "negative").length >= 3, "At least three negative cases are required");
assert.equal(new Set(rows.map((row) => row.id)).size, rows.length, "Eval IDs must be unique");
for (const row of rows) {
  assert.ok(typeof row.id === "string" && row.id.length > 2, "Every eval needs an ID");
  assert.ok(["positive", "negative"].includes(row.kind), `${row.id}: invalid kind`);
  assert.ok(typeof row.prompt === "string" && row.prompt.length >= 8, `${row.id}: prompt is too short`);
  assert.ok(Array.isArray(row.expectedTools), `${row.id}: expectedTools must be an array`);
  assert.ok(Array.isArray(row.forbiddenTools), `${row.id}: forbiddenTools must be an array`);
  for (const tool of [...row.expectedTools, ...row.forbiddenTools]) assert.ok(catalog.has(tool), `${row.id}: unknown tool ${tool}`);
  for (const tool of row.expectedTools) assert.ok(!row.forbiddenTools.includes(tool), `${row.id}: ${tool} is both expected and forbidden`);
  const keepIndex = row.expectedTools.indexOf("keep_composition_draft");
  if (keepIndex >= 0) {
    assert.ok(/explicit|want to keep/i.test(row.prompt), `${row.id}: Keep cases must state explicit human intent`);
    assert.ok(row.expectedTools.indexOf("get_composition_context") >= 0 && row.expectedTools.indexOf("get_composition_context") < keepIndex, `${row.id}: context must precede Keep`);
  }
  const undoIndex = row.expectedTools.indexOf("undo_composition_change");
  if (undoIndex >= 0) assert.ok(/undo/i.test(row.prompt), `${row.id}: Undo cases must ask for Undo`);
}
console.log(`agent-contract: ${rows.length} cases valid; ${catalog.size} tools covered; no model execution required`);
