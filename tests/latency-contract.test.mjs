import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const studioSource = await readFile(`${root}/app/studio.tsx`, "utf8");
const intentSource = await readFile(`${root}/app/api/intent/route.ts`, "utf8");
const applySource = await readFile(`${root}/app/api/transactions/apply/route.ts`, "utf8");
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true, hmr: false },
});

after(async () => vite.close());

test("intent reasoning performs no post-approval raster or verification work", () => {
  const intentStart = studioSource.indexOf("const intentRequest = fetchWithTimeout(\"/api/intent\"");
  const awaitIntent = studioSource.indexOf("const response = await intentRequest", intentStart);

  assert.ok(intentStart > 0);
  assert.ok(awaitIntent > intentStart);
  assert.equal(studioSource.indexOf("beforeImagePromise", intentStart), -1);
  assert.equal(studioSource.indexOf("/api/verify", intentStart), -1);
});

test("deterministic verification blocks before the durable transaction acknowledges success", () => {
  const verificationStart = applySource.indexOf("verifyRequestedPostconditions");
  const persistenceStart = applySource.indexOf("raw.batch", verificationStart);
  const successStart = applySource.indexOf("ok: true", persistenceStart);
  assert.ok(verificationStart > 0);
  assert.ok(persistenceStart > verificationStart);
  assert.ok(successStart > persistenceStart);
});

test("semantic recall has a bounded sub-budget and scoped requests prune artifact context", () => {
  assert.match(intentSource, /SEMANTIC_RECALL_BUDGET_MS = 450/);
  assert.match(
    intentSource,
    /const contextArtifacts = body\.scope === \"project\" \? body\.project\.artifacts : \[anchorArtifact\]/,
  );
});

test("model requests expose timing, cache the stable prefix, and scale output with reasoning", () => {
  assert.match(intentSource, /\"Server-Timing\"/);
  assert.match(intentSource, /prompt_cache_breakpoint: \{ mode: \"explicit\" \}/);
  assert.match(intentSource, /prompt_cache_options: \{ mode: \"explicit\" \}/);
  assert.match(intentSource, /reasoningEffort === \"high\" \? 3_500 : reasoningEffort === \"medium\" \? 3_000 : 2_400/);
  assert.match(intentSource, /verbosity: \"low\"/);
});

test("the live intent route sends only scoped context and returns server timing", async () => {
  const { POST } = await vite.ssrLoadModule("/app/api/intent/route.ts");
  const { seedProject } = await vite.ssrLoadModule("/lib/ghosa/seed.ts");
  const artifact = seedProject.artifacts[0];
  const originalFetch = globalThis.fetch;
  const originalKey = process.env.OPENAI_API_KEY;
  const originalAdmission = process.env.MEANT_TEST_MODEL_ADMISSION;
  let upstreamBody;
  process.env.OPENAI_API_KEY = "latency-contract-test";
  process.env.MEANT_TEST_MODEL_ADMISSION = "allow";
  globalThis.fetch = async (_input, init) => {
    upstreamBody = JSON.parse(String(init?.body));
    return Response.json({ error: { message: "intentional test stop" } }, { status: 429 });
  };

  try {
    const response = await POST(new Request("https://meant.test/api/intent", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "oai-authenticated-user-email": "latency-contract@meant.test",
      },
      body: JSON.stringify({
        transcript: "Make it warmer but not more playful. Keep the layout intact.",
        scope: "artifact",
        anchor: {
          artifactId: artifact.id,
          artifactVersion: artifact.version,
          targetIds: [],
          targetNames: [artifact.name],
        },
        project: seedProject,
      }),
    }));

    assert.equal(response.status, 429);
    assert.match(response.headers.get("server-timing") ?? "", /graph;dur=/);
    assert.match(response.headers.get("server-timing") ?? "", /model;dur=/);
    assert.equal(upstreamBody.reasoning.effort, "medium");
    assert.equal(upstreamBody.max_output_tokens, 3000);
    assert.equal(upstreamBody.prompt_cache_options.mode, "explicit");
    const context = JSON.parse(upstreamBody.input[1].content[0].text);
    assert.deepEqual(context.project.artifacts.map((item) => item.id), [artifact.id]);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalKey === undefined) delete process.env.OPENAI_API_KEY;
    else process.env.OPENAI_API_KEY = originalKey;
    if (originalAdmission === undefined) delete process.env.MEANT_TEST_MODEL_ADMISSION;
    else process.env.MEANT_TEST_MODEL_ADMISSION = originalAdmission;
  }
});
