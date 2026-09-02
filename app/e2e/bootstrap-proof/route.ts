import { GET as readProject, POST as bootstrapProject } from "@/app/api/project/route";
import { seedProject } from "@/lib/ghosa/seed";
import { createSeedComposition } from "@/lib/meant/composition-core";

const WORKSPACE_PATTERN = /^e2e-[a-zA-Z0-9-]{8,87}$/;

export async function GET(request: Request) {
  if (process.env.NODE_ENV === "production") {
    return Response.json({ error: "Not found" }, { status: 404 });
  }
  const requestUrl = new URL(request.url);
  const workspaceId = requestUrl.searchParams.get("workspaceId") ?? "";
  if (!WORKSPACE_PATTERN.test(workspaceId)) {
    return Response.json({ error: "A bounded e2e workspace is required" }, { status: 400 });
  }

  const left = structuredClone(seedProject);
  const right = structuredClone(seedProject);
  left.composition = createSeedComposition();
  right.composition = createSeedComposition();
  left.composition.id = "composition-bootstrap-left";
  right.composition.id = "composition-bootstrap-right";

  const endpoint = `${requestUrl.origin}/api/project?workspaceId=${workspaceId}`;
  const post = async (project: typeof left) => {
    const response = await bootstrapProject(new Request(endpoint, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ project, expectedRevision: 0 }),
    }));
    return { status: response.status, body: await response.json() };
  };
  const attempts = await Promise.all([post(left), post(right)]);
  const authoritativeResponse = await readProject(new Request(endpoint));
  const result = JSON.stringify({ attempts, authoritative: await authoritativeResponse.json() })
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;");
  return new Response(`<!doctype html><html><head><meta charset="utf-8"><title>Meant bootstrap concurrency proof</title></head><body><pre>${result}</pre></body></html>`, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
}
