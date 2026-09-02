import type {
  ArtifactNode,
  CanonicalOperation,
  CanonicalOperationKind,
  CanonicalProperty,
  CanonicalValue,
  CreativeArtifact,
  DesignOperation,
  InstrumentId,
  NodeAlignment,
  NodeDirection,
} from "./contracts";

export interface OperationDefinition {
  property: CanonicalProperty;
  kind: CanonicalOperationKind;
  values: "number" | "text" | readonly string[];
  min?: number;
  max?: number;
}

const NUMERIC_PROPERTIES: readonly InstrumentId[] = [
  "warmth", "contrast", "spacing", "focalStrength", "softness", "surfaceDepth",
  "cornerRadius", "typeScale", "accentStrength", "saturation", "cropScale",
];

export const operationRegistry: Readonly<Record<CanonicalProperty, OperationDefinition>> = Object.freeze({
  ...Object.fromEntries(NUMERIC_PROPERTIES.map((property) => [property, {
    property,
    kind: "set_numeric" as const,
    values: "number" as const,
    min: 0,
    max: 100,
  }])),
  content: { property: "content", kind: "set_text", values: "text" },
  fill: { property: "fill", kind: "set_color", values: "text" },
  alignment: { property: "alignment", kind: "set_enum", values: ["start", "center", "end"] as const },
  direction: { property: "direction", kind: "set_enum", values: ["row", "column"] as const },
}) as unknown as Record<CanonicalProperty, OperationDefinition>;

export function operationDefinitionFor(property: unknown): OperationDefinition | undefined {
  if (typeof property !== "string" || !Object.hasOwn(operationRegistry, property)) return undefined;
  return operationRegistry[property as CanonicalProperty];
}

const NAMED_COLORS: Record<string, string> = {
  black: "#000000",
  blue: "#2563EB",
  coral: "#F46666",
  cream: "#FFF1D6",
  green: "#16A34A",
  orange: "#F97316",
  pink: "#EC4899",
  purple: "#7C3AED",
  red: "#DC2626",
  white: "#FFFFFF",
  yellow: "#EAB308",
};

export function normalizeColor(value: string): string {
  const candidate = value.trim();
  const key = candidate.toLowerCase();
  const named = Object.hasOwn(NAMED_COLORS, key) ? NAMED_COLORS[key] : undefined;
  if (named) return named;
  if (/^#[0-9a-f]{3}$/i.test(candidate)) {
    return `#${candidate.slice(1).split("").map((part) => part + part).join("")}`.toUpperCase();
  }
  if (/^#[0-9a-f]{6}$/i.test(candidate)) return candidate.toUpperCase();
  throw new Error(`Unsupported color value: ${value}`);
}

export function executablePropertiesForNode(node: ArtifactNode): CanonicalProperty[] {
  const properties: CanonicalProperty[] = [...node.capabilities];
  if (node.kind === "text" || node.kind === "action") properties.push("content");
  if (["text", "action", "shape", "decoration"].includes(node.kind) ||
      (node.kind === "background" && node.id !== "photo-background") || node.id === "graphic-orbit") {
    properties.push("fill");
  }
  if (node.kind === "text") properties.push("alignment");
  if (["web-header", "web-navigation", "web-copy", "web-actions", "web-footer", "graphic-copy", "graphic-footer", "photo-caption"].includes(node.id)) {
    properties.push("direction", "alignment");
  }
  return [...new Set(properties)].filter((property) => Boolean(operationDefinitionFor(property)));
}

function normalizeValue(property: CanonicalProperty, value: unknown): CanonicalValue {
  const definition = operationDefinitionFor(property);
  if (!definition) throw new Error(`Unknown operation property: ${property}`);
  if (definition.kind === "set_numeric") {
    if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${property} requires a number`);
    if (value < (definition.min ?? 0) || value > (definition.max ?? 100)) throw new Error(`${property} is out of range`);
    // The canonical renderer stores perceptual controls as integer points.
    // Normalize before hashing so every admitted operation is exactly
    // reconstructable by postcondition verification.
    return Math.round(value);
  }
  if (definition.kind === "set_color") {
    if (typeof value !== "string") throw new Error("fill requires a color string");
    return normalizeColor(value);
  }
  if (definition.kind === "set_text") {
    if (typeof value !== "string" || value.length > 4000) throw new Error("content requires bounded text");
    return value;
  }
  if (typeof value !== "string" || !(definition.values as readonly string[]).includes(value)) {
    throw new Error(`${property} is not an allowed enum value`);
  }
  return value;
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function operationIdFor(operation: Omit<CanonicalOperation, "operationId"> | CanonicalOperation) {
  return `op-${fnv1a(canonicalOperationBytes(operation))}`;
}

export function canonicalOperationBytes(operation: Omit<CanonicalOperation, "operationId"> | CanonicalOperation): string {
  return JSON.stringify({
    projectId: operation.projectId,
    workspaceId: operation.workspaceId,
    baseRevision: operation.baseRevision,
    artifactId: operation.artifactId,
    artifactVersion: operation.artifactVersion,
    targetIds: [...operation.targetIds].sort(),
    kind: operation.kind,
    property: operation.property,
    value: operation.value,
  });
}

export function groundOperation(input: {
  projectId: string;
  workspaceId: string;
  baseRevision: number;
  artifact: CreativeArtifact;
  targetIds: string[];
  property: CanonicalProperty;
  value: unknown;
}): CanonicalOperation {
  const definition = operationDefinitionFor(input.property);
  if (!definition) throw new Error(`Unknown operation property: ${input.property}`);
  const targetIds = [...new Set(input.targetIds)].sort();
  const nodes = new Map(input.artifact.nodes.map((node) => [node.id, node]));
  if (targetIds.some((id) => !nodes.has(id))) throw new Error("Operation targets an unknown node");
  if (targetIds.some((id) => !executablePropertiesForNode(nodes.get(id)!).includes(input.property))) {
    throw new Error("Operation is not executable for its target");
  }
  if (!targetIds.length && !NUMERIC_PROPERTIES.includes(input.property as InstrumentId)) {
    throw new Error("Primitive operations require explicit target IDs");
  }
  const operationWithoutId = {
    projectId: input.projectId,
    workspaceId: input.workspaceId,
    baseRevision: input.baseRevision,
    artifactId: input.artifact.id,
    artifactVersion: input.artifact.version,
    targetIds,
    kind: definition.kind,
    property: input.property,
    value: normalizeValue(input.property, input.value),
  };
  return {
    operationId: operationIdFor(operationWithoutId),
    ...operationWithoutId,
  };
}

export type ExpressionSurface = "typed" | "voice" | "direct" | "canvas" | "webmcp";

/** Every surface deliberately terminates in this function; surface is audit metadata, never semantics. */
export function groundSurfaceOperation(
  _surface: ExpressionSurface,
  input: Parameters<typeof groundOperation>[0],
): CanonicalOperation {
  return groundOperation(input);
}

export function groundLegacyOperation(context: {
  projectId: string;
  workspaceId: string;
  baseRevision: number;
  artifacts: CreativeArtifact[];
}, operation: DesignOperation): CanonicalOperation {
  const artifact = context.artifacts.find((item) => item.id === operation.artifactId);
  if (!artifact) throw new Error("Operation targets an unknown artifact");
  return groundOperation({ ...context, artifact, targetIds: operation.targetIds, property: operation.control, value: operation.value });
}

export function canonicalOperationsBytes(operations: CanonicalOperation[]): string {
  return `[${operations
    .map((operation) => canonicalOperationBytes(operation))
    .join(",")}]`;
}

export async function operationDigest(operations: CanonicalOperation[]): Promise<string> {
  const bytes = new TextEncoder().encode(canonicalOperationsBytes(operations));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256-${Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

export function isCanonicalOperation(value: unknown): value is CanonicalOperation {
  if (!value || typeof value !== "object") return false;
  const operation = value as Partial<CanonicalOperation>;
  try {
    if (!operation.projectId || !operation.workspaceId || !operation.artifactId || !operation.operationId) return false;
    if (!Number.isInteger(operation.baseRevision) || !Number.isInteger(operation.artifactVersion)) return false;
    if (!Array.isArray(operation.targetIds) || !operation.property || !operation.kind) return false;
    const normalized = normalizeValue(operation.property, operation.value);
    const definition = operationDefinitionFor(operation.property);
    if (!definition) return false;
    return definition.kind === operation.kind && normalized === operation.value && operationIdFor(operation as CanonicalOperation) === operation.operationId;
  } catch {
    return false;
  }
}

export type DirectEnumValue = NodeAlignment | NodeDirection;
