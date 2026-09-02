import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const realtimeRoute = await readFile(new URL("../app/api/realtime/session/route.ts", import.meta.url), "utf8").catch(() => "");
const studio = await readFile(new URL("../app/composition-studio.tsx", import.meta.url), "utf8").catch(() => "");
const webmcp = await readFile(new URL("../lib/meant/composition-webmcp.ts", import.meta.url), "utf8").catch(() => "");

test("the voice surface uses a server-authenticated realtime WebRTC session", () => {
  assert.match(realtimeRoute, /https:\/\/api\.openai\.com\/v1\/realtime\/calls/);
  assert.match(realtimeRoute, /OPENAI_API_KEY/);
  assert.match(realtimeRoute, /OpenAI-Safety-Identifier/);
  assert.match(realtimeRoute, /semantic_vad/);
  assert.match(realtimeRoute, /interrupt_response/);
  assert.match(studio, /new RTCPeerConnection\(\)/);
  assert.match(studio, /createDataChannel\("oai-events"\)/);
  assert.match(studio, /response\.cancel/);
  assert.match(studio, /channel\.onclose/);
  assert.match(studio, /pc\.onconnectionstatechange/);
  assert.match(studio, /pc\.oniceconnectionstatechange/);
  assert.match(studio, /releaseRealtimeResources/);
  assert.match(studio, /VOICE_SESSION_MAXIMUM_MS = 8 \* 60 \* 1_000/);
  assert.match(studio, /voiceSessionTimeoutRef/);
});

test("voice and WebMCP share composition commands instead of mutating pixels independently", () => {
  assert.match(studio, /createCompositionCommandSurface/);
  assert.match(webmcp, /get_composition_context/);
  assert.match(webmcp, /preview_composition_change/);
  assert.match(webmcp, /keep_composition_draft/);
  assert.match(webmcp, /undo_composition_change/);
});

test("the public surface exposes exploring, compare, keep, and undo states", () => {
  assert.match(studio, />Keep</);
  assert.match(studio, />Compare</);
  assert.match(studio, />Undo</);
  assert.match(studio, /Exploring/);
});

test("agent tools request consequential decisions while visible human controls perform them", () => {
  assert.match(studio, /keep: \(draftId\) => requestDraftDecision\("keep", draftId\)/);
  assert.match(studio, /discard: \(draftId\) => requestDraftDecision\("discard", draftId\)/);
  assert.match(studio, /undo: requestUndo/);
  assert.doesNotMatch(studio, /keep: keepDraft/);
  assert.doesNotMatch(studio, /discard: discardDraft/);
  assert.doesNotMatch(studio, /undo: undoChange/);
  assert.match(webmcp, /This agent tool never commits by itself/);
});
