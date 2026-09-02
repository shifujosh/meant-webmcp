import { and, eq } from "drizzle-orm";

import { getDb, getRawDb } from "@/db";
import { studioProjects } from "@/db/schema";
import type { ProvenanceEvent, StudioProject } from "@/lib/ghosa/contracts";
import {
  compositionOperationDigest,
  createCompositionDraft,
  createSeedComposition,
  keepCompositionDraft,
  rebindCompositionOperations,
} from "@/lib/meant/composition-core";
import {
  PROJECT_REQUEST_BYTE_LIMIT,
  PROJECT_SNAPSHOT_CHARACTER_LIMIT,
  COMPACT_COMMIT_SNAPSHOTS_SQL,
} from "@/lib/server/persistence-policy";
import { authenticateRequest, readBoundedJson, reserveMutationRequestBudget, validPublicId, validWorkspaceId, workspaceScope } from "@/lib/server/request-security";

const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

export async function POST(request: Request) {
  try {
    const identity = await authenticateRequest(request);
    if (!identity.ok) return identity.response;
    const parsed = await readBoundedJson<{
      workspaceId?: string;
      projectId?: string;
      expectedRevision?: number;
      draftId?: string;
      sourceTurnId?: string;
      summary?: string;
      operations?: unknown[];
    }>(request, PROJECT_REQUEST_BYTE_LIMIT, "Composition request");
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    if (!validWorkspaceId(body.workspaceId) || !validPublicId(body.projectId) || !Number.isInteger(body.expectedRevision) ||
        !validPublicId(body.draftId) || !validPublicId(body.sourceTurnId) || !body.summary?.trim() || body.summary.length > 240 || !Array.isArray(body.operations) ||
        body.operations.length < 1 || body.operations.length > 32) {
      return Response.json({ error: "Keeping a composition requires one exact draft and expected revision" }, { status: 400 });
    }
    const scope = await workspaceScope(request, body.workspaceId);
    if (!scope.ok) return scope.response;
    const admission = await reserveMutationRequestBudget(identity.principal.id);
    if (admission) return admission;
    const [row] = await getDb().select().from(studioProjects).where(and(
      eq(studioProjects.workspaceId, scope.storageWorkspaceId),
      eq(studioProjects.projectId, body.projectId),
    )).limit(1);
    if (!row || row.revision !== body.expectedRevision) {
      return Response.json({ error: "Stale project revision", conflict: true, authoritativeRevision: row?.revision ?? null }, { status: 409 });
    }
    const current = JSON.parse(row.payload) as StudioProject;
    const authoritativeComposition = current.composition ?? createSeedComposition();
    let operations: ReturnType<typeof rebindCompositionOperations>;
    let document: ReturnType<typeof keepCompositionDraft>["document"];
    let receipt: ReturnType<typeof keepCompositionDraft>["receipt"];
    try {
      operations = rebindCompositionOperations(authoritativeComposition, body.operations);
      const draft = createCompositionDraft(authoritativeComposition, body.sourceTurnId, body.summary, operations);
      if (draft.id !== body.draftId) return Response.json({ error: "Draft identity does not match its operations" }, { status: 409 });
      ({ document, receipt } = keepCompositionDraft(authoritativeComposition, draft));
    } catch (error) {
      return Response.json({ error: error instanceof Error ? error.message : "Composition operations are invalid" }, { status: 400 });
    }
    const digest = await compositionOperationDigest(operations);
    const committedAt = new Date().toISOString();
    const committedChangeId = id("composition-commit");
    const newRevision = row.revision + 1;
    const event: ProvenanceEvent = {
      id: id("event"),
      type: "change_applied",
      label: "Composition kept",
      detail: `${body.summary.trim().slice(0, 240)} · revision ${newRevision}`,
      createdAt: committedAt,
    };
    const next: StudioProject = {
      ...current,
      composition: document,
      compositionReceipts: [receipt, ...(current.compositionReceipts ?? [])].slice(0, 60),
      provenance: [event, ...current.provenance].slice(0, 80),
    };
    const payload = JSON.stringify(next);
    if (payload.length > PROJECT_SNAPSHOT_CHARACTER_LIMIT) return Response.json({ error: "Project state exceeds the snapshot limit" }, { status: 413 });
    const raw = getRawDb();
    const results = await raw.batch([
      raw.prepare(`INSERT INTO studio_commits (id, workspace_id, project_id, parent_revision, revision, kind, reverted_change_id, operation_digest, summary, before_payload, after_payload, committed_at)
        SELECT ?, workspace_id, project_id, revision, revision + 1, 'apply', NULL, ?, ?, payload, ?, ? FROM studio_projects
        WHERE workspace_id = ? AND project_id = ? AND revision = ?`)
        .bind(committedChangeId, digest, body.summary.trim().slice(0, 240), payload, committedAt, scope.storageWorkspaceId, body.projectId, body.expectedRevision),
      raw.prepare("UPDATE studio_projects SET payload = ?, revision = revision + 1, updated_at = ? WHERE workspace_id = ? AND project_id = ? AND revision = ?")
        .bind(payload, committedAt, scope.storageWorkspaceId, body.projectId, body.expectedRevision),
      raw.prepare(COMPACT_COMMIT_SNAPSHOTS_SQL).bind(
        scope.storageWorkspaceId,
        committedChangeId,
        scope.storageWorkspaceId,
        scope.storageWorkspaceId,
      ),
    ]);
    if (results.slice(0, 2).some((result) => result.meta.changes !== 1)) {
      const authoritative = await getDb().select({ revision: studioProjects.revision }).from(studioProjects).where(eq(studioProjects.workspaceId, scope.storageWorkspaceId)).limit(1);
      return Response.json({ error: "Concurrent composition conflict", conflict: true, authoritativeRevision: authoritative[0]?.revision ?? null }, { status: 409 });
    }
    return Response.json({
      ok: true,
      project: next,
      composition: document,
      receipt,
      operationDigest: digest,
      committedChangeId,
      newRevision,
      committedChange: {
        id: committedChangeId,
        projectId: body.projectId,
        workspaceId: body.workspaceId,
        parentRevision: row.revision,
        revision: newRevision,
        kind: "apply",
        operationDigest: digest,
        summary: body.summary.trim().slice(0, 240),
        committedAt,
      },
    });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Composition commit failed" }, { status: 500 });
  }
}
