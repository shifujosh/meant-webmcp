import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { DatabaseSync } from "node:sqlite";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({ appType: "custom", configFile: false, root, resolve: { alias: { "@": root } }, server: { middlewareMode: true, hmr: false } });
after(async () => vite.close());

const security = await vite.ssrLoadModule("/lib/server/request-security.ts");
const modelValidation = await vite.ssrLoadModule("/lib/server/model-request-validation.ts");
const { seedArtifacts } = await vite.ssrLoadModule("/lib/ghosa/seed.ts");

test("model context and image evidence have deterministic variable-cost ceilings", () => {
  const jpeg = `data:image/jpeg;base64,${"a".repeat(1_000)}`;
  const webp = `data:image/webp;base64,${"b".repeat(1_000)}`;
  assert.equal(modelValidation.validModelImageDataUrl(jpeg), true);
  assert.equal(modelValidation.validModelImageDataUrl(webp), true);
  assert.equal(modelValidation.validModelImageDataUrl("data:image/svg+xml;base64,PHN2Zz4="), false);
  assert.equal(
    modelValidation.validModelImageDataUrl(`data:image/png;base64,${"a".repeat(modelValidation.MODEL_IMAGE_DATA_URL_CHARACTER_LIMIT)}`),
    false,
  );
  assert.equal(modelValidation.modelInputWithinBudget({ prompt: "short", dataUrl: jpeg }, [jpeg]), true);
  assert.equal(
    modelValidation.modelInputWithinBudget({ prompt: "x".repeat(modelValidation.MODEL_STRUCTURED_CONTEXT_CHARACTER_LIMIT + 1) }, []),
    false,
  );
  const large = `data:image/jpeg;base64,${"a".repeat(1_499_000)}`;
  assert.equal(modelValidation.modelInputWithinBudget({ prompt: "short" }, [large, large, large]), false);
  const adversarialNode = { id: "node-1", dataUrl: "x".repeat(modelValidation.MODEL_STRUCTURED_CONTEXT_CHARACTER_LIMIT + 1) };
  assert.equal(modelValidation.modelInputWithinBudget({ artifact: { nodes: [adversarialNode] } }, []), false);
});

test("model operations and scoped anchors fail closed on invented or incapable node targets", () => {
  const web = seedArtifacts.find((artifact) => artifact.kind === "web");
  const capable = web.nodes.find((node) => node.capabilities.includes("typeScale"));
  const incapable = web.nodes.find((node) => !node.capabilities.includes("typeScale"));
  assert.ok(capable);
  assert.ok(incapable);
  assert.equal(modelValidation.modelOperationTargetsAreValid(web, [capable.id], "typeScale"), true);
  assert.equal(modelValidation.modelOperationTargetsAreValid(web, ["invented-node"], "typeScale"), false);
  assert.equal(modelValidation.modelOperationTargetsAreValid(web, [incapable.id], "typeScale"), false);
  assert.equal(modelValidation.modelOperationTargetsAreValid(web, [], "typeScale"), true);
  assert.equal(modelValidation.scopedIntentAnchorHasTargets("element", []), false);
  assert.equal(modelValidation.scopedIntentAnchorHasTargets("region", []), false);
  assert.equal(modelValidation.scopedIntentAnchorHasTargets("artifact", []), true);
});

test("workspace storage authority is deterministic per principal and isolated across principals", async () => {
  const raw = "workspace-12345678-1234-4234-9234-123456789abc";
  const alice = await security.workspaceStorageIdForPrincipal("alice", raw);
  const aliceAgain = await security.workspaceStorageIdForPrincipal("alice", raw);
  const bob = await security.workspaceStorageIdForPrincipal("bob", raw);
  assert.equal(alice, aliceAgain);
  assert.notEqual(alice, bob);
  assert.match(alice, /^workspace-[0-9a-f]{64}$/);
  assert.doesNotMatch(alice, new RegExp(raw));
  const productionAliceOne = await security.workspaceStorageIdForPrincipal("alice", raw, false);
  const productionAliceTwo = await security.workspaceStorageIdForPrincipal("alice", "workspace-99999999-9999-4999-8999-999999999999", false);
  assert.equal(productionAliceOne, productionAliceTwo, "production storage must remain one bounded workspace per principal");
});

test("OpenAI safety identifiers follow the authenticated principal, never the workspace header", async () => {
  const aliceWorkspaceOne = new Request("https://meant.example/api/realtime/session", {
    headers: {
      "oai-authenticated-user-email": "alice@example.com",
      "x-meant-workspace": "workspace-11111111-1111-4111-8111-111111111111",
    },
  });
  const aliceWorkspaceTwo = new Request("https://meant.example/api/realtime/session", {
    headers: {
      "oai-authenticated-user-email": "alice@example.com",
      "x-meant-workspace": "workspace-22222222-2222-4222-8222-222222222222",
    },
  });
  const bobWorkspaceOne = new Request("https://meant.example/api/realtime/session", {
    headers: {
      "oai-authenticated-user-email": "bob@example.com",
      "x-meant-workspace": "workspace-11111111-1111-4111-8111-111111111111",
    },
  });

  const aliceFirst = await security.openAISafetyIdentifier(aliceWorkspaceOne);
  const aliceSecond = await security.openAISafetyIdentifier(aliceWorkspaceTwo);
  const bob = await security.openAISafetyIdentifier(bobWorkspaceOne);
  assert.equal(aliceFirst, aliceSecond);
  assert.notEqual(aliceFirst, bob);
  assert.match(aliceFirst, /^meant-[0-9a-f]{64}$/);
});

test("production browser sessions are durable, isolated principals and never override ChatGPT identity", async () => {
  const aliceToken = "alice-session-token-1234567890abcdef";
  const bobToken = "bob-session-token-1234567890abcdef12";
  const alice = await security.requestPrincipal(new Request("https://meant.example/api/project", {
    headers: { cookie: `meant_session=${aliceToken}` },
  }), "production");
  const aliceAgain = await security.requestPrincipal(new Request("https://meant.example/api/project", {
    headers: { cookie: `other=1; meant_session=${aliceToken}; theme=paper` },
  }), "production");
  const bob = await security.requestPrincipal(new Request("https://meant.example/api/project", {
    headers: { cookie: `meant_session=${bobToken}` },
  }), "production");
  const chatgpt = await security.requestPrincipal(new Request("https://meant.example/api/project", {
    headers: {
      cookie: `meant_session=${aliceToken}`,
      "oai-authenticated-user-email": "creator@example.com",
    },
  }), "production");

  assert.equal(alice.source, "session");
  assert.equal(alice.id, aliceAgain.id);
  assert.notEqual(alice.id, bob.id);
  assert.equal(chatgpt.source, "chatgpt");
  assert.notEqual(chatgpt.id, alice.id);
  assert.equal(await security.requestPrincipal(new Request("https://meant.example/api/project", {
    headers: { cookie: "meant_session=too-short" },
  }), "production"), null);
});

test("workspace and public identifiers reject unbounded or ambiguous input", () => {
  assert.equal(security.validWorkspaceId("short"), false);
  assert.equal(security.validWorkspaceId("workspace-valid-1234"), true);
  assert.equal(security.validWorkspaceId("workspace/escape-1234"), false);
  assert.equal(security.validPublicId("project-valid"), true);
  assert.equal(security.validPublicId("project with spaces"), false);
});

test("model routes authenticate first and reserve only after bounded validation and configuration", async () => {
  const expectations = [
    ["../app/api/realtime/session/route.ts", "readBoundedBody", "sdp.trim()", 1],
    ["../app/api/transcribe/route.ts", "readBoundedBody", "audio instanceof File", 1],
    ["../app/api/intent/route.ts", "readBoundedJson", "validRequest(body)", 2],
    ["../app/api/verify/route.ts", "readBoundedJson", "validRequest(body)", 1],
  ];
  for (const [path, boundedMarker, validationMarker, expectedReservations] of expectations) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    const handler = source.slice(source.indexOf("export async function POST"));
    const authenticateAt = handler.indexOf("await authenticateModelRequest");
    const boundedAt = handler.indexOf(boundedMarker);
    const validationAt = handler.indexOf(validationMarker);
    const configurationAt = handler.indexOf("process.env.OPENAI_API_KEY");
    const reserveAt = handler.indexOf("await reserveModelRequestBudget");
    assert.ok(authenticateAt >= 0, `${path}: missing authentication`);
    assert.ok(authenticateAt < boundedAt, `${path}: authentication must precede body parsing`);
    assert.ok(boundedAt < reserveAt, `${path}: bounded body parsing must precede reservation`);
    assert.ok(validationAt < reserveAt, `${path}: schema/content validation must precede reservation`);
    assert.ok(configurationAt < reserveAt, `${path}: deployment configuration must precede reservation`);
    assert.equal(handler.match(/await reserveModelRequestBudget/g)?.length ?? 0, expectedReservations, path);
    if (path.includes("intent")) {
      const embeddingReserveAt = handler.indexOf("const embeddingBudget = await reserveModelRequestBudget");
      const embeddingOutboundAt = handler.indexOf("await semanticConceptScores");
      const responseReserveAt = handler.indexOf("const responseBudget = await reserveModelRequestBudget");
      const responseOutboundAt = handler.indexOf('fetch("https://api.openai.com/v1/responses"');
      assert.ok(embeddingReserveAt < embeddingOutboundAt, `${path}: embedding reservation must precede its outbound`);
      assert.ok(responseReserveAt < responseOutboundAt, `${path}: response reservation must precede its outbound`);
    } else {
      assert.ok(reserveAt < handler.indexOf('fetch("https://api.openai.com/'), `${path}: reservation must precede its outbound`);
    }
  }
});

test("mutation routes authenticate before parsing request bodies", async () => {
  for (const path of [
    "../app/api/composition/commit/route.ts",
    "../app/api/transactions/stage/route.ts",
    "../app/api/transactions/apply/route.ts",
    "../app/api/transactions/undo/route.ts",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    const handler = source.slice(source.indexOf("export async function POST"));
    const authenticateAt = handler.indexOf("await authenticateRequest");
    const parseAt = handler.indexOf("readBoundedJson");
    assert.ok(authenticateAt >= 0, `${path}: missing authentication`);
    assert.ok(authenticateAt < parseAt, `${path}: authentication must precede body parsing`);
    assert.match(handler, /reserveMutationRequestBudget/, `${path}: missing authenticated mutation admission`);
    assert.ok(parseAt < handler.indexOf("reserveMutationRequestBudget"), `${path}: mutation admission must follow bounded parsing`);
  }
});

test("mutation admission has explicit principal and deployment ceilings", () => {
  assert.equal(security.MUTATION_PRINCIPAL_MINUTE_LIMIT, 30);
  assert.equal(security.MUTATION_PRINCIPAL_DAILY_LIMIT, 120);
  assert.equal(security.MUTATION_DEPLOYMENT_MINUTE_LIMIT, 200);
  assert.equal(security.MUTATION_DEPLOYMENT_DAILY_LIMIT, 2_000);
});

test("realtime voice bounds session admission, per-turn output, and retained conversation context", async () => {
  const source = await readFile(new URL("../app/api/realtime/session/route.ts", import.meta.url), "utf8");
  assert.equal(security.MODEL_LIMITS.realtime, 1);
  assert.equal(security.REALTIME_PRINCIPAL_DAILY_LIMIT, 10);
  assert.equal(security.REALTIME_DEPLOYMENT_MINUTE_LIMIT, 10);
  assert.equal(security.REALTIME_DEPLOYMENT_DAILY_LIMIT, 100);
  assert.match(source, /max_output_tokens:\s*768/);
  assert.match(source, /type:\s*"retention_ratio"/);
  assert.match(source, /retention_ratio:\s*0\.8/);
  assert.match(source, /post_instructions:\s*8_000/);
  assert.match(source, /MEANT_ENABLE_REALTIME_VOICE !== "true"/);
  assert.ok(source.indexOf("MEANT_ENABLE_REALTIME_VOICE") < source.indexOf("process.env.OPENAI_API_KEY"));
});

test("production authentication has no shared demo-token tenant fallback", async () => {
  const source = await readFile(new URL("../lib/server/request-security.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /MEANT_DEMO_ACCESS_TOKEN|x-meant-demo-token|demo-token/);
});

test("the unused billable image optimizer is closed", async () => {
  const source = await readFile(new URL("../worker/index.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /handleImageOptimization|env\.IMAGES/);
  assert.match(source, /url\.pathname === "\/_vinext\/image"/);
  assert.match(source, /status:\s*404/);
});

test("the composition surface exposes the platform sign-in path when durable identity is unavailable", async () => {
  const source = await readFile(new URL("../app/composition-studio.tsx", import.meta.url), "utf8");
  const sessionAt = source.indexOf('fetch("/api/session"');
  const projectAt = source.indexOf("fetch(`/api/project?workspaceId=");
  assert.ok(sessionAt >= 0, "the browser must establish a durable session before loading its project");
  assert.ok(sessionAt < projectAt, "session bootstrap must precede project hydration");
  assert.match(source, /response\.status === 401/);
  assert.match(source, /href="\/signin-with-chatgpt\?return_to=%2F"/);
  assert.match(source, />Sign in to save<\/a>/);
});

test("the first-party session endpoint emits a hardened opaque cookie without exposing its value", async () => {
  const source = await readFile(new URL("../app/api/session/route.ts", import.meta.url), "utf8");
  assert.match(source, /HttpOnly/);
  assert.match(source, /Secure/);
  assert.match(source, /SameSite=Lax/);
  assert.match(source, /Cache-Control[^\n]+no-store/);
  assert.doesNotMatch(source, /Response\.json\([^\n]*(token|sessionId)/i);
});

test("every supported OpenAI upstream receives the principal-derived safety identifier", async () => {
  const routeExpectations = new Map([
    ["../app/api/realtime/session/route.ts", 1],
    ["../app/api/transcribe/route.ts", 1],
    ["../app/api/intent/route.ts", 2],
    ["../app/api/verify/route.ts", 1],
  ]);
  for (const [path, expectedHeaderCount] of routeExpectations) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.match(source, /identity\.safetyIdentifier/);
    assert.equal(source.match(/"OpenAI-Safety-Identifier"/g)?.length ?? 0, expectedHeaderCount, path);
  }
});

test("a rejected per-route request rolls back before consuming the deployment budget", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(security.MODEL_REQUEST_WINDOW_TABLE_SQL);
  db.exec(security.MODEL_REQUEST_BUDGET_GUARD_TABLE_SQL);
  db.exec(security.MODEL_REQUEST_BUDGET_GUARD_TRIGGER_SQL);
  const increment = db.prepare(security.MODEL_REQUEST_INCREMENT_SQL);
  const guard = db.prepare(security.MODEL_REQUEST_ASSERT_CHANGED_SQL);
  const attempt = (route, routeLimit) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      increment.run("principal-a", route, 1234, routeLimit);
      guard.run();
      increment.run("deployment", "all-model-routes", 1234, 80);
      guard.run();
      db.exec("COMMIT");
      return true;
    } catch (error) {
      db.exec("ROLLBACK");
      assert.match(String(error), /MEANT_MODEL_BUDGET_EXCEEDED/);
      return false;
    }
  };

  assert.equal(attempt("realtime", 1), true);
  assert.equal(attempt("realtime", 1), false);
  const globalAfterReject = db.prepare("SELECT request_count FROM model_request_windows WHERE principal_id = 'deployment'").get();
  assert.equal(globalAfterReject.request_count, 1);
  assert.equal(attempt("verify", 6), true);
  const globalAfterOtherRoute = db.prepare("SELECT request_count FROM model_request_windows WHERE principal_id = 'deployment'").get();
  assert.equal(globalAfterOtherRoute.request_count, 2);
  db.close();
});

test("a rejected daily request rolls back both minute counters and the other daily counter", () => {
  const db = new DatabaseSync(":memory:");
  db.exec(security.MODEL_REQUEST_WINDOW_TABLE_SQL);
  db.exec(security.MODEL_REQUEST_BUDGET_GUARD_TABLE_SQL);
  db.exec(security.MODEL_REQUEST_BUDGET_GUARD_TRIGGER_SQL);
  db.exec(security.MODEL_REQUEST_DAILY_TABLE_SQL);
  db.exec(security.MODEL_REQUEST_DAILY_GUARD_TABLE_SQL);
  db.exec(security.MODEL_REQUEST_DAILY_GUARD_TRIGGER_SQL);
  const minuteIncrement = db.prepare(security.MODEL_REQUEST_INCREMENT_SQL);
  const minuteGuard = db.prepare(security.MODEL_REQUEST_ASSERT_CHANGED_SQL);
  const dailyIncrement = db.prepare(security.MODEL_REQUEST_DAILY_INCREMENT_SQL);
  const dailyGuard = db.prepare(security.MODEL_REQUEST_DAILY_ASSERT_CHANGED_SQL);
  const attempt = (principal, principalDailyLimit) => {
    db.exec("BEGIN IMMEDIATE");
    try {
      minuteIncrement.run(principal, "intent", 1234, 12);
      minuteGuard.run();
      minuteIncrement.run("deployment", "all-model-routes", 1234, 80);
      minuteGuard.run();
      dailyIncrement.run(principal, 5678, principalDailyLimit);
      dailyGuard.run();
      dailyIncrement.run("deployment", 5678, 5_000);
      dailyGuard.run();
      db.exec("COMMIT");
      return true;
    } catch (error) {
      db.exec("ROLLBACK");
      assert.match(String(error), /MEANT_MODEL_DAILY_BUDGET_EXCEEDED/);
      return false;
    }
  };

  assert.equal(attempt("principal-a", 1), true);
  assert.equal(attempt("principal-a", 1), false);
  assert.equal(
    db.prepare("SELECT request_count FROM model_request_windows WHERE principal_id = 'deployment'").get().request_count,
    1,
  );
  assert.equal(
    db.prepare("SELECT request_count FROM model_request_daily_budgets WHERE principal_id = 'deployment'").get().request_count,
    1,
  );
  db.close();
});

test("budget responses use deterministic boundary-aligned retry-after values", () => {
  const now = Date.UTC(2026, 8, 2, 12, 34, 45, 250);
  assert.equal(security.modelBudgetRetryAfter("minute", now), 15);
  assert.equal(security.modelBudgetRetryAfter("daily", now), 41_115);
});

test("the durable migration and local initializer both install the daily-budget abort trigger", async () => {
  const migration = await readFile(new URL("../drizzle/0004_conscious_pixie.sql", import.meta.url), "utf8");
  const localInit = await readFile(new URL("../scripts/init-local-db.sql", import.meta.url), "utf8");
  for (const source of [migration, localInit]) {
    assert.match(source, /model_request_daily_budgets/);
    assert.match(source, /reject_model_request_daily_budget_guard/);
    assert.match(source, /MEANT_MODEL_DAILY_BUDGET_EXCEEDED/);
  }
});

test("request admission relies on completed migrations and never performs runtime DDL", async () => {
  const source = await readFile(new URL("../lib/server/request-security.ts", import.meta.url), "utf8");
  const admission = source.slice(source.indexOf("export async function admitModelRequest"), source.indexOf("export async function reserveModelRequestBudget"));
  assert.doesNotMatch(admission, /CREATE\s+(?:TABLE|INDEX|TRIGGER)/i);
  assert.match(admission, /await raw\.batch/);
});

test("realtime SDP is byte-bounded and never read with unbounded request.text", async () => {
  const source = await readFile(new URL("../app/api/realtime/session/route.ts", import.meta.url), "utf8");
  assert.match(source, /readBoundedBody\(request, 100_000, "WebRTC offer"\)/);
  assert.doesNotMatch(source, /request\.text\(\)/);
  assert.match(source, /sdp\.trim\(\)/);
});

test("legacy recorded transcription is disabled by default in production and makes no duration claim", async () => {
  const source = await readFile(new URL("../app/api/transcribe/route.ts", import.meta.url), "utf8");
  assert.match(source, /MEANT_ENABLE_RECORDED_TRANSCRIPTION/);
  assert.match(source, /process\.env\.NODE_ENV === "production"/);
  assert.doesNotMatch(source, /under one minute/);
});

test("realtime SDP returns 413 for bytes over the cap and 400 for an empty offer", async () => {
  const realtime = await vite.ssrLoadModule("/app/api/realtime/session/route.ts");
  const oversized = await realtime.POST(new Request("https://meant.example/api/realtime/session", {
    method: "POST",
    headers: { "content-type": "application/sdp", "content-length": "100001" },
    body: "v=0",
  }));
  assert.equal(oversized.status, 413);
  assert.match((await oversized.json()).error, /exceeds the input limit/);

  const empty = await realtime.POST(new Request("https://meant.example/api/realtime/session", {
    method: "POST",
    headers: { "content-type": "application/sdp" },
    body: "  \n",
  }));
  assert.equal(empty.status, 400);
  assert.match((await empty.json()).error, /offer is empty/);
});

test("intent and verification reject structurally incomplete creative schemas before configuration or budget", async () => {
  const intent = await vite.ssrLoadModule("/app/api/intent/route.ts");
  const invalidIntent = await intent.POST(new Request("https://meant.example/api/intent", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      transcript: "Make this calmer",
      scope: "artifact",
      anchor: { artifactId: "artifact-bad", targetIds: [], targetNames: [] },
      project: { name: "Bad project", artifacts: [{ id: "artifact-bad", kind: "unknown", nodes: [] }] },
    }),
  }));
  assert.equal(invalidIntent.status, 400);

  const verify = await vite.ssrLoadModule("/app/api/verify/route.ts");
  const invalidVerification = await verify.POST(new Request("https://meant.example/api/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      transcript: "Make this calmer",
      scope: "artifact",
      anchor: { artifactId: "artifact-bad", targetIds: [], targetNames: [] },
      designPlan: {},
      operations: [{}],
      artifacts: [{}],
    }),
  }));
  assert.equal(invalidVerification.status, 400);
});

test("intent and verification enforce the bounded model-input envelope before reservation", async () => {
  for (const path of ["../app/api/intent/route.ts", "../app/api/verify/route.ts"]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    const handler = source.slice(source.indexOf("export async function POST"));
    assert.match(handler, /readBoundedJson<unknown>\(request, 3_500_000/);
    const envelopeAt = handler.indexOf("modelInputWithinBudget");
    const reserveAt = handler.indexOf("reserveModelRequestBudget");
    assert.ok(envelopeAt >= 0 && envelopeAt < reserveAt, `${path}: variable-cost envelope must precede reservation`);
  }
});

test("the canonical seed project satisfies the strict model-input schema", async () => {
  const validation = await vite.ssrLoadModule("/lib/server/model-request-validation.ts");
  const { seedProject } = await vite.ssrLoadModule("/lib/ghosa/seed.ts");
  assert.ok(seedProject.artifacts.every(validation.validCreativeArtifact));
  assert.equal(validation.validDesignIntelligenceProfile(seedProject.designIntelligence), true);
});
