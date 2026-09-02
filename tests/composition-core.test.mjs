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

const composition = await vite.ssrLoadModule("/lib/meant/composition-core.ts");

test("the composition seed is a real multi-frame document with stable semantic nodes", () => {
  const document = composition.createSeedComposition();
  assert.doesNotThrow(() => composition.validateCompositionDocument(document));
  assert.equal(document.kind, "deck");
  assert.equal(document.frames.length, 3);
  assert.deepEqual(document.frames.map((frame) => frame.id), ["frame-opening", "frame-problem", "frame-proof"]);
  assert.ok(document.frames.every((frame) => frame.nodes.some((node) => node.role === "title")));
  assert.ok(document.frames.every((frame) => frame.nodes.every((node) => node.id && node.type && node.role)));
});

test("complete document validation rejects malformed persisted composition state", () => {
  const malformed = structuredClone(composition.createSeedComposition());
  malformed.frames[0].nodes[0].style.opacity = 4;
  assert.throws(() => composition.validateCompositionDocument(malformed), /opacity/i);
  const duplicate = structuredClone(composition.createSeedComposition());
  duplicate.frames[1].nodes[0].id = duplicate.frames[0].nodes[0].id;
  assert.throws(() => composition.validateCompositionDocument(duplicate), /duplicate node/i);
});

test("ordinary-language direction summaries stay within the durable 240-character receipt contract", () => {
  const exactly = "x".repeat(240);
  const over = "x".repeat(241);
  assert.equal(composition.summarizeCompositionDirection(exactly), exactly);
  assert.equal(composition.summarizeCompositionDirection(over).length, 240);
  assert.match(composition.summarizeCompositionDirection(over), /…$/);
  assert.equal(composition.summarizeCompositionDirection(`  Make\n  this\tquieter  `), "Make this quieter");
});

test("a spoken brief can start each supported artifact as one reversible replacement draft", () => {
  const base = composition.createSeedComposition();
  for (const kind of ["deck", "poster", "infographic"]) {
    const operation = composition.createCompositionFromBrief(base, {
      kind,
      brief: "A neighborhood climate action plan",
    });
    assert.equal(operation.kind, "document.replace");
    const draft = composition.createCompositionDraft(base, `voice-new-${kind}`, `Create a ${kind}`, [operation]);
    assert.equal(draft.preview.kind, kind);
    assert.match(draft.preview.title, /climate action/i);
    assert.ok(draft.preview.frames.length >= 1);
    assert.ok(draft.preview.frames.every((frame) => frame.nodes.some((node) => node.role === "title")));
    assert.equal(base.kind, "deck");
    assert.equal(draft.preview.id, base.id);
    assert.equal(draft.preview.version, base.version);
  }
});

test("draft operations are immutable, inspectable, and become durable only when kept", () => {
  const base = composition.createSeedComposition();
  const operation = composition.createCompositionOperation(base, {
    kind: "node.update",
    frameId: "frame-opening",
    targetId: "opening-title",
    patch: { content: "Make what you mean.", style: { fontSize: 84 } },
  });
  const draft = composition.createCompositionDraft(base, "voice-turn-1", "Tighten the opening", [operation]);

  assert.equal(base.frames[0].nodes.find((node) => node.id === "opening-title").content, "A better way to direct design.");
  assert.equal(draft.preview.frames[0].nodes.find((node) => node.id === "opening-title").content, "Make what you mean.");
  assert.equal(draft.baseVersion, base.version);
  assert.equal(draft.status, "exploring");

  const kept = composition.keepCompositionDraft(base, draft);
  assert.equal(kept.document.version, base.version + 1);
  assert.equal(kept.receipt.operations.length, 1);
  assert.deepEqual(kept.receipt.affectedNodeIds, ["opening-title"]);
  assert.equal(kept.receipt.beforeVersion, base.version);
  assert.equal(kept.receipt.afterVersion, base.version + 1);
});

test("draft identity uses the same normalized summary that the commit route reconstructs", () => {
  const base = composition.createSeedComposition();
  const operation = composition.createCompositionOperation(base, {
    kind: "node.update",
    frameId: "frame-opening",
    targetId: "opening-title",
    patch: { content: "Precise change" },
  });
  const preview = composition.createCompositionDraft(base, "turn-whitespace", "  Precise change  ", [operation]);
  const reconstructed = composition.createCompositionDraft(base, preview.sourceTurnId, preview.summary, preview.operations);
  assert.equal(preview.summary, "Precise change");
  assert.equal(reconstructed.id, preview.id);
});

test("successive Exploring refinements accumulate without mutating the kept document", () => {
  const base = composition.createSeedComposition();
  const first = composition.createCompositionOperation(base, {
    kind: "node.update",
    frameId: "frame-opening",
    targetId: "opening-title",
    patch: { content: "A quieter opening" },
  });
  const initialDraft = composition.createCompositionDraft(base, "turn-1", "Quiet the opening", [first]);
  const second = composition.createCompositionOperation(initialDraft.preview, {
    kind: "node.update",
    frameId: "frame-opening",
    targetId: "opening-title",
    patch: { style: { fontFamily: "serif", fontSize: 72 } },
  });

  const refinedDraft = composition.extendCompositionDraft(
    base,
    initialDraft,
    "turn-2",
    "Make the same title more editorial",
    [second],
  );
  const keptTitle = base.frames[0].nodes.find((node) => node.id === "opening-title");
  const exploringTitle = refinedDraft.preview.frames[0].nodes.find((node) => node.id === "opening-title");

  assert.equal(keptTitle.content, "A better way to direct design.");
  assert.equal(exploringTitle.content, "A quieter opening");
  assert.equal(exploringTitle.style.fontFamily, "serif");
  assert.equal(exploringTitle.style.fontSize, 72);
  assert.equal(refinedDraft.operations.length, 1);
  assert.equal(refinedDraft.baseVersion, base.version);
});

test("repeated adjacent tuning updates compact without changing the final preview", () => {
  const base = composition.createSeedComposition();
  let draft = composition.createCompositionDraft(base, "range-0", "Tune the title", [
    composition.createCompositionOperation(base, {
      kind: "node.update",
      frameId: "frame-opening",
      targetId: "opening-title",
      patch: { style: { fontSize: 100 } },
    }),
  ]);
  for (let fontSize = 101; fontSize <= 160; fontSize += 1) {
    const operation = composition.createCompositionOperation(draft.preview, {
      kind: "node.update",
      frameId: "frame-opening",
      targetId: "opening-title",
      patch: { style: { fontSize } },
    });
    draft = composition.extendCompositionDraft(base, draft, `range-${fontSize}`, "Tune the title", [operation]);
  }
  assert.equal(draft.operations.length, 1);
  assert.equal(draft.preview.frames[0].nodes.find((node) => node.id === "opening-title").style.fontSize, 160);
});

test("stale drafts and invalid targets never overwrite current work", () => {
  const base = composition.createSeedComposition();
  assert.throws(() => composition.createCompositionFromBrief(base, { kind: "website", brief: "No" }), /unsupported composition kind/i);
  assert.throws(() => composition.createCompositionOperation(base, {
    kind: "node.update",
    frameId: "missing-frame",
    targetId: "missing-node",
    patch: { content: "No" },
  }), /unknown frame/i);

  const operation = composition.createCompositionOperation(base, {
    kind: "node.update",
    frameId: "frame-opening",
    targetId: "opening-title",
    patch: { content: "A precise opening" },
  });
  const draft = composition.createCompositionDraft(base, "voice-turn-2", "Revise opening", [operation]);
  const newer = { ...base, version: base.version + 1 };
  assert.throws(() => composition.keepCompositionDraft(newer, draft), /stale draft/i);
});

test("plain-language turns compile to the same bounded composition operations used by agents", () => {
  const base = composition.createSeedComposition();
  const operations = composition.planCompositionTurn(base, {
    transcript: "Make the first title quieter and more editorial, but keep the rest.",
    selectedFrameId: "frame-opening",
    selectedNodeIds: ["opening-title"],
  });
  assert.ok(operations.length >= 1);
  assert.ok(operations.every((operation) => operation.frameId === "frame-opening"));
  assert.ok(operations.every((operation) => operation.targetId === "opening-title"));
  const preview = composition.applyCompositionOperations(base, operations);
  const before = base.frames[0].nodes.find((node) => node.id === "opening-title");
  const after = preview.frames[0].nodes.find((node) => node.id === "opening-title");
  assert.ok(after.style.fontSize < before.style.fontSize);
  assert.equal(after.style.fontFamily, "serif");
});

test("operation identity and digests are deterministic across voice, UI, and WebMCP adapters", async () => {
  const base = composition.createSeedComposition();
  const input = {
    kind: "node.update",
    frameId: "frame-proof",
    targetId: "proof-metric",
    patch: { content: "42%", style: { color: "#F04B32" } },
  };
  const voice = composition.createCompositionOperation(base, input);
  const webmcp = composition.createCompositionOperation(base, input);
  assert.equal(voice.id, webmcp.id);
  assert.equal(await composition.compositionOperationDigest([voice]), await composition.compositionOperationDigest([webmcp]));
});

test("a replacement followed by a refinement is re-grounded sequentially and can be kept", () => {
  const base = composition.createSeedComposition();
  const replacement = composition.createCompositionFromBrief(base, {
    kind: "poster",
    brief: "A field guide to neighborhood climate action",
  });
  const replacementPreview = composition.applyCompositionOperations(base, [replacement]);
  const refinement = composition.createCompositionOperation(replacementPreview, {
    kind: "node.update",
    frameId: "frame-poster",
    targetId: "poster-title",
    patch: { content: "Climate action, block by block." },
  });

  const rebound = composition.rebindCompositionOperations(base, [
    structuredClone(replacement),
    structuredClone(refinement),
  ]);
  const draft = composition.createCompositionDraft(base, "turn-poster", "Create and refine the poster", rebound);
  const kept = composition.keepCompositionDraft(base, draft);

  assert.equal(kept.document.kind, "poster");
  assert.equal(kept.document.frames[0].nodes.find((node) => node.id === "poster-title").content, "Climate action, block by block.");
  assert.equal(kept.document.version, base.version + 1);
});

test("operation validation rejects immutable metadata, unsafe geometry, unsupported nodes, and locked removal", () => {
  const base = composition.createSeedComposition();
  assert.throws(() => composition.createCompositionOperation(base, {
    kind: "node.update",
    frameId: "frame-opening",
    targetId: "opening-title",
    patch: { id: "forged-id" },
  }), /unsupported|unknown|immutable/i);
  assert.throws(() => composition.createCompositionOperation(base, {
    kind: "node.update",
    frameId: "frame-opening",
    targetId: "opening-title",
    patch: { role: "system" },
  }), /unsupported|unknown|immutable/i);
  assert.throws(() => composition.createCompositionOperation(base, {
    kind: "node.update",
    frameId: "frame-opening",
    targetId: "opening-title",
    patch: { style: { rotation: 900 } },
  }), /rotation/i);
  assert.throws(() => composition.createCompositionOperation(base, {
    kind: "node.update",
    frameId: "frame-opening",
    targetId: "opening-title",
    patch: { style: { lineHeight: -2 } },
  }), /lineHeight/i);
  assert.throws(() => composition.createCompositionOperation(base, {
    kind: "node.update",
    frameId: "frame-opening",
    targetId: "opening-title",
    patch: { style: { zIndex: 1000000 } },
  }), /zIndex/i);
  assert.throws(() => composition.createCompositionOperation(base, {
    kind: "node.add",
    frameId: "frame-opening",
    targetId: "remote-image",
    node: {
      id: "remote-image",
      type: "image",
      role: "image",
      name: "Remote image",
      assetUrl: "https://example.com/tracker.png",
      style: structuredClone(base.frames[0].nodes[0].style),
    },
  }), /unsupported node type|asset/i);

  const locked = structuredClone(base);
  locked.frames[0].nodes.find((node) => node.id === "opening-title").locked = true;
  assert.throws(() => composition.createCompositionOperation(locked, {
    kind: "node.remove",
    frameId: "frame-opening",
    targetId: "opening-title",
  }), /locked node/i);

  assert.throws(() => composition.createCompositionOperation(base, {
    kind: "contract.update",
    frameId: "document",
    targetId: "design-contract",
    patch: { typeSystem: { display: "serif" } },
  }), /typeSystem is incomplete/i);

  assert.throws(() => composition.createCompositionOperation(base, {
    kind: "node.update",
    frameId: "frame-opening",
    targetId: "opening-title",
    patch: { style: {} },
  }), /style requires one visible property/i);

  const oneNodeFrame = structuredClone(base);
  oneNodeFrame.frames[0].nodes = [oneNodeFrame.frames[0].nodes[0]];
  assert.throws(() => composition.createCompositionOperation(oneNodeFrame, {
    kind: "node.remove",
    frameId: "frame-opening",
    targetId: oneNodeFrame.frames[0].nodes[0].id,
  }), /retain at least one node/i);
});

test("same-value and cancelled operation sequences cannot create a draft or kept receipt", () => {
  const base = composition.createSeedComposition();
  const original = base.frames[0].nodes.find((node) => node.id === "opening-title").content;
  const same = composition.createCompositionOperation(base, {
    kind: "node.update",
    frameId: "frame-opening",
    targetId: "opening-title",
    patch: { content: original },
  });
  assert.throws(() => composition.createCompositionDraft(base, "noop", "No visible change", [same]), /visible change/i);

  const away = composition.createCompositionOperation(base, {
    kind: "node.update",
    frameId: "frame-opening",
    targetId: "opening-title",
    patch: { content: "Temporary direction" },
  });
  const awayPreview = composition.applyCompositionOperations(base, [away]);
  const back = composition.createCompositionOperation(awayPreview, {
    kind: "node.update",
    frameId: "frame-opening",
    targetId: "opening-title",
    patch: { content: original },
  });
  assert.throws(() => composition.createCompositionDraft(base, "cancelled", "Cancelled direction", [away, back]), /visible change/i);
});

test("operation digests preserve execution order", async () => {
  const base = composition.createSeedComposition();
  const first = composition.createCompositionOperation(base, {
    kind: "node.update",
    frameId: "frame-opening",
    targetId: "opening-title",
    patch: { content: "First" },
  });
  const second = composition.createCompositionOperation(base, {
    kind: "node.update",
    frameId: "frame-opening",
    targetId: "opening-title",
    patch: { content: "Second" },
  });
  assert.notEqual(
    await composition.compositionOperationDigest([first, second]),
    await composition.compositionOperationDigest([second, first]),
  );
});
