import assert from "node:assert/strict";
import test from "node:test";

import { withMeantSecurityHeaders } from "../lib/server/security-headers.ts";

test("deployment responses restrict framing and opt every document into an origin-keyed agent cluster", async () => {
  const secured = withMeantSecurityHeaders(new Response("ok", {
    headers: { "content-security-policy": "default-src 'self'" },
  }));

  const csp = secured.headers.get("content-security-policy") ?? "";
  assert.match(csp, /default-src 'self'/);
  assert.match(csp, /frame-ancestors 'self' https:\/\/chatgpt\.com https:\/\/\*\.chatgpt\.com https:\/\/chat\.openai\.com https:\/\/\*\.chat\.openai\.com/);
  assert.equal(secured.headers.get("x-content-type-options"), "nosniff");
  assert.equal(secured.headers.get("referrer-policy"), "strict-origin-when-cross-origin");
  assert.equal(secured.headers.get("origin-agent-cluster"), "?1");
  assert.equal(await secured.text(), "ok");
});

test("an existing host frame-ancestors policy is never weakened", () => {
  const secured = withMeantSecurityHeaders(new Response(null, {
    headers: { "content-security-policy": "frame-ancestors 'none'; default-src 'self'" },
  }));
  assert.equal(secured.headers.get("content-security-policy"), "frame-ancestors 'none'; default-src 'self'");
});

test("API responses are explicitly private and never cached", () => {
  const secured = withMeantSecurityHeaders(new Response("sensitive"), { privateApi: true });
  assert.equal(secured.headers.get("cache-control"), "private, no-store");
});
