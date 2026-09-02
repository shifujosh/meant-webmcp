import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
after(async () => vite.close());

const composition = await vite.ssrLoadModule("/lib/meant/composition-core.ts");
const { reanchorCompositionSelection } = await vite.ssrLoadModule("/lib/meant/composition-selection.ts");

test("selection falls back to a real semantic target after a replacement draft is discarded", () => {
  const kept = composition.createSeedComposition();
  const selection = reanchorCompositionSelection(kept, "frame-poster", ["poster-title"]);
  assert.deepEqual(selection, { frameId: "frame-opening", nodeIds: ["opening-title"] });
});

test("selection preserves only node ids that exist in the selected frame", () => {
  const kept = composition.createSeedComposition();
  const selection = reanchorCompositionSelection(kept, "frame-proof", ["proof-title", "opening-title"]);
  assert.deepEqual(selection, { frameId: "frame-proof", nodeIds: ["proof-title"] });
});
