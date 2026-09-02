import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const studio = await readFile(new URL("../app/studio.tsx", import.meta.url), "utf8")
const compositionStudio = await readFile(new URL("../app/composition-studio.tsx", import.meta.url), "utf8")
const route = await readFile(new URL("../app/api/transcribe/route.ts", import.meta.url), "utf8")

test("bounded recorded transcription remains available as a compatibility surface", () => {
  assert.match(studio, /new MediaRecorder\(stream/)
  assert.match(studio, /fetchWithTimeout\("\/api\/transcribe"/)
  assert.match(studio, /recorder\.stop\(\)/)
  assert.doesNotMatch(studio, /new RTCPeerConnection\(\)/)
})

test("the primary composition studio uses a persistent interruptible realtime session", () => {
  assert.match(compositionStudio, /new RTCPeerConnection\(\)/)
  assert.match(compositionStudio, /\/api\/realtime\/session/)
  assert.match(compositionStudio, /response\.cancel/)
})

test("recorded audio is transient and grounded in GHOSA vocabulary", () => {
  assert.match(route, /model", "gpt-transcribe"/)
  assert.match(route, /keywords\[\]/)
  assert.match(route, /languages\[\]", "en"/)
  assert.match(route, /languages\[\]", "es"/)
  assert.match(route, /audioRetained: false/)
  assert.match(route, /cache-control": "no-store"/)
})

test("canonical voice text enters the same execution router as typed text", () => {
  assert.match(studio, /setDraft\(\[draftAtListenStartRef\.current, transcript\]/)
  assert.match(studio, /setCaptureMethod\("gpt-transcribe"\)/)
  assert.match(studio, /const disposition = instantLanguageDisposition\(transcript\)/)
  assert.match(studio, /const intentRequest = fetchWithTimeout\("\/api\/intent"/)
  assert.match(studio, /const response = await intentRequest/)
})
