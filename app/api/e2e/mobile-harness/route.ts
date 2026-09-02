const WORKSPACE_PATTERN = /^e2e-[a-zA-Z0-9-]{8,87}$/;

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const url = new URL(request.url);
  const workspaceId = url.searchParams.get("workspaceId") ?? "";
  const width = Number(url.searchParams.get("width") ?? "390");
  if (!WORKSPACE_PATTERN.test(workspaceId)) {
    return Response.json({ error: "A bounded e2e workspace is required" }, { status: 400 });
  }
  if (![390, 768].includes(width)) {
    return Response.json({ error: "The evidence viewport must be 390px or 768px wide" }, { status: 400 });
  }
  const source = `/?e2e=1&workspaceId=${encodeURIComponent(workspaceId)}`;
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>Meant mobile evidence harness</title><style>html,body{margin:0;min-width:${width}px;background:#191816}iframe{display:block;width:${width}px;height:844px;border:0}</style></head><body><iframe title="Meant mobile viewport" src="${source}"></iframe></body></html>`, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
