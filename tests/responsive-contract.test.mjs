import assert from "node:assert/strict"
import { readFile } from "node:fs/promises"
import test from "node:test"

const css = await readFile(new URL("../app/globals.css", import.meta.url), "utf8")

test("tablet critique mode keeps the command dock visible and complete", () => {
  assert.match(css, /@media\(max-width:1024px\)/)
  assert.match(css, /grid-template-areas:"artifacts mic input scope actions layers"/)
  assert.match(css, /\.command-dock\{[\s\S]*?position:fixed/)
  assert.match(css, /env\(safe-area-inset-bottom\)/)
})

test("mobile drawers and canvas preserve touch interaction", () => {
  assert.match(css, /\.magic-canvas\{[\s\S]*?touch-action:none/)
  assert.match(css, /\.artifact-rail,\.instrument-dock\{[\s\S]*?bottom:calc\(84px \+ env\(safe-area-inset-bottom\)\)/)
  assert.match(css, /-webkit-overflow-scrolling:touch/)
})
