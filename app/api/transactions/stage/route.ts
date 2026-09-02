import { and, eq } from "drizzle-orm";

import { getDb, getRawDb } from "@/db";
import { studioProjects } from "@/db/schema";
import type { CanonicalOperation, CanonicalProperty, ChangeSet, DesignOperation, DesignPlan, ExpressionPacket, StudioProject } from "@/lib/ghosa/contracts";
import { groundLegacyOperation, groundOperation, operationDigest } from "@/lib/ghosa/operation-registry";
import {
  PROJECT_REQUEST_BYTE_LIMIT,
  PROJECT_SNAPSHOT_CHARACTER_LIMIT,
  PRUNE_STAGED_CHANGE_SETS_SQL,
} from "@/lib/server/persistence-policy";
import { authenticateRequest, readBoundedJson, reserveMutationRequestBudget, validWorkspaceId, workspaceScope } from "@/lib/server/request-security";

type OperationInput = DesignOperation | { artifactId: string; targetIds: string[]; property: CanonicalProperty; value: unknown };

function validId(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9-]{3,128}$/.test(value);
}

export async function POST(request: Request) {
  try {
    const identity = await authenticateRequest(request);
    if (!identity.ok) return identity.response;
    const parsed = await readBoundedJson<{
      workspaceId?: unknown;
      projectId?: unknown;
      expectedRevision?: unknown;
      changeSetId?: unknown;
      expressionPacketId?: unknown;
      summary?: unknown;
      rationale?: unknown;
      assumptions?: unknown;
      operations?: unknown;
      expressionPacket?: unknown;
      designPlan?: unknown;
    }>(request, PROJECT_REQUEST_BYTE_LIMIT, "Staged change request");
    if (!parsed.ok) return parsed.response;
    const body = parsed.value;
    if (!validWorkspaceId(body.workspaceId) || !validId(body.projectId) || !validId(body.changeSetId) ||
        !validId(body.expressionPacketId) || !Number.isInteger(body.expectedRevision) ||
        !Array.isArray(body.operations) || body.operations.length < 1 || body.operations.length > 24) {
      return Response.json({ error: "A complete revision-bound change set is required" }, { status: 400 });
    }
    const scope = await workspaceScope(request, body.workspaceId);
    if (!scope.ok) return scope.response;
    const admission = await reserveMutationRequestBudget(identity.principal.id);
    if (admission) return admission;
    const rows = await getDb().select().from(studioProjects).where(and(
      eq(studioProjects.workspaceId, scope.storageWorkspaceId),
      eq(studioProjects.projectId, body.projectId as string),
    )).limit(1);
    const row = rows[0];
    if (!row || row.revision !== body.expectedRevision) {
      return Response.json({ error: "Stale project revision", conflict: true, authoritativeRevision: row?.revision ?? null }, { status: 409 });
    }
    const project = JSON.parse(row.payload) as StudioProject;
    const context = { projectId: row.projectId, workspaceId: row.workspaceId, baseRevision: row.revision, artifacts: project.artifacts };
    const operations = (body.operations as OperationInput[]).map((input): CanonicalOperation => {
      if ("control" in input) return groundLegacyOperation(context, input);
      const artifact = project.artifacts.find((item) => item.id === input.artifactId);
      if (!artifact) throw new Error("Operation targets an unknown artifact");
      return groundOperation({ ...context, artifact, targetIds: input.targetIds, property: input.property, value: input.value });
    });
    const packet = body.expressionPacket && typeof body.expressionPacket === "object" ? body.expressionPacket as ExpressionPacket : undefined;
    if (packet && packet.id !== body.expressionPacketId) throw new Error("Expression identity mismatch");
    if (packet && operations.some((operation) =>
      (packet.scope !== "project" && operation.artifactId !== packet.anchor.artifactId) ||
      ((packet.scope === "element" || packet.scope === "region") &&
        (operation.targetIds.length === 0 || operation.targetIds.some((targetId) => !packet.anchor.targetIds.includes(targetId))))
    )) throw new Error("Operation exceeds the grounded expression scope");
    const digest = await operationDigest(operations);
    const artifactVersions = Object.fromEntries(
      project.artifacts.filter((artifact) => operations.some((operation) => operation.artifactId === artifact.id))
        .map((artifact) => [artifact.id, artifact.version]),
    );
    const changeSet: ChangeSet = {
      id: body.changeSetId as string,
      expressionPacketId: body.expressionPacketId as string,
      expressionPacketSnapshot: packet,
      summary: typeof body.summary === "string" ? body.summary.slice(0, 240) : "Exact design change",
      rationale: typeof body.rationale === "string" ? body.rationale.slice(0, 600) : "Grounded through the Meant operation registry.",
      assumptions: Array.isArray(body.assumptions) ? body.assumptions.map(String).slice(0, 8) : [],
      designPlan: body.designPlan && typeof body.designPlan === "object" ? body.designPlan as DesignPlan : undefined,
      operations,
      createdAt: new Date().toISOString(),
      authority: {
        status: "staged",
        changeSetId: body.changeSetId as string,
        artifactVersions,
        projectId: row.projectId,
        workspaceId: row.workspaceId,
        baseRevision: row.revision,
        operationDigest: digest,
        allowedAction: "apply_change_set",
        constraints: packet ? [...packet.interpretation.preserve, ...packet.interpretation.avoid] : [],
      },
    };
    const changeSetPayload = JSON.stringify(changeSet);
    if (changeSetPayload.length > PROJECT_SNAPSHOT_CHARACTER_LIMIT) return Response.json({ error: "Staged change exceeds the snapshot limit" }, { status: 413 });
    const raw = getRawDb();
    const results = await raw.batch([
      raw.prepare(`INSERT INTO studio_change_sets
        (id, workspace_id, project_id, base_revision, operation_digest, payload, status)
        VALUES (?, ?, ?, ?, ?, ?, 'staged')`)
        .bind(changeSet.id, row.workspaceId, row.projectId, row.revision, digest, changeSetPayload),
      raw.prepare(PRUNE_STAGED_CHANGE_SETS_SQL).bind(
        row.workspaceId,
        changeSet.id,
        row.workspaceId,
        row.workspaceId,
      ),
    ]);
    if (results[0]?.meta.changes !== 1) throw new Error("The staged change could not be persisted");
    return Response.json({ ok: true, changeSet, operationDigest: digest, revision: row.revision });
  } catch (error) {
    return Response.json({ error: error instanceof Error ? error.message : "Unable to stage change" }, { status: 400 });
  }
}
