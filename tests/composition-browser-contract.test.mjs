import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const studio = await readFile(new URL("../app/composition-studio.tsx", import.meta.url), "utf8");
const legacyStudio = await readFile(new URL("../app/studio.tsx", import.meta.url), "utf8");
const browserSuite = await readFile(new URL("./composition-browser-d1.integration.mjs", import.meta.url), "utf8");

test("the canonical composition surface exposes development-only browser evidence hooks", () => {
  assert.match(studio, /process\.env\.NODE_ENV !== "production"/);
  assert.match(studio, /data-testid="composition-e2e-state"/);
  assert.match(studio, /data-testid="composition-e2e-webmcp-input"/);
  assert.match(studio, /data-testid="composition-e2e-webmcp-execute"/);
  assert.match(studio, /e2eToolsRef/);
  assert.match(studio, /domain: "composition"/);
  assert.match(studio, /role="status"/);
  assert.match(legacyStudio, /process\.env\.NODE_ENV === "production"/);
  assert.match(legacyStudio, /setWebMcpStatus\("unavailable"\)/);
});

test("the canonical browser suite targets the real product route and full decision loop", () => {
  assert.match(browserSuite, /\/\?e2e=1&workspaceId=/);
  assert.match(browserSuite, /Exploring/);
  assert.match(browserSuite, /Compare/);
  assert.match(browserSuite, /Keep/);
  assert.match(browserSuite, /Discard/);
  assert.match(browserSuite, /Undo/);
  assert.match(browserSuite, /History/);
  assert.match(browserSuite, /keep_composition_draft/);
  assert.match(browserSuite, /undo_composition_change/);
  assert.match(browserSuite, /Promise\.all/);
  assert.match(browserSuite, /390/);
  assert.match(browserSuite, /768/);
  assert.match(browserSuite, /bootstrap-race/);
  assert.match(browserSuite, /long-turn/);
});
