/** Cloudflare Worker entry point for the Meant application. */
import handler from "vinext/server/app-router-entry";

import { withMeantSecurityHeaders } from "../lib/server/security-headers";

interface Env {
  ASSETS: Fetcher;
  DB: D1Database;
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      // Meant ships only direct SVG brand media and static raster metadata.
      // Keep the unused billable optimizer surface closed.
      return withMeantSecurityHeaders(Response.json({ error: "Not found" }, { status: 404 }));
    }

    return withMeantSecurityHeaders(await handler.fetch(request, env, ctx), {
      privateApi: url.pathname.startsWith("/api/"),
    });
  },
};

export default worker;
