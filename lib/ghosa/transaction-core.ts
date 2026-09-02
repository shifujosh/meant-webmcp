import type { CanonicalOperation, CreativeArtifact, StudioProject } from "./contracts";
import { resolveNodeValues, setControlValueOnArtifact } from "./intent";
import { executablePropertiesForNode, operationDefinitionFor } from "./operation-registry";

export interface PostconditionResult {
  ok: boolean;
  failures: string[];
  affectedTargetIds: string[];
}

function applyOne(artifact: CreativeArtifact, operation: CanonicalOperation): CreativeArtifact {
  if (operation.kind === "set_numeric") {
    return setControlValueOnArtifact(artifact, operation.targetIds, operation.property as keyof CreativeArtifact["values"], operation.value as number);
  }
  let changed = false;
  const nodes = artifact.nodes.map((node) => {
    if (!operation.targetIds.includes(node.id)) return node;
    if (!executablePropertiesForNode(node).includes(operation.property)) return node;
    if (node.primitives?.[operation.property as keyof typeof node.primitives] === operation.value) return node;
    changed = true;
    return { ...node, primitives: { ...(node.primitives ?? {}), [operation.property]: operation.value } };
  });
  return changed ? { ...artifact, nodes } : artifact;
}

export function applyCanonicalOperations(project: StudioProject, operations: CanonicalOperation[]): StudioProject {
  const changedArtifacts = new Set<string>();
  const artifacts = project.artifacts.map((artifact) => {
    const matching = operations.filter((operation) => operation.artifactId === artifact.id);
    const revised = matching.reduce(applyOne, artifact);
    if (revised !== artifact) changedArtifacts.add(artifact.id);
    return revised;
  }).map((artifact) => changedArtifacts.has(artifact.id) ? { ...artifact, version: artifact.version + 1 } : artifact);
  return { ...project, artifacts };
}

export function valueForOperationTarget(project: StudioProject, operation: CanonicalOperation, targetId: string) {
  const artifact = project.artifacts.find((item) => item.id === operation.artifactId);
  if (!artifact) return undefined;
  if (operation.kind === "set_numeric") {
    return resolveNodeValues(artifact, targetId || undefined)[operation.property as keyof CreativeArtifact["values"]];
  }
  return artifact.nodes.find((item) => item.id === targetId)?.primitives?.[operation.property as "content"];
}

export function verifyRequestedPostconditions(
  before: StudioProject,
  after: StudioProject,
  operations: CanonicalOperation[],
): PostconditionResult {
  const failures: string[] = [];
  const affectedTargetIds: string[] = [];
  for (const operation of operations) {
    const targets = operation.targetIds.length ? operation.targetIds : [""];
    for (const targetId of targets) {
      const actual = valueForOperationTarget(after, operation, targetId);
      if (actual !== operation.value) failures.push(`${operation.operationId}: expected exact ${operation.property}`);
      const previous = valueForOperationTarget(before, operation, targetId);
      if (previous !== actual) affectedTargetIds.push(targetId || operation.artifactId);
    }
    const definition = operationDefinitionFor(operation.property);
    if (!definition || definition.kind !== operation.kind) failures.push(`${operation.operationId}: registry mismatch`);
  }
  return { ok: failures.length === 0, failures, affectedTargetIds: [...new Set(affectedTargetIds)] };
}
