import type {
  CreativeArtifact,
  DesignIntelligenceProfile,
  DesignOperation,
  DesignPlan,
  InstrumentId,
  RenderSnapshot,
} from "@/lib/ghosa/contracts";
import { validArtifactOntology } from "@/lib/ghosa/artifact-ontology";

const CONTROLS = [
  "warmth", "contrast", "spacing", "focalStrength", "softness", "surfaceDepth",
  "cornerRadius", "typeScale", "accentStrength", "saturation", "cropScale",
] as const;
const CONTROL_SET = new Set<string>(CONTROLS);
const ARTIFACT_KINDS = new Set(["web", "graphic", "photo"]);
const NODE_KINDS = new Set([
  "composition", "group", "text", "action", "image", "shape", "background", "effect", "decoration",
]);

export const MODEL_STRUCTURED_CONTEXT_CHARACTER_LIMIT = 256_000;
export const MODEL_IMAGE_DATA_URL_CHARACTER_LIMIT = 1_500_000;
export const MODEL_IMAGE_DATA_URL_TOTAL_CHARACTER_LIMIT = 3_000_000;

export function validModelImageDataUrl(value: unknown): value is string {
  return typeof value === "string" &&
    value.length <= MODEL_IMAGE_DATA_URL_CHARACTER_LIMIT &&
    /^data:image\/(?:png|jpeg|webp);base64,/i.test(value);
}

export function modelInputWithinBudget(structuredValue: unknown, images: string[]) {
  if (images.some((image) => !validModelImageDataUrl(image))) return false;
  if (images.reduce((total, image) => total + image.length, 0) > MODEL_IMAGE_DATA_URL_TOTAL_CHARACTER_LIMIT) return false;
  let serialized: string;
  try {
    serialized = JSON.stringify(structuredValue);
  } catch {
    return false;
  }
  return serialized.length <= MODEL_STRUCTURED_CONTEXT_CHARACTER_LIMIT;
}

export function scopedIntentAnchorHasTargets(scope: unknown, targetIds: unknown) {
  if (!Array.isArray(targetIds)) return false;
  return !["element", "region"].includes(String(scope)) || targetIds.length > 0;
}

export function modelOperationTargetsAreValid(
  artifact: CreativeArtifact,
  targetIds: string[],
  control: InstrumentId,
) {
  return targetIds.every((targetId) => artifact.nodes.some((node) =>
    node.id === targetId && node.capabilities.includes(control)
  ));
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function text(value: unknown, maximum = 6_000, allowEmpty = false): value is string {
  return typeof value === "string" && value.length <= maximum && (allowEmpty || value.trim().length > 0);
}

function number(value: unknown, minimum = -1_000_000, maximum = 1_000_000): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= minimum && value <= maximum;
}

function strings(value: unknown, maximumItems: number, maximumLength = 1_000): value is string[] {
  return Array.isArray(value) && value.length <= maximumItems && value.every((item) => text(item, maximumLength, true));
}

function optionalStrings(value: unknown, maximumItems: number, maximumLength = 1_000) {
  return value === undefined || strings(value, maximumItems, maximumLength);
}

function validArtifactValues(value: unknown, requireEveryControl: boolean) {
  if (!record(value)) return false;
  if (Object.keys(value).some((key) => !CONTROL_SET.has(key))) return false;
  if (requireEveryControl && CONTROLS.some((control) => !(control in value))) return false;
  return Object.values(value).every((candidate) => number(candidate, 0, 100));
}

function validNode(value: unknown) {
  if (!record(value)) return false;
  if (!text(value.id, 160) || !text(value.name, 240) || !text(value.purpose, 1_000) || !text(value.role, 240)) return false;
  if (!text(value.kind, 40) || !NODE_KINDS.has(value.kind)) return false;
  if (value.parentId !== undefined && !text(value.parentId, 160)) return false;
  if (!Array.isArray(value.capabilities) || value.capabilities.length > CONTROLS.length ||
      value.capabilities.some((control) => typeof control !== "string" || !CONTROL_SET.has(control))) return false;
  if (value.visible !== undefined && typeof value.visible !== "boolean") return false;
  if (value.locked !== undefined && typeof value.locked !== "boolean") return false;
  if (value.values !== undefined && !validArtifactValues(value.values, false)) return false;
  if (value.primitives !== undefined) {
    if (!record(value.primitives)) return false;
    const primitives = value.primitives;
    if (primitives.content !== undefined && !text(primitives.content, 20_000, true)) return false;
    if (primitives.fill !== undefined && (typeof primitives.fill !== "string" || !/^(?:#[0-9a-fA-F]{6}|transparent)$/.test(primitives.fill))) return false;
    if (primitives.alignment !== undefined && !["start", "center", "end"].includes(String(primitives.alignment))) return false;
    if (primitives.direction !== undefined && !["row", "column"].includes(String(primitives.direction))) return false;
    if (primitives.legibilityEdge !== undefined && !["dark", "light"].includes(String(primitives.legibilityEdge))) return false;
  }
  return true;
}

export function validCreativeArtifact(value: unknown): value is CreativeArtifact {
  if (!record(value)) return false;
  if (!text(value.id, 160) || !text(value.name, 240) || !text(value.format, 160)) return false;
  if (!text(value.kind, 20) || !ARTIFACT_KINDS.has(value.kind)) return false;
  if (!Number.isInteger(value.version) || !number(value.version, 0, 1_000_000)) return false;
  if (!validArtifactValues(value.values, true)) return false;
  if (!Array.isArray(value.nodes) || value.nodes.length < 1 || value.nodes.length > 200 || !value.nodes.every(validNode)) return false;
  const nodeIds = value.nodes.map((node) => (node as { id: string }).id);
  return new Set(nodeIds).size === nodeIds.length && validArtifactOntology(value as unknown as CreativeArtifact);
}

export function validDesignOperation(value: unknown): value is DesignOperation {
  if (!record(value) || !text(value.artifactId, 160)) return false;
  if (!strings(value.targetIds, 16, 160)) return false;
  if (typeof value.control !== "string" || !CONTROL_SET.has(value.control)) return false;
  return number(value.value, 0, 100);
}

function validRenderedNode(value: unknown) {
  if (!record(value) || !text(value.id, 160) || !text(value.label, 240)) return false;
  if (value.kind !== undefined && !text(value.kind, 80)) return false;
  if (value.text !== undefined && !text(value.text, 2_000, true)) return false;
  if (!record(value.rect) || ![value.rect.x, value.rect.y, value.rect.width, value.rect.height].every((item) => number(item))) return false;
  if (!record(value.style)) return false;
  const style = value.style;
  return ["fontSize", "lineHeight", "color", "backgroundColor", "opacity", "transform", "filter", "borderRadius"]
    .every((property) => text(style[property], 500, true));
}

export function validRenderSnapshot(value: unknown): value is RenderSnapshot {
  if (!record(value) || !text(value.artifactId, 160) || !record(value.viewport)) return false;
  if (!number(value.viewport.width, 1, 20_000) || !number(value.viewport.height, 1, 20_000)) return false;
  return Array.isArray(value.nodes) && value.nodes.length <= 100 && value.nodes.every(validRenderedNode);
}

function validProfileSection(value: unknown, requiredArrays: string[]) {
  if (!record(value)) return false;
  return requiredArrays.every((key) => strings(value[key], 64, 1_000));
}

export function validDesignIntelligenceProfile(value: unknown): value is DesignIntelligenceProfile {
  if (!record(value) || !text(value.version, 80)) return false;
  if (!record(value.brandGrammar) || !text(value.brandGrammar.characterHypothesis, 2_000) ||
      !validProfileSection(value.brandGrammar, ["primitives", "invariants", "ranges", "forbidden", "signatureBehaviors"])) return false;
  if (!validProfileSection(value.tasteProfile, ["preferences", "protectedQualities", "rejectedPatterns"])) return false;
  if (!record(value.semanticOntology) ||
      !validProfileSection(value.semanticOntology, ["principles", "requiredNodeFields", "selectionRules"]) ||
      !Array.isArray(value.semanticOntology.primitiveFamilies) || value.semanticOntology.primitiveFamilies.length > 32 ||
      !value.semanticOntology.primitiveFamilies.every((family) => record(family) && text(family.kind, 40) && NODE_KINDS.has(family.kind) && strings(family.firstClassControls, 24, 120))) return false;
  if (!Array.isArray(value.craftSkillLibrary) || value.craftSkillLibrary.length > 32 ||
      !value.craftSkillLibrary.every((skill) => record(skill) && text(skill.id, 160) && text(skill.label, 240) && text(skill.useWhen, 2_000) && strings(skill.checks, 32, 1_000))) return false;
  if (!Array.isArray(value.contextProfiles) || value.contextProfiles.length > 12 ||
      !value.contextProfiles.every((profile) => record(profile) && text(profile.artifactKind, 20) && ARTIFACT_KINDS.has(profile.artifactKind) && text(profile.objective, 2_000) && strings(profile.prioritize, 32) && strings(profile.commonFailures, 32))) return false;
  if (!record(value.motionVocabulary) || !Array.isArray(value.motionVocabulary.tokens) || value.motionVocabulary.tokens.length > 12 ||
      !value.motionVocabulary.tokens.every((token) => record(token) && ["snap", "ui", "gentle", "lively", "ambient"].includes(String(token.id)) && text(token.purpose, 1_000) && text(token.timing, 1_000)) ||
      !Array.isArray(value.motionVocabulary.stagger) || value.motionVocabulary.stagger.some((item) => !["tight", "base", "relaxed"].includes(String(item))) ||
      value.motionVocabulary.reducedMotion !== "calm") return false;
  if (!record(value.representationPolicy) || !Array.isArray(value.representationPolicy.preferenceOrder) ||
      value.representationPolicy.preferenceOrder.some((item) => !["structured", "programmable", "generative"].includes(String(item))) ||
      !strings(value.representationPolicy.rules, 64)) return false;
  return strings(value.acceptanceBar, 64) && strings(value.craftRules, 64);
}

function validVerificationLedger(value: unknown) {
  if (!record(value) || !["planned", "partial", "verified", "blocked"].includes(String(value.status))) return false;
  if (!Array.isArray(value.checks) || value.checks.length > 24 || !value.checks.every((check) =>
    record(check) && text(check.id, 160) && text(check.label, 500) &&
    ["deterministic", "visual", "temporal"].includes(String(check.kind)) &&
    ["planned", "passed", "failed", "unverified"].includes(String(check.status)) && text(check.detail, 2_000)
  )) return false;
  return strings(value.unverifiedConditions, 32) && text(value.updatedAt, 160);
}

export function validDesignPlan(value: unknown): value is DesignPlan {
  if (!record(value) || !["persuade", "operate", "read", "experience"].includes(String(value.surfaceMode))) return false;
  if (![value.diagnosis, value.strategy, value.contextReasoning, value.characterMove, value.executorReason]
    .every((item) => text(item, 4_000))) return false;
  if (!Array.isArray(value.craftSkills) || value.craftSkills.length > 12 || !value.craftSkills.every((skill) =>
    record(skill) && text(skill.id, 160) && text(skill.label, 500) && text(skill.reason, 2_000)
  )) return false;
  if (!["structured", "programmable", "generative"].includes(String(value.executorLane))) return false;
  if (!strings(value.successCriteria, 32) || !strings(value.evidenceUsed, 16, 160)) return false;
  if (!record(value.motion) || typeof value.motion.required !== "boolean" ||
      !["snap", "ui", "gentle", "lively", "ambient", "none"].includes(String(value.motion.token)) ||
      !text(value.motion.purpose, 2_000) || !strings(value.motion.states, 24) ||
      !text(value.motion.timing, 1_000) || !text(value.motion.reducedMotion, 2_000)) return false;
  return validVerificationLedger(value.verification);
}

export function validIntentAnchor(value: unknown): value is {
  artifactId: string;
  artifactVersion: number;
  targetIds: string[];
  targetNames: string[];
} {
  return record(value) && text(value.artifactId, 160) && Number.isInteger(value.artifactVersion) &&
    number(value.artifactVersion, 0, 1_000_000) && strings(value.targetIds, 16, 160) && strings(value.targetNames, 16, 240);
}

export function validVerifyAnchor(value: unknown): value is {
  artifactId: string;
  targetIds: string[];
  targetNames: string[];
} {
  return record(value) && text(value.artifactId, 160) && strings(value.targetIds, 16, 160) && strings(value.targetNames, 16, 240);
}

export function optionalStringList(value: unknown, maximumItems: number, maximumLength = 1_000) {
  return optionalStrings(value, maximumItems, maximumLength);
}
