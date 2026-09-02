import type { CreativeArtifact } from "./contracts";
import { controlsByNodeKind } from "./control-effects";

export function assertValidArtifactOntology(artifact: CreativeArtifact) {
  const nodes = new Map<string, CreativeArtifact["nodes"][number]>();
  for (const node of artifact.nodes) {
    if (nodes.has(node.id)) throw new Error(`${artifact.id} contains duplicate semantic node ${node.id}`);
    nodes.set(node.id, node);
  }
  for (const node of artifact.nodes) {
    if (node.parentId && !nodes.has(node.parentId)) {
      throw new Error(`${node.id} references missing parent ${node.parentId}`);
    }
    const visited = new Set([node.id]);
    let parentId = node.parentId;
    let depth = 0;
    while (parentId) {
      if (visited.has(parentId)) throw new Error(`${artifact.id} contains a semantic cycle at ${node.id}`);
      visited.add(parentId);
      depth += 1;
      if (depth > artifact.nodes.length) throw new Error(`${artifact.id} exceeds its semantic ancestry bound`);
      parentId = nodes.get(parentId)?.parentId;
    }
    const supported = new Set(controlsByNodeKind[node.kind]);
    for (const control of node.capabilities) {
      if (!supported.has(control)) {
        throw new Error(`${node.id} exposes ${control}, which is not supported for ${node.kind} layers`);
      }
    }
  }
}

export function validArtifactOntology(artifact: CreativeArtifact) {
  try {
    assertValidArtifactOntology(artifact);
    return true;
  } catch {
    return false;
  }
}
