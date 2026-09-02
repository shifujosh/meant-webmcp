import { and, eq } from "drizzle-orm";

import { getDb, getRawDb } from "@/db";
import { studioCommits, studioProjects } from "@/db/schema";
import type { ProvenanceEvent, StudioProject } from "@/lib/ghosa/contracts";
import { restoreProjectForUndo } from "@/lib/meant/composition-undo";
import { COMPACT_COMMIT_SNAPSHOTS_SQL, PROJECT_SNAPSHOT_CHARACTER_LIMIT } from "@/lib/server/persistence-policy";
import { authenticateRequest, readBoundedJson, reserveMutationRequestBudget, validPublicId, validWorkspaceId, workspaceScope } from "@/lib/server/request-security";

const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export async function POST(request: Request) {
  try {
    const identity = await authenticateRequest(request);
    if (!identity.ok) return identity.response;
    const parsed = await readBoundedJson<{ workspaceId?: string; projectId?: string; committedChangeId?: string; expectedRevision?: number; domain?: "composition" | "artifact"; rebase?: boolean }>(request, 32_000, "Undo request");
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    if (!validWorkspaceId(body.workspaceId) || !validPublicId(body.projectId) || !validPublicId(body.committedChangeId) || !Number.isInteger(body.expectedRevision) || body.expectedRevision! < 1 || !["composition", "artifact"].includes(body.domain ?? "") || body.rebase !== undefined && typeof body.rebase !== "boolean") {
      return Response.json({ error: "Undo requires an explicit committed change and expected revision" }, { status: 400 });
    }
    const expectedPrefix = body.domain === "composition" ? "composition-commit-" : "commit-";
    if (!body.committedChangeId!.startsWith(expectedPrefix)) {
      return Response.json({ error: "Committed change does not belong to this editor" }, { status: 404 });
    }
    const scope = await workspaceScope(request, body.workspaceId);
    if (!scope.ok) return scope.response;
    const admission = await reserveMutationRequestBudget(identity.principal.id);
    if (admission) return admission;
    const [projectRow] = await getDb().select().from(studioProjects).where(and(eq(studioProjects.workspaceId, scope.storageWorkspaceId), eq(studioProjects.projectId, body.projectId))).limit(1);
    const [commit] = await getDb().select().from(studioCommits).where(and(
      eq(studioCommits.id, body.committedChangeId),
      eq(studioCommits.workspaceId, scope.storageWorkspaceId),
      eq(studioCommits.projectId, body.projectId),
    )).limit(1);
    if (!projectRow || projectRow.revision !== body.expectedRevision) {
      return Response.json({ error: "Stale project revision", conflict: true, authoritativeRevision: projectRow?.revision ?? null }, { status: 409 });
    }
    if (!commit || commit.kind !== "apply") return Response.json({ error: "Committed change not found" }, { status: 404 });
    if (commit.revision !== projectRow.revision && !body.rebase) {
      return Response.json({ error: "Newer work exists; explicit rebase choice required", conflict: true, authoritativeRevision: projectRow.revision }, { status: 409 });
    }
    if (body.rebase && commit.revision !== projectRow.revision) {
      return Response.json({ error: "Automatic rebasing is intentionally unsupported; review newer work first" }, { status: 409 });
    }
    const before = JSON.parse(commit.beforePayload) as StudioProject;
    const current = JSON.parse(projectRow.payload) as StudioProject;
    const committedAt = new Date().toISOString();
    const revertId = id(body.domain === "composition" ? "composition-revert" : "revert");
    const newRevision = projectRow.revision + 1;
    const undoEvent: ProvenanceEvent = { id: id("event"), type: "change_undone", label: "Committed change reverted", detail: `${commit.summary} · revision ${newRevision}`, createdAt: committedAt };
    const restored = restoreProjectForUndo(before, current, committedAt);
    const next: StudioProject = { ...restored, provenance: [undoEvent, ...current.provenance].slice(0, 80) };
    const nextPayload = JSON.stringify(next);
    if (nextPayload.length > PROJECT_SNAPSHOT_CHARACTER_LIMIT) return Response.json({ error: "Project state exceeds the snapshot limit" }, { status: 413 });
    const raw = getRawDb();
    const results = await raw.batch([
      raw.prepare(`INSERT INTO studio_commits (id, workspace_id, project_id, parent_revision, revision, kind, reverted_change_id, operation_digest, summary, before_payload, after_payload, committed_at)
        SELECT ?, workspace_id, project_id, revision, revision + 1, 'revert', ?, ?, ?, payload, ?, ? FROM studio_projects
        WHERE workspace_id = ? AND project_id = ? AND revision = ?`).bind(revertId, commit.id, commit.operationDigest, `Revert: ${commit.summary}`, nextPayload, committedAt, scope.storageWorkspaceId, body.projectId, body.expectedRevision),
      raw.prepare("UPDATE studio_projects SET payload = ?, revision = revision + 1, updated_at = ? WHERE workspace_id = ? AND project_id = ? AND revision = ?")
        .bind(nextPayload, committedAt, scope.storageWorkspaceId, body.projectId, body.expectedRevision),
      raw.prepare(COMPACT_COMMIT_SNAPSHOTS_SQL).bind(
        scope.storageWorkspaceId,
        revertId,
        scope.storageWorkspaceId,
        scope.storageWorkspaceId,
      ),
    ]);
    if (results.slice(0, 2).some((result) => result.meta.changes !== 1)) {
      const authoritative = await getDb().select({ revision: studioProjects.revision }).from(studioProjects).where(eq(studioProjects.workspaceId, scope.storageWorkspaceId)).limit(1);
      return Response.json({ error: "Concurrent undo conflict", conflict: true, authoritativeRevision: authoritative[0]?.revision ?? null }, { status: 409 });
    }
    return Response.json({
      ok: true,
      project: next,
      committedChangeId: revertId,
      revertedChangeId: commit.id,
      newRevision,
      committedChange: {
        id: revertId,
        projectId: body.projectId,
        workspaceId: body.workspaceId,
        parentRevision: projectRow.revision,
        revision: newRevision,
        kind: "revert",
        revertedChangeId: commit.id,
        operationDigest: commit.operationDigest,
        summary: `Revert: ${commit.summary}`,
        committedAt,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Undo persistence failed" }, { status: 500 });
  }
}
