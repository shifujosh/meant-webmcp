import type { StudioProject, UndoEntry } from "./contracts";

export function projectAfterUndo(project: StudioProject, previous: UndoEntry): StudioProject {
  const clearsAppliedRecord = Boolean(
    previous.appliedChangeId && project.latestAppliedChange?.id === previous.appliedChangeId,
  );
  const clearsLatestPlan = Boolean(
    previous.expressionPacketId && project.latestDesignPlanExpressionPacketId === previous.expressionPacketId,
  );
  const createdAt = new Date().toISOString();
  const id = `event-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;
  return {
    ...project,
    artifacts: previous.artifacts,
    activeChangeSet: undefined,
    latestAppliedChange: clearsAppliedRecord ? undefined : project.latestAppliedChange,
    latestDesignPlan: clearsLatestPlan ? undefined : project.latestDesignPlan,
    latestDesignPlanExpressionPacketId: clearsLatestPlan ? undefined : project.latestDesignPlanExpressionPacketId,
    latestVerification: clearsLatestPlan ? undefined : project.latestVerification,
    expressionPackets: project.expressionPackets.map((packet) =>
      packet.id === previous.expressionPacketId ? { ...packet, status: "undone" } : packet,
    ),
    provenance: [{
      id,
      type: "change_undone",
      label: "Last change undone",
      detail: "Restored prior artifact versions",
      createdAt,
    }, ...project.provenance],
  };
}
