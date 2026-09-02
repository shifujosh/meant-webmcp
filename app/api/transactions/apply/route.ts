import { and, eq } from "drizzle-orm";

import { getDb, getRawDb } from "@/db";
import { studioChangeSets, studioProjects } from "@/db/schema";
import type { AppliedChange, CanonicalAppliedOperation, ChangeSet, ProvenanceEvent, StudioProject } from "@/lib/ghosa/contracts";
import { operationDigest, operationIdFor } from "@/lib/ghosa/operation-registry";
import { applyCanonicalOperations, valueForOperationTarget, verifyRequestedPostconditions } from "@/lib/ghosa/transaction-core";
import { requestedE2EFault } from "@/lib/ghosa/e2e-test-runtime";
import { COMPACT_COMMIT_SNAPSHOTS_SQL, PROJECT_SNAPSHOT_CHARACTER_LIMIT } from "@/lib/server/persistence-policy";
import { authenticateRequest, readBoundedJson, reserveMutationRequestBudget, validPublicId, validWorkspaceId, workspaceScope } from "@/lib/server/request-security";

const id = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;
const event = (type: ProvenanceEvent["type"], label: string, detail: string): ProvenanceEvent => ({ id: id("event"), type, label, detail, createdAt: new Date().toISOString() });

export async function POST(request: Request) {
  try {
    const identity = await authenticateRequest(request);
    if (!identity.ok) return identity.response;
    const parsed = await readBoundedJson<{ workspaceId?: string; projectId?: string; changeSetId?: string; expectedRevision?: number; operationDigest?: string }>(request, 64_000, "Apply request");
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    if (!validWorkspaceId(body.workspaceId) || !validPublicId(body.projectId) || !validPublicId(body.changeSetId) || !Number.isInteger(body.expectedRevision) || body.expectedRevision! < 1 || !/^sha256-[0-9a-f]{64}$/.test(body.operationDigest ?? "")) {
      return Response.json({ error: "Exact staged authority is required" }, { status: 400 });
    }
    const scope = await workspaceScope(request, body.workspaceId);
    if (!scope.ok) return scope.response;
    const admission = await reserveMutationRequestBudget(identity.principal.id);
    if (admission) return admission;
    const [projectRow] = await getDb().select().from(studioProjects).where(and(
      eq(studioProjects.workspaceId, scope.storageWorkspaceId), eq(studioProjects.projectId, body.projectId),
    )).limit(1);
    const [stageRow] = await getDb().select().from(studioChangeSets).where(and(
      eq(studioChangeSets.id, body.changeSetId), eq(studioChangeSets.workspaceId, scope.storageWorkspaceId), eq(studioChangeSets.projectId, body.projectId),
    )).limit(1);
    if (!projectRow || projectRow.revision !== body.expectedRevision) {
      return Response.json({ error: "Stale project revision", conflict: true, authoritativeRevision: projectRow?.revision ?? null }, { status: 409 });
    }
    if (!stageRow || stageRow.status !== "staged") return Response.json({ error: "Change set is not available" }, { status: 409 });
    const changeSet = JSON.parse(stageRow.payload) as ChangeSet;
    const digest = await operationDigest(changeSet.operations);
    if (digest !== body.operationDigest || digest !== stageRow.operationDigest ||
        changeSet.authority.operationDigest !== digest || changeSet.authority.baseRevision !== projectRow.revision ||
        changeSet.authority.projectId !== projectRow.projectId || changeSet.authority.workspaceId !== projectRow.workspaceId ||
        changeSet.operations.some((operation) => operation.projectId !== projectRow.projectId || operation.workspaceId !== projectRow.workspaceId || operation.baseRevision !== projectRow.revision ||
          operation.operationId !== operationIdFor(operation))) {
      return Response.json({ error: "Staged authority does not match the approved operations" }, { status: 409 });
    }
    const current = JSON.parse(projectRow.payload) as StudioProject;
    if (changeSet.operations.some((operation) => current.artifacts.find((artifact) => artifact.id === operation.artifactId)?.version !== operation.artifactVersion)) {
      return Response.json({ error: "Artifact version conflict", conflict: true, authoritativeRevision: projectRow.revision }, { status: 409 });
    }
    const source = changeSet.expressionPacketSnapshot && !current.expressionPackets.some((packet) => packet.id === changeSet.expressionPacketId)
      ? { ...current, expressionPackets: [changeSet.expressionPacketSnapshot, ...current.expressionPackets] }
      : current;
    const candidate = applyCanonicalOperations(source, changeSet.operations);
    const fault = requestedE2EFault(request, body.workspaceId);
    const verification = verifyRequestedPostconditions(current, fault === "postcondition" ? current : candidate, changeSet.operations);
    if (!verification.ok || verification.affectedTargetIds.length === 0) {
      return Response.json({ error: "Requested postcondition failed", failures: verification.failures }, { status: 422 });
    }
    const committedAt = new Date().toISOString();
    const committedChangeId = id("commit");
    const newRevision = projectRow.revision + 1;
    const appliedChange: AppliedChange = {
      id: committedChangeId,
      expressionPacketId: changeSet.expressionPacketId,
      summary: changeSet.summary,
      appliedAt: committedAt,
      operations: changeSet.operations.map((operation): CanonicalAppliedOperation => ({
        ...operation,
        id: operation.operationId,
        beforeValues: (operation.targetIds.length ? operation.targetIds : [operation.artifactId]).map((targetId) => ({
          targetId,
          value: valueForOperationTarget(source, operation, targetId === operation.artifactId ? "" : targetId) ?? operation.value,
        })),
        afterValues: (operation.targetIds.length ? operation.targetIds : [operation.artifactId]).map((targetId) => ({ targetId, value: operation.value })),
      })),
      designPlan: changeSet.designPlan,
    };
    const next: StudioProject = {
      ...candidate,
      activeChangeSet: undefined,
      latestAppliedChange: appliedChange,
      latestDesignPlan: changeSet.designPlan,
      latestDesignPlanExpressionPacketId: changeSet.expressionPacketId,
      expressionPackets: candidate.expressionPackets.map((packet) => packet.id === changeSet.expressionPacketId ? { ...packet, status: "applied" } : packet),
      provenance: [event("change_applied", "Change committed", `${changeSet.summary} · revision ${newRevision}`), ...candidate.provenance].slice(0, 80),
    };
    const nextPayload = JSON.stringify(next);
    if (nextPayload.length > PROJECT_SNAPSHOT_CHARACTER_LIMIT) return Response.json({ error: "Project state exceeds the snapshot limit" }, { status: 413 });
    const raw = getRawDb();
    if (fault === "persistence") throw new Error("Injected disposable E2E persistence failure");
    const results = await raw.batch([
      raw.prepare(`INSERT INTO studio_commits (id, workspace_id, project_id, parent_revision, revision, kind, reverted_change_id, operation_digest, summary, before_payload, after_payload, committed_at)
        SELECT ?, workspace_id, project_id, revision, revision + 1, 'apply', NULL, ?, ?, payload, ?, ? FROM studio_projects
        WHERE workspace_id = ? AND project_id = ? AND revision = ?
        AND EXISTS (SELECT 1 FROM studio_change_sets WHERE id = ? AND workspace_id = ? AND status = 'staged' AND operation_digest = ? AND base_revision = ?)`)
        .bind(committedChangeId, digest, changeSet.summary, nextPayload, committedAt, scope.storageWorkspaceId, body.projectId, body.expectedRevision, body.changeSetId, scope.storageWorkspaceId, digest, body.expectedRevision),
      raw.prepare("UPDATE studio_projects SET payload = ?, revision = revision + 1, updated_at = ? WHERE workspace_id = ? AND project_id = ? AND revision = ? AND EXISTS (SELECT 1 FROM studio_change_sets WHERE id = ? AND workspace_id = ? AND status = 'staged' AND operation_digest = ? AND base_revision = ?)")
        .bind(nextPayload, committedAt, scope.storageWorkspaceId, body.projectId, body.expectedRevision, body.changeSetId, scope.storageWorkspaceId, digest, body.expectedRevision),
      raw.prepare(`UPDATE studio_change_sets SET status = 'consumed', consumed_at = ?
        WHERE id = ? AND workspace_id = ? AND status = 'staged' AND operation_digest = ? AND base_revision = ?
        AND EXISTS (SELECT 1 FROM studio_commits WHERE id = ? AND workspace_id = ? AND project_id = ? AND parent_revision = ? AND revision = ?)`)
        .bind(
          committedAt,
          body.changeSetId,
          scope.storageWorkspaceId,
          digest,
          body.expectedRevision,
          committedChangeId,
          scope.storageWorkspaceId,
          body.projectId,
          body.expectedRevision,
          newRevision,
        ),
      raw.prepare(COMPACT_COMMIT_SNAPSHOTS_SQL).bind(
        scope.storageWorkspaceId,
        committedChangeId,
        scope.storageWorkspaceId,
        scope.storageWorkspaceId,
      ),
    ]);
    if (results.slice(0, 3).some((result) => result.meta.changes !== 1)) {
      const authoritative = await getDb().select({ revision: studioProjects.revision }).from(studioProjects).where(eq(studioProjects.workspaceId, scope.storageWorkspaceId)).limit(1);
      return Response.json({ error: "Concurrent edit conflict", conflict: true, authoritativeRevision: authoritative[0]?.revision ?? null }, { status: 409 });
    }
    return Response.json({ ok: true, project: next, committedChangeId, newRevision, verification });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Commit persistence failed" }, { status: 500 });
  }
}
