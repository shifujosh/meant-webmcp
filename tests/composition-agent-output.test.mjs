import assert from "node:assert/strict";
import test from "node:test";

import {
  WEBMCP_TOOL_OUTPUT_CHARACTER_BUDGET,
  compactCompositionContext,
  compactPreviewResult,
  serializedToolOutputLength,
} from "../lib/meant/composition-agent-output.ts";
import {
  createCompositionDraft,
  createCompositionOperation,
  createSeedComposition,
  validateCompositionDocument,
} from "../lib/meant/composition-core.ts";

function maximalIdentifier(prefix, index, maximum = 120) {
  const start = `${prefix}-${index}-`;
  return `${start}${"x".repeat(maximum - start.length)}`;
}

test("inspect and preview outputs stay inside Chrome's WebMCP character budget", () => {
  const kept = createSeedComposition();
  const operation = createCompositionOperation(kept, {
    kind: "node.update",
    frameId: "frame-opening",
    targetId: "opening-title",
    patch: { content: "A precise, reversible way to direct design." },
  });
  const draft = createCompositionDraft(kept, "turn-budget", "Make the opening more decisive", [operation]);
  const context = compactCompositionContext({
    activeDocument: draft.preview,
    keptDocument: kept,
    draft,
    selectedFrameId: "frame-opening",
    selectedNodeIds: ["opening-title"],
    revision: 17,
    persistence: { hydrated: true, durable: true, state: "saved" },
    recentHistory: [{
      id: "change-budget",
      projectId: "meant-project",
      workspaceId: "workspace-budget-test",
      parentRevision: 16,
      revision: 17,
      kind: "apply",
      operationDigest: "a".repeat(64),
      summary: "Keep the refined opening",
      committedAt: "2026-09-02T00:00:00.000Z",
    }],
  });

  assert.ok(serializedToolOutputLength(context) <= WEBMCP_TOOL_OUTPUT_CHARACTER_BUDGET);
  assert.ok(serializedToolOutputLength(compactPreviewResult(draft)) <= WEBMCP_TOOL_OUTPUT_CHARACTER_BUDGET);
  assert.equal("keptDocument" in context, false);
  assert.equal("activeDocument" in context, false);
  assert.equal("preview" in compactPreviewResult(draft).exploringDraft, false);
});

test("maximal accepted labels, frame counts, and selected content are capped deterministically", () => {
  const kept = createSeedComposition();
  kept.title = "T".repeat(160);
  kept.frames = Array.from({ length: 60 }, (_, index) => ({
    ...structuredClone(kept.frames[0]),
    id: `frame-${index}`,
    name: `Frame ${index} ${"N".repeat(160)}`,
    purpose: "P".repeat(500),
    nodes: structuredClone(kept.frames[0].nodes).map((node, nodeIndex) => ({
      ...node,
      id: `frame-${index}-node-${nodeIndex}`,
      name: "N".repeat(160),
      role: "R".repeat(120),
      content: "C".repeat(4_000),
    })),
  }));
  const context = compactCompositionContext({
    activeDocument: kept,
    keptDocument: kept,
    draft: null,
    selectedFrameId: "frame-0",
    selectedNodeIds: ["frame-0-node-0", "frame-0-node-1"],
    revision: 999,
    persistence: { hydrated: true, durable: true, state: "saved" },
    recentHistory: [],
  });

  assert.ok(serializedToolOutputLength(context) <= WEBMCP_TOOL_OUTPUT_CHARACTER_BUDGET);
  assert.equal(context.composition.frames.length, 4);
  assert.equal(context.composition.moreFrames, 56);
});

test("maximal valid identifiers cannot overflow an inspect receipt", () => {
  const kept = createSeedComposition();
  const sourceFrame = structuredClone(kept.frames[0]);
  kept.id = maximalIdentifier("composition", 0);
  kept.title = "T".repeat(160);
  kept.frames = Array.from({ length: 60 }, (_, frameIndex) => ({
    ...structuredClone(sourceFrame),
    id: maximalIdentifier("frame", frameIndex),
    name: `Frame ${frameIndex} ${"N".repeat(145)}`.slice(0, 160),
    purpose: "P".repeat(500),
    nodes: sourceFrame.nodes.slice(0, 5).map((node, nodeIndex) => ({
      ...structuredClone(node),
      id: maximalIdentifier(`node${frameIndex}`, nodeIndex),
      name: "N".repeat(160),
      role: "R".repeat(80),
      content: "C".repeat(4_000),
    })),
  }));
  validateCompositionDocument(kept);
  const selectedFrame = kept.frames[0];
  const context = compactCompositionContext({
    activeDocument: kept,
    keptDocument: kept,
    draft: null,
    selectedFrameId: selectedFrame.id,
    selectedNodeIds: [selectedFrame.nodes[0].id],
    revision: 999,
    persistence: { hydrated: true, durable: true, state: "saved" },
    recentHistory: [{
      id: maximalIdentifier("commit", 0, 160),
      projectId: maximalIdentifier("project", 0, 160),
      workspaceId: maximalIdentifier("workspace", 0, 160),
      parentRevision: 998,
      revision: 999,
      kind: "apply",
      operationDigest: "a".repeat(64),
      summary: "S".repeat(500),
      committedAt: "2026-09-02T00:00:00.000Z",
    }],
  });

  assert.ok(
    serializedToolOutputLength(context) <= WEBMCP_TOOL_OUTPUT_CHARACTER_BUDGET,
    `inspect receipt is ${serializedToolOutputLength(context)} characters`,
  );
  assert.equal(context.selection.frameId, selectedFrame.id);
  assert.deepEqual(context.selection.nodeIds, [selectedFrame.nodes[0].id]);
});

test("maximal valid affected identifiers cannot overflow a preview receipt", () => {
  const kept = createSeedComposition();
  const sourceFrame = structuredClone(kept.frames[0]);
  kept.frames = Array.from({ length: 6 }, (_, frameIndex) => ({
    ...structuredClone(sourceFrame),
    id: maximalIdentifier("frame", frameIndex),
    nodes: [{
      ...structuredClone(sourceFrame.nodes[0]),
      id: maximalIdentifier(`node${frameIndex}`, 0),
    }],
  }));
  validateCompositionDocument(kept);
  const operations = kept.frames.map((frame, index) => createCompositionOperation(kept, {
    kind: "node.update",
    frameId: frame.id,
    targetId: frame.nodes[0].id,
    patch: { content: `Direction ${index}` },
  }));
  const draft = createCompositionDraft(kept, maximalIdentifier("turn", 0), "S".repeat(240), operations);
  const receipt = compactPreviewResult(draft);

  assert.ok(
    serializedToolOutputLength(receipt) <= WEBMCP_TOOL_OUTPUT_CHARACTER_BUDGET,
    `preview receipt is ${serializedToolOutputLength(receipt)} characters`,
  );
  assert.equal(receipt.exploringDraft.id, draft.id);
});
