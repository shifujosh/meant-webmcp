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

const { selectDesignReasoningEffort } = await vite.ssrLoadModule("/lib/ghosa/reasoning.ts");
const { seedProject } = await vite.ssrLoadModule("/lib/ghosa/seed.ts");

test("ordinary scoped edits use the responsive design pass", () => {
  assert.equal(selectDesignReasoningEffort("Make the headline larger"), "low");
  assert.equal(selectDesignReasoningEffort("Reduce the background blur"), "low");
});

test("nuanced constraints stay measured while broad direction earns the deeper strategy pass", () => {
  assert.equal(selectDesignReasoningEffort("Refine the overall hierarchy and make the whole design feel more editorial"), "high");
  assert.equal(selectDesignReasoningEffort("Make it confident without making it louder, while preserving the warmth"), "medium");
  assert.equal(selectDesignReasoningEffort("Coordinate this across the campaign", "project"), "high");
});

test("the canonical demo reset contains all three proof artifacts", () => {
  assert.deepEqual(seedProject.artifacts.map((artifact) => artifact.kind), ["web", "graphic", "photo"]);
  assert.ok(seedProject.artifacts.every((artifact) => artifact.nodes.length > 0));
  assert.equal(seedProject.artifacts[0].nodes.some((node) => node.id === "web-supporting-copy"), true);
});
