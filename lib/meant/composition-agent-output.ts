import type { CommittedChange } from "@/lib/ghosa/contracts";
import type {
  CompositionDocument,
  CompositionDraft,
  CompositionNode,
} from "@/lib/meant/composition-core";

export const WEBMCP_TOOL_OUTPUT_CHARACTER_BUDGET = 1_500;

const clipped = (value: string | undefined, maximum: number) => {
  const compact = (value ?? "").replace(/\s+/g, " ").trim();
  return compact.length <= maximum ? compact : `${compact.slice(0, Math.max(0, maximum - 1))}…`;
};

const unique = (values: string[], maximum: number) => [...new Set(values)].slice(0, maximum);

function withinBudget<T, U>(preferred: T, fallback: () => U): T | U {
  if (serializedToolOutputLength(preferred) <= WEBMCP_TOOL_OUTPUT_CHARACTER_BUDGET) return preferred;
  const compact = fallback();
  if (serializedToolOutputLength(compact) > WEBMCP_TOOL_OUTPUT_CHARACTER_BUDGET) {
    throw new Error("Meant could not produce a bounded WebMCP receipt");
  }
  return compact;
}

export function compactDraftReceipt(draft: CompositionDraft) {
  const allAffectedFrameIds = unique(
    draft.operations.flatMap((operation) => operation.kind === "document.replace"
      ? operation.document.frames.map((frame) => frame.id)
      : operation.frameId === "document" ? [] : [operation.frameId]),
    60,
  );
  const allAffectedNodeIds = unique(
    draft.operations.flatMap((operation) => {
      if (operation.kind === "document.replace") return [];
      if (operation.kind === "node.add") return [operation.node.id];
      if (operation.kind === "node.update" || operation.kind === "node.remove") return [operation.targetId];
      return [];
    }),
    200,
  );
  const affectedFrameIds = allAffectedFrameIds.slice(0, 2);
  const affectedNodeIds = allAffectedNodeIds.slice(0, Math.max(0, 3 - affectedFrameIds.length));
  return {
    id: draft.id,
    summary: clipped(draft.summary, 96),
    baseVersion: draft.baseVersion,
    operationCount: draft.operations.length,
    operationKinds: unique(draft.operations.map((operation) => operation.kind), 6),
    affectedFrameIds,
    affectedNodeIds,
    affectedFrameCount: allAffectedFrameIds.length,
    affectedNodeCount: allAffectedNodeIds.length,
  };
}

export function compactPreviewResult(draft: CompositionDraft) {
  const preferred = {
    ok: true,
    committed: false,
    exploringDraft: compactDraftReceipt(draft),
    next: "The person can Compare, Keep, or Discard this Exploring draft in Meant.",
  };
  return withinBudget(preferred, () => ({
    ok: true,
    committed: false,
    exploringDraft: {
      id: draft.id,
      baseVersion: draft.baseVersion,
      operationCount: draft.operations.length,
      operationKinds: unique(draft.operations.map((operation) => operation.kind), 4),
    },
    next: "The person decides with Compare, Keep, or Discard in Meant.",
  }));
}

function compactNodeIndex(node: CompositionNode) {
  return { id: node.id, type: node.type };
}

function compactSelectedNode(node: CompositionNode) {
  return {
    ...compactNodeIndex(node),
    name: clipped(node.name, 36),
    role: clipped(node.role, 24),
    content: node.content === undefined ? undefined : clipped(node.content, 120),
    locked: Boolean(node.locked),
    style: {
      box: [node.style.x, node.style.y, node.style.width, node.style.height],
      font: [node.style.fontFamily, node.style.fontSize, node.style.fontWeight],
      ink: node.style.color,
      fill: node.style.backgroundColor,
      align: node.style.textAlign,
    },
  };
}

export function compactCompositionContext(input: {
  activeDocument: CompositionDocument;
  keptDocument: CompositionDocument;
  draft: CompositionDraft | null;
  selectedFrameId: string;
  selectedNodeIds: string[];
  revision: number;
  persistence: { hydrated: boolean; durable: boolean; state: string };
  recentHistory: CommittedChange[];
}) {
  const frame = input.activeDocument.frames.find((item) => item.id === input.selectedFrameId)
    ?? input.activeDocument.frames[0]!;
  const selectedNodes = frame.nodes.filter((node) => input.selectedNodeIds.includes(node.id)).slice(0, 1);
  const latest = input.recentHistory[0];
  const preferred = {
    revision: input.revision,
    persistence: input.persistence,
    composition: {
      id: input.activeDocument.id,
      title: clipped(input.activeDocument.title, 80),
      kind: input.activeDocument.kind,
      keptVersion: input.keptDocument.version,
      frameCount: input.activeDocument.frames.length,
      frames: input.activeDocument.frames.slice(0, 4).map((item) => ({ id: item.id, name: clipped(item.name, 28) })),
      moreFrames: Math.max(0, input.activeDocument.frames.length - 4),
    },
    selection: { frameId: frame.id, nodeIds: selectedNodes.map((node) => node.id) },
    activeFrame: {
      id: frame.id,
      name: clipped(frame.name, 64),
      purpose: clipped(frame.purpose, 60),
      layout: frame.layout,
      background: frame.background,
      nodeCount: frame.nodes.length,
      nodes: frame.nodes.slice(0, 5).map(compactNodeIndex),
      selectedNodes: selectedNodes.map(compactSelectedNode),
    },
    exploringDraft: input.draft ? compactDraftReceipt(input.draft) : null,
    latestRevision: latest ? {
      id: latest.id,
      revision: latest.revision,
      kind: latest.kind,
      revertedChangeId: latest.revertedChangeId,
    } : null,
    authority: "Agents inspect and preview; a person confirms Keep, Discard, and Undo.",
  };
  return withinBudget(preferred, () => {
    const bounded = {
      revision: input.revision,
      persistence: { durable: input.persistence.durable, state: clipped(input.persistence.state, 24) },
      composition: {
        title: clipped(input.activeDocument.title, 48),
        kind: input.activeDocument.kind,
        keptVersion: input.keptDocument.version,
        frameCount: input.activeDocument.frames.length,
      },
      selection: { frameId: frame.id, nodeIds: selectedNodes.map((node) => node.id) },
      activeFrame: {
        name: clipped(frame.name, 32),
        purpose: clipped(frame.purpose, 40),
        layout: frame.layout,
        background: frame.background,
        nodeCount: frame.nodes.length,
        selectedNodes: selectedNodes.map((node) => ({
          type: node.type,
          name: clipped(node.name, 24),
          role: clipped(node.role, 20),
          content: node.content === undefined ? undefined : clipped(node.content, 80),
          locked: Boolean(node.locked),
          style: {
            box: [node.style.x, node.style.y, node.style.width, node.style.height],
            font: [node.style.fontFamily, node.style.fontSize, node.style.fontWeight],
            ink: node.style.color,
          },
        })),
      },
      exploringDraft: input.draft ? compactDraftReceipt(input.draft) : null,
      latestRevision: latest ? { id: latest.id, revision: latest.revision, kind: latest.kind } : null,
      authority: "Agents preview. The person confirms Keep, Discard, and Undo.",
    };
    return withinBudget(bounded, () => ({
      revision: input.revision,
      persistence: { durable: input.persistence.durable, state: clipped(input.persistence.state, 24) },
      selection: { frameId: frame.id, nodeIds: selectedNodes.map((node) => node.id) },
      exploringDraft: input.draft ? {
        id: input.draft.id,
        baseVersion: input.draft.baseVersion,
        operationCount: input.draft.operations.length,
      } : null,
      latestRevision: latest ? { id: latest.id, revision: latest.revision, kind: latest.kind } : null,
      authority: "Agents preview. The person confirms Keep, Discard, and Undo.",
    }));
  });
}

export function serializedToolOutputLength(value: unknown) {
  return JSON.stringify(value).length;
}
