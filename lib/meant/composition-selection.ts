import type { CompositionDocument } from "./composition-core";

export function reanchorCompositionSelection(
  document: CompositionDocument,
  preferredFrameId?: string,
  preferredNodeIds: string[] = [],
) {
  const frame = document.frames.find((candidate) => candidate.id === preferredFrameId) ?? document.frames[0];
  if (!frame) throw new Error("A composition requires at least one selectable frame");
  const validNodeIds = preferredNodeIds.filter((nodeId) => frame.nodes.some((node) => node.id === nodeId && !node.hidden));
  if (!validNodeIds.length) {
    const fallback = frame.nodes.find((node) => node.role === "title" && !node.hidden) ?? frame.nodes.find((node) => !node.hidden);
    if (fallback) validNodeIds.push(fallback.id);
  }
  return { frameId: frame.id, nodeIds: validNodeIds };
}
