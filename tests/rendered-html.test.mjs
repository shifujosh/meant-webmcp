import assert from "node:assert/strict";
import test from "node:test";

const compositionRevisionMeta =
  /<meta(?=[^>]*\bname=["']meant-draft-revision["'])(?=[^>]*\bcontent=["']meant-conversational-composition-v3["'])[^>]*>/i;

test("renders the canonical Meant composition revision", async (context) => {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  let worker;
  try {
    ({ default: worker } = await import(workerUrl.href));
  } catch (error) {
    if (error?.code === "ERR_UNSUPPORTED_ESM_URL_SCHEME" && `${error.message}`.includes("cloudflare:")) {
      context.skip("The generated Worker requires the Cloudflare runtime; the production build validates it.");
      return;
    }
    throw error;
  }

  const response = await worker.fetch(
    new Request("http://localhost/", {
      headers: { accept: "text/html" },
    }),
    {
      ASSETS: {
        fetch: async () => new Response("Not found", { status: 404 }),
      },
    },
    {
      waitUntil() {},
      passThroughOnException() {},
    },
  );

  assert.equal(response.status, 200);
  assert.match(
    response.headers.get("content-type") ?? "",
    /^text\/html\b/i,
  );
  assert.match(await response.text(), compositionRevisionMeta);
});
