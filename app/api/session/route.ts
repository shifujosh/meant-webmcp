import {
  createBrowserSessionToken,
  MEANT_SESSION_COOKIE,
  requestPrincipal,
  sameOriginRequest,
} from "@/lib/server/request-security";

const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 30;

function sessionResponse(body: Record<string, unknown>, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Cache-Control", "private, no-store");
  headers.set("Vary", "Cookie, oai-authenticated-user-email");
  return Response.json(body, { ...init, headers });
}

export async function POST(request: Request) {
  if (!sameOriginRequest(request)) {
    return sessionResponse({ error: "A same-origin request is required" }, { status: 403 });
  }

  const existing = await requestPrincipal(request);
  if (existing) {
    return sessionResponse({ ok: true, identity: existing.source });
  }

  const value = createBrowserSessionToken();
  return sessionResponse(
    { ok: true, identity: "browser" },
    {
      status: 201,
      headers: {
        "Set-Cookie": `${MEANT_SESSION_COOKIE}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_MAX_AGE_SECONDS}`,
      },
    },
  );
}
