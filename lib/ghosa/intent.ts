import type {
  CreativeArtifact,
  DesignOperation,
  ExpressionInterpretation,
  InstrumentId,
} from "./contracts";

const changeHints: Array<[RegExp, string]> = [
  [/warm|intimate|human|inviting/i, "Increase warmth and human presence"],
  [/muddy|separat|clear|legib/i, "Clarify separation and visual hierarchy"],
  [/confiden|important|focus|primary/i, "Strengthen the primary focal signal"],
  [/space|breath|cramp|dense/i, "Create more breathing room"],
  [/soft|gentle|harsh|sterile/i, "Preserve softness while refining structure"],
  [/quiet|loud|subtle|restrain/i, "Rebalance intensity without losing character"],
  [/bigger|larger|smaller|size|scale/i, "Adjust scale while preserving hierarchy"],
  [/blur|crisp|sharp/i, "Refine edge clarity and diffusion"],
  [/color|vivid|muted|saturat/i, "Refine color intensity without leaving the brand system"],
];

function clausesAfter(text: string, pattern: RegExp): string[] {
  const match = text.match(pattern);
  if (!match?.[1]) return [];
  return [match[1].trim().replace(/[.]+$/, "")].filter(Boolean);
}

export function interpretExpression(text: string): ExpressionInterpretation {
  const requestedChanges = changeHints
    .filter(([pattern]) => pattern.test(text))
    .map(([, label]) => label);

  const preserve = [
    ...clausesAfter(text, /(?:preserve|keep|retain)\s+(.+?)(?:,|\bbut\b|\bwhile\b|$)/i),
  ];
  const avoid = [
    ...clausesAfter(text, /(?:without|do not|don't|avoid)\s+(.+?)(?:,|\bbut\b|$)/i),
  ];

  const ambiguity = /\b(this|that|it|those|there)\b/i.test(text)
    ? ["Deictic language is grounded to the current selection and artifact state."]
    : [];

  return {
    desiredOutcome: text.trim(),
    requestedChanges:
      requestedChanges.length > 0
        ? [...new Set(requestedChanges)]
        : ["Translate the expressed perceptual goal into medium-specific operations"],
    preserve,
    avoid,
    assumptions: [],
    ambiguities: ambiguity,
    confidence: requestedChanges.length > 0 ? 0.82 : 0.64,
  };
}

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));

function withoutControl(
  values: Partial<CreativeArtifact["values"]> | undefined,
  control: InstrumentId,
) {
  if (!values || values[control] === undefined) return values;
  const next = { ...values };
  delete next[control];
  return Object.keys(next).length ? next : undefined;
}

function descendantsOf(artifact: CreativeArtifact, targetIds: string[]) {
  const descendants = new Set<string>();
  let frontier = [...targetIds];
  while (frontier.length) {
    const children = artifact.nodes
      .filter((node) => node.parentId && frontier.includes(node.parentId))
      .map((node) => node.id)
      .filter((id) => !descendants.has(id));
    children.forEach((id) => descendants.add(id));
    frontier = children;
  }
  return descendants;
}

export function setControlValueOnArtifact(
  artifact: CreativeArtifact,
  targetIds: string[],
  control: InstrumentId,
  value: number,
): CreativeArtifact {
  const nextValue = clamp(value);
  if (!targetIds.length) {
    const hasLocalOverrides = artifact.nodes.some((node) => node.values?.[control] !== undefined);
    if (artifact.values[control] === nextValue && !hasLocalOverrides) return artifact;
    return {
      ...artifact,
      values: { ...artifact.values, [control]: nextValue },
      nodes: artifact.nodes.map((node) => ({
        ...node,
        values: withoutControl(node.values, control),
      })),
    };
  }

  const validTargetIds = targetIds.filter((targetId) =>
    artifact.nodes.some((node) => node.id === targetId && node.capabilities.includes(control)),
  );
  if (!validTargetIds.length) return artifact;
  const descendants = descendantsOf(artifact, validTargetIds);
  let changed = false;
  const nodes = artifact.nodes.map((node) => {
    if (validTargetIds.includes(node.id)) {
      const currentValue = resolveNodeValues(artifact, node.id)[control];
      if (currentValue === nextValue && node.values?.[control] === nextValue) return node;
      changed = true;
      return { ...node, values: { ...(node.values ?? {}), [control]: nextValue } };
    }
    if (descendants.has(node.id) && node.values?.[control] !== undefined) {
      changed = true;
      return { ...node, values: withoutControl(node.values, control) };
    }
    return node;
  });
  return changed ? { ...artifact, nodes } : artifact;
}

export function resolveNodeValues(
  artifact: CreativeArtifact,
  nodeId?: string,
): CreativeArtifact["values"] {
  if (!nodeId) return artifact.values;
  const nodes = new Map(artifact.nodes.map((node) => [node.id, node]));
  const lineage = [];
  let node = nodes.get(nodeId);
  const visited = new Set<string>();
  let depth = 0;
  while (node) {
    if (visited.has(node.id)) throw new Error(`Artifact ancestry contains a cycle at ${node.id}`);
    visited.add(node.id);
    lineage.unshift(node);
    if (!node.parentId) break;
    depth += 1;
    if (depth > artifact.nodes.length) throw new Error("Artifact ancestry exceeds its node bound");
    const parent = nodes.get(node.parentId);
    if (!parent) throw new Error(`Artifact ancestry references missing parent ${node.parentId}`);
    node = parent;
  }
  return lineage.reduce(
    (resolved, layer) => ({ ...resolved, ...(layer.values ?? {}) }),
    { ...artifact.values },
  );
}

export function applyOperations(
  artifacts: CreativeArtifact[],
  operations: DesignOperation[],
): CreativeArtifact[] {
  return artifacts.map((artifact) => {
    const matching = operations.filter((operation) => operation.artifactId === artifact.id);
    if (matching.length === 0) return artifact;
    const revised = matching.reduce(
      (current, operation) => setControlValueOnArtifact(
        current,
        operation.targetIds,
        operation.control,
        operation.value,
      ),
      artifact,
    );
    return revised === artifact ? artifact : { ...revised, version: artifact.version + 1 };
  });
}

export function suggestedControlForLanguage(text: string): InstrumentId[] {
  const controls: InstrumentId[] = [];
  if (/warm|intimate|human|inviting/i.test(text)) controls.push("warmth");
  if (/muddy|separat|clear|legib|contrast|unreadable|hard.*read|difficult.*read|can(?:not|'t).*read|blend.*(?:background|into)/i.test(text)) controls.push("contrast");
  if (/spac(?:e|ing)|breath|cramp|dense|distance|gap|closer|farther/i.test(text)) controls.push("spacing");
  if (/focus|important|primary|confiden/i.test(text)) controls.push("focalStrength");
  if (/soft|harsh|sterile|gentle|blur|crisp|sharp/i.test(text)) controls.push("softness");
  if (/color|saturat|vivid|muted/i.test(text)) controls.push("saturation");
  if (/accent|brand color|flavor color/i.test(text)) controls.push("accentStrength");
  // Size language should change size only. Crop and emphasis remain separate
  // design decisions unless the person names them explicitly.
  if (/bigger|larger|smaller|font size|text size|type scale|increase.*size|decrease.*size|reduce.*size/i.test(text)) controls.push("typeScale");
  if (/crop|zoom|closer|wider/i.test(text)) controls.push("cropScale");
  if (/depth|elevat|shadow|layered|flat/i.test(text)) controls.push("surfaceDepth");
  if (/round|corner|radius|square/i.test(text)) controls.push("cornerRadius");
  return [...new Set(controls)];
}
