import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
after(async () => vite.close());

const composition = await vite.ssrLoadModule("/lib/meant/composition-core.ts");
const { restoreProjectForUndo } = await vite.ssrLoadModule("/lib/meant/composition-undo.ts");
const { seedProject } = await vite.ssrLoadModule("/lib/ghosa/seed.ts");

test("undo restores earlier content while composition authority and receipts stay monotonic", () => {
  const before = structuredClone(seedProject);
  before.composition = composition.createSeedComposition();
  before.compositionReceipts = [];

  const operation = composition.createCompositionOperation(before.composition, {
    kind: "node.update",
    frameId: "frame-opening",
    targetId: "opening-title",
    patch: { content: "A kept title" },
  });
  const draft = composition.createCompositionDraft(before.composition, "turn-undo", "Keep title", [operation]);
  const kept = composition.keepCompositionDraft(before.composition, draft);
  const current = {
    ...structuredClone(before),
    composition: kept.document,
    compositionReceipts: [kept.receipt],
  };

  const restored = restoreProjectForUndo(before, current, "2026-09-02T12:00:00.000Z");
  assert.equal(restored.composition.frames[0].nodes.find((node) => node.id === "opening-title").content, "A better way to direct design.");
  assert.equal(restored.composition.version, current.composition.version + 1);
  assert.equal(restored.composition.updatedAt, "2026-09-02T12:00:00.000Z");
  assert.deepEqual(restored.compositionReceipts, current.compositionReceipts);
});
