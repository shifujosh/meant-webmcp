import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const studio = await readFile(new URL("../app/composition-studio.tsx", import.meta.url), "utf8");
const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
const readme = await readFile(new URL("../README.md", import.meta.url), "utf8");
const devpost = await readFile(new URL("../DEVPOST.md", import.meta.url), "utf8");

test("the release candidate uses the locked Meant identity and typography", () => {
  for (const source of [studio, css, layout, readme]) {
    assert.doesNotMatch(source, /Make what you meant\./);
    assert.doesNotMatch(source, /Instrument Serif/);
  }
  assert.match(studio, /meant-mdot-reversed\.svg/);
  assert.match(css, /font-family: "Instrument Sans"/);
  assert.match(css, /font-family: "Lora"/);
  assert.match(css, /\/fonts\/instrument-sans\/InstrumentSans-Variable\.ttf/);
  assert.match(css, /\/fonts\/lora\/Lora-Variable\.ttf/);
  assert.doesNotMatch(css, /fonts\.googleapis\.com/);
  assert.match(layout, /Make what you mean\./);
});

test("the public composition surface avoids AI ornament and internal capability copy", () => {
  assert.doesNotMatch(studio, /Sparkles/);
  assert.doesNotMatch(studio, /Agent ready|Browser tools off/);
  assert.match(studio, /Text ready/);
});

test("Keep never turns a rejected shared commit into an unversioned local success", () => {
  assert.doesNotMatch(studio, /keepCompositionDraft\(compositionRef\.current, active\)/);
  assert.doesNotMatch(studio, /Kept on this device/);
  assert.match(studio, /This direction is still Exploring/);
  assert.match(studio, /const nextState = response\.status === 409 \? "conflict" : "saved"/);
  assert.match(studio, /saveStateRef\.current = nextState/);
});

test("Exploring refinements accumulate and mobile Compare exposes an explicit version choice", () => {
  assert.match(studio, /extendCompositionDraft/);
  assert.match(studio, /mobileCompareView/);
  assert.match(studio, /View kept/);
  assert.match(studio, /View Exploring/);
});

test("submission copy distinguishes verified behavior from unverified live voice", () => {
  assert.match(devpost, /live audio round trip remains unverified/i);
  assert.doesNotMatch(devpost, /A voice-first phone experience with realtime, interruptible conversation\./);
});

test("production browsers cannot adopt a workspace capability from an untrusted URL", () => {
  assert.match(studio, /process\.env\.NODE_ENV !== "production"/);
  assert.match(studio, /const nextWorkspace = isolatedE2E \? requestedWorkspace! : storedWorkspace \?\? createId\("workspace"\)/);
  assert.doesNotMatch(studio, /const nextWorkspace = params\.get\("workspaceId"\) \?\?/);
});
