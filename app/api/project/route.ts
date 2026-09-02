import { and, desc, eq, lt } from "drizzle-orm";

import { getDb } from "@/db";
import { studioCommits, studioProjects } from "@/db/schema";
import type { StudioProject } from "@/lib/ghosa/contracts";
import { createSeedComposition } from "@/lib/meant/composition-core";
import { PROJECT_REQUEST_BYTE_LIMIT, PROJECT_SNAPSHOT_CHARACTER_LIMIT } from "@/lib/server/persistence-policy";
import { readBoundedJson, reserveMutationRequestBudget, validWorkspaceId, workspaceScope } from "@/lib/server/request-security";
import { isStudioProject } from "@/lib/server/studio-project-validation";

const HISTORY_PAGE_SIZE = 40;

function workspaceIdFrom(request: Request) {
  const workspaceId = new URL(request.url).searchParams.get("workspaceId")?.trim();
  if (!validWorkspaceId(workspaceId)) return null;
  return workspaceId;
}

function historyBeforeRevisionFrom(request: Request) {
  const value = new URL(request.url).searchParams.get("historyBeforeRevision");
  if (value === null) return undefined;
  if (!/^\d{1,10}$/.test(value)) return null;
  const revision = Number(value);
  return Number.isSafeInteger(revision) && revision > 1 ? revision : null;
}

function routeError(error: unknown) {
  const message = error instanceof Error ? error.message : "Unexpected persistence error";
  if (message.includes("no such table")) {
    return "The Meant project store is being initialized. Please retry in a moment.";
  }
  return message;
}

export async function GET(request: Request) {
  try {
    const workspaceId = workspaceIdFrom(request);
    if (!workspaceId) {
      return Response.json({ error: "A valid workspaceId is required" }, { status: 400 });
    }
    const historyBeforeRevision = historyBeforeRevisionFrom(request);
    if (historyBeforeRevision === null) {
      return Response.json({ error: "historyBeforeRevision must be a positive revision cursor" }, { status: 400 });
    }
    const scope = await workspaceScope(request, workspaceId);
    if (!scope.ok) return scope.response;
    const rows = await getDb()
      .select()
      .from(studioProjects)
      .where(eq(studioProjects.workspaceId, scope.storageWorkspaceId))
      .limit(1);
    const row = rows[0];
    if (!row) return Response.json({ project: null, identity: null, history: [], historyHasMore: false });
    const historyRows = await getDb()
      .select({
        id: studioCommits.id,
        projectId: studioCommits.projectId,
        workspaceId: studioCommits.workspaceId,
        parentRevision: studioCommits.parentRevision,
        revision: studioCommits.revision,
        kind: studioCommits.kind,
        revertedChangeId: studioCommits.revertedChangeId,
        operationDigest: studioCommits.operationDigest,
        summary: studioCommits.summary,
        committedAt: studioCommits.committedAt,
      })
      .from(studioCommits)
      .where(historyBeforeRevision === undefined
        ? eq(studioCommits.workspaceId, scope.storageWorkspaceId)
        : and(eq(studioCommits.workspaceId, scope.storageWorkspaceId), lt(studioCommits.revision, historyBeforeRevision)))
      .orderBy(desc(studioCommits.revision))
      .limit(HISTORY_PAGE_SIZE + 1);
    const historyHasMore = historyRows.length > HISTORY_PAGE_SIZE;
    const history = historyRows.slice(0, HISTORY_PAGE_SIZE);
    const project = JSON.parse(row.payload) as StudioProject;
    project.composition ??= createSeedComposition();
    project.compositionReceipts ??= [];
    return Response.json({
      project,
      identity: { projectId: row.projectId, workspaceId, revision: row.revision },
      revision: row.revision,
      updatedAt: row.updatedAt,
      history: history.map((item) => ({ ...item, workspaceId })),
      historyHasMore,
      historyBeforeRevision: history.at(-1)?.revision ?? null,
    });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const workspaceId = workspaceIdFrom(request);
    if (!workspaceId) {
      return Response.json({ error: "A valid workspaceId is required" }, { status: 400 });
    }
    const scope = await workspaceScope(request, workspaceId);
    if (!scope.ok) return scope.response;
    const parsed = await readBoundedJson<{ project?: unknown; expectedRevision?: unknown }>(request, PROJECT_REQUEST_BYTE_LIMIT, "Project bootstrap");
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    if (!isStudioProject(body.project)) {
      return Response.json({ error: "A valid Meant workspace is required" }, { status: 400 });
    }
    const payload = JSON.stringify(body.project);
    if (payload.length > PROJECT_SNAPSHOT_CHARACTER_LIMIT) {
      return Response.json({ error: "Project state exceeds the snapshot limit" }, { status: 413 });
    }

    if (body.expectedRevision !== 0) {
      return Response.json({ error: "Project bootstrap requires expectedRevision 0" }, { status: 400 });
    }
    const admission = await reserveMutationRequestBudget(scope.principal.id);
    if (admission) return admission;
    const current = await getDb()
      .select({ revision: studioProjects.revision, projectId: studioProjects.projectId })
      .from(studioProjects)
      .where(eq(studioProjects.workspaceId, scope.storageWorkspaceId))
      .limit(1);
    if (current[0]) {
      return Response.json({
        error: "Project already exists",
        conflict: true,
        authoritativeRevision: current[0].revision,
        projectId: current[0].projectId,
        workspaceId,
      }, { status: 409 });
    }
    const revision = 1;
    const updatedAt = new Date().toISOString();

    await getDb()
      .insert(studioProjects)
      .values({
        workspaceId: scope.storageWorkspaceId,
        projectId: body.project.id,
        payload,
        revision,
        updatedAt,
      })
      .onConflictDoNothing({ target: studioProjects.workspaceId });

    const inserted = await getDb().select().from(studioProjects).where(eq(studioProjects.workspaceId, scope.storageWorkspaceId)).limit(1);
    if (inserted[0]?.projectId !== body.project.id || inserted[0]?.revision !== revision || inserted[0]?.payload !== payload) {
      return Response.json({
        error: "Project bootstrap conflict",
        conflict: true,
        authoritativeRevision: inserted[0]?.revision,
        projectId: inserted[0]?.projectId,
        workspaceId,
      }, { status: 409 });
    }
    return Response.json({ ok: true, projectId: body.project.id, workspaceId, revision, updatedAt });
  } catch (error) {
    return Response.json({ error: routeError(error) }, { status: 500 });
  }
}

export async function PUT() {
  return Response.json({
    error: "Whole-project last-writer-wins saves are disabled. Use the staged transaction protocol.",
  }, { status: 405, headers: { Allow: "GET, POST" } });
}
