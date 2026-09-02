import type {
  CreativeArtifact,
  DesignIntelligenceProfile,
  DesignPlan,
  DesignOperation,
  EvidenceItem,
  ExpressionInterpretation,
  InstrumentId,
  InterpretationGraph,
  IntentScope,
  RenderSnapshot,
} from "@/lib/ghosa/contracts";
import { capabilityManifests } from "@/lib/ghosa/seed";
import {
  buildInterpretationGraph,
  conceptEmbeddingDocuments,
  graphPromptSlice,
  interpretationNeedsSemanticRecall,
  mergeInterpretationGraphs,
  normalizeDesignOperations,
  operationEvidenceForGraph,
  protectedControlsForGraph,
} from "@/lib/ghosa/design-graph";
import { resolveNodeValues } from "@/lib/ghosa/intent";
import { selectDesignReasoningEffort } from "@/lib/ghosa/reasoning";
import {
  validCreativeArtifact,
  validDesignIntelligenceProfile,
  validIntentAnchor,
  validModelImageDataUrl,
  validRenderSnapshot,
  modelInputWithinBudget,
  modelOperationTargetsAreValid,
  scopedIntentAnchorHasTargets,
} from "@/lib/server/model-request-validation";
import {
  authenticateModelRequest,
  readBoundedJson,
  reserveModelRequestBudget,
} from "@/lib/server/request-security";

const CONTROLS: InstrumentId[] = [
  "warmth",
  "contrast",
  "spacing",
  "focalStrength",
  "softness",
  "surfaceDepth",
  "cornerRadius",
  "typeScale",
  "accentStrength",
  "saturation",
  "cropScale",
];

const graphDocuments = conceptEmbeddingDocuments();
let graphEmbeddingCache: { model: string; vectors: Record<string, number[]> } | undefined;
const SEMANTIC_RECALL_BUDGET_MS = 450;

function semanticEmbeddingModel() {
  const configured = process.env.OPENAI_EMBEDDING_MODEL?.trim();
  if (!configured) return "text-embedding-3-small";
  return /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,127}$/.test(configured) ? configured : null;
}

function serverTimingHeader(timings: Array<[string, number]>) {
  return timings
    .map(([name, duration]) => `${name};dur=${Math.max(0, duration).toFixed(1)}`)
    .join(", ");
}

function cosineSimilarity(left: number[], right: number[]) {
  if (!left.length || left.length !== right.length) return 0;
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;
  for (let index = 0; index < left.length; index += 1) {
    dot += left[index]! * right[index]!;
    leftMagnitude += left[index]! ** 2;
    rightMagnitude += right[index]! ** 2;
  }
  if (!leftMagnitude || !rightMagnitude) return 0;
  return dot / Math.sqrt(leftMagnitude * rightMagnitude);
}

async function semanticConceptScores(apiKey: string, safetyIdentifier: string, model: string, transcript: string) {
  const cached = graphEmbeddingCache?.model === model ? graphEmbeddingCache : undefined;
  const input = cached ? [transcript] : [transcript, ...graphDocuments.map((document) => document.text)];
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEMANTIC_RECALL_BUDGET_MS);
  try {
    const response = await fetch("https://api.openai.com/v1/embeddings", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Safety-Identifier": safetyIdentifier,
        "content-type": "application/json",
      },
      body: JSON.stringify({ model, input, encoding_format: "float" }),
      signal: controller.signal,
    });
    if (!response.ok) return undefined;
    const payload = await response.json() as {
      data?: Array<{ index?: number; embedding?: unknown }>;
    };
    const vectors = (payload.data ?? [])
      .filter((item): item is { index: number; embedding: number[] } =>
        Number.isInteger(item.index) &&
        Array.isArray(item.embedding) &&
        item.embedding.length > 0 &&
        item.embedding.every((value) => typeof value === "number" && Number.isFinite(value)),
      )
      .sort((a, b) => a.index - b.index)
      .map((item) => item.embedding);
    const queryVector = vectors[0];
    if (!queryVector) return undefined;
    const conceptVectors = cached?.vectors ?? Object.fromEntries(
      graphDocuments.flatMap((document, index) => vectors[index + 1] ? [[document.id, vectors[index + 1]!]] : []),
    );
    if (!cached && Object.keys(conceptVectors).length === graphDocuments.length) {
      graphEmbeddingCache = { model, vectors: conceptVectors };
    }
    return Object.fromEntries(
      graphDocuments.map((document) => [document.id, cosineSimilarity(queryVector, conceptVectors[document.id] ?? [])]),
    );
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

interface IntentRequest {
  transcript: string;
  scope: IntentScope;
  anchor: {
    artifactId: string;
    artifactVersion: number;
    targetIds: string[];
    targetNames: string[];
  };
  conversation?: Array<{
    transcript: string;
    resolvedTranscript?: string;
    status: "captured" | "interpreted" | "needs_clarification" | "staged" | "approved" | "applied" | "undone" | "rejected";
    scope: IntentScope;
    anchor: IntentRequest["anchor"];
  }>;
  project: {
    name: string;
    brief: string;
    accentRule: string;
    designIntelligence?: DesignIntelligenceProfile;
    artifacts: CreativeArtifact[];
  };
  evidencePack?: {
    items: Array<EvidenceItem & { dataUrl?: string }>;
    authorityNote: string;
  };
  renderSnapshot?: RenderSnapshot;
}

interface IntentResult {
  interpretation: ExpressionInterpretation;
  proposal: {
    summary: string;
    rationale: string;
    assumptions: string[];
    designPlan: DesignPlan;
    operations: DesignOperation[];
  };
  clarification: {
    required: boolean;
    question: string;
    options: string[];
  };
}

const stringArray = (value: unknown, maxItems = 8) =>
  Array.isArray(value)
    ? value
        .filter((item): item is string => typeof item === "string")
        .map((item) => item.trim())
        .filter(Boolean)
        .slice(0, maxItems)
    : [];

const enumValue = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
  typeof value === "string" && allowed.includes(value as T) ? value as T : fallback;

const shortText = (value: unknown, fallback: string, max = 800) =>
  typeof value === "string" && value.trim() ? value.trim().slice(0, max) : fallback;

function responseText(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as {
    output_text?: unknown;
    output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }>;
  };
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") {
        return content.text;
      }
    }
  }
  return null;
}

function validRequest(value: unknown): value is IntentRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<IntentRequest>;
  const artifacts = body.project?.artifacts ?? [];
  const artifactsAreValid =
    Array.isArray(artifacts) &&
    artifacts.length > 0 &&
    artifacts.length <= 12 &&
    artifacts.every(validCreativeArtifact) &&
    new Set(artifacts.map((artifact) => artifact.id)).size === artifacts.length;
  const anchor = validIntentAnchor(body.anchor) ? body.anchor : undefined;
  const anchorArtifact = artifactsAreValid && anchor
    ? artifacts.find((artifact) => artifact.id === anchor.artifactId)
    : undefined;
  const anchorTargetsAreValid = !!anchorArtifact && !!anchor &&
    scopedIntentAnchorHasTargets(body.scope, anchor.targetIds) &&
    anchor.targetIds.every((targetId) => anchorArtifact.nodes.some((node) => node.id === targetId));
  const evidenceItems = body.evidencePack?.items ?? [];
  const evidenceIsValid =
    (!body.evidencePack || (
      typeof body.evidencePack.authorityNote === "string" && body.evidencePack.authorityNote.length <= 2_000
    )) &&
    Array.isArray(evidenceItems) &&
    evidenceItems.length <= 4 &&
    evidenceItems.every((item) =>
      !!item &&
      typeof item.id === "string" && item.id.length > 0 && item.id.length <= 160 &&
      ["reference_image", "geometry_sketch", "screenshot", "timing_reference", "written_note"].includes(String(item.kind)) &&
      typeof item.label === "string" && item.label.length <= 500 &&
      typeof item.governs === "string" && item.governs.length <= 1_000 &&
      ["user_provided", "project_memory"].includes(String(item.provenance)) &&
      (!item.mimeType || (typeof item.mimeType === "string" && item.mimeType.length <= 160)) &&
      (!item.dataUrl || validModelImageDataUrl(item.dataUrl)),
    );
  const snapshot = body.renderSnapshot;
  const conversation = body.conversation ?? [];
  const conversationIsValid =
    Array.isArray(conversation) &&
    conversation.length <= 4 &&
    conversation.every((turn) =>
      !!turn &&
      typeof turn.transcript === "string" &&
      turn.transcript.length <= 6_000 &&
      (!turn.resolvedTranscript || (typeof turn.resolvedTranscript === "string" && turn.resolvedTranscript.length <= 6_000)) &&
      ["captured", "interpreted", "needs_clarification", "staged", "approved", "applied", "undone", "rejected"].includes(turn.status) &&
      ["element", "region", "artifact", "project"].includes(turn.scope) &&
      validIntentAnchor(turn.anchor)
    );
  const snapshotIsValid = !snapshot || validRenderSnapshot(snapshot);
  return (
    typeof body.transcript === "string" &&
    body.transcript.trim().length > 0 &&
    body.transcript.length <= 6_000 &&
    ["element", "region", "artifact", "project"].includes(String(body.scope)) &&
    !!anchor &&
    anchorTargetsAreValid &&
    !!body.project &&
    typeof body.project.name === "string" && body.project.name.trim().length > 0 && body.project.name.length <= 500 &&
    typeof body.project.brief === "string" && body.project.brief.length <= 6_000 &&
    typeof body.project.accentRule === "string" && body.project.accentRule.length <= 2_000 &&
    artifactsAreValid &&
    (!body.project.designIntelligence || validDesignIntelligenceProfile(body.project.designIntelligence)) &&
    conversationIsValid &&
    evidenceIsValid &&
    snapshotIsValid
  );
}

function minimumVisibleDelta(control: InstrumentId) {
  if (["typeScale", "focalStrength", "spacing", "cropScale"].includes(control)) return 8;
  return 6;
}

function makeClarificationHuman(result: IntentResult) {
  if (!result.clarification.required) return;
  const technical = /\b(?:capabilit|executor|control|node|artifact id|token|primitive|schema|numeric)\b/i;
  if (!technical.test(`${result.clarification.question} ${result.clarification.options.join(" ")}`)) return;
  result.clarification = {
    required: true,
    question: "What should Meant prioritize for this change?",
    options: [
      "Make the closest visible change now",
      "Keep the current design",
    ],
  };
}

function primitiveCapabilitiesForNode(node: CreativeArtifact["nodes"][number]) {
  const primitives: string[] = [];
  if (node.kind === "text" || node.kind === "action") primitives.push("content");
  if (["text", "action", "shape", "decoration"].includes(node.kind) ||
      (node.kind === "background" && node.id !== "photo-background") || node.id === "graphic-orbit") {
    primitives.push("fill");
  }
  if (node.kind === "text") primitives.push("alignment");
  if (["web-header", "web-navigation", "web-copy", "web-actions", "web-footer", "graphic-copy", "graphic-footer", "photo-caption"].includes(node.id)) {
    primitives.push("direction", "alignment");
  }
  return [...new Set(primitives)];
}

function sanitizeResult(raw: unknown, request: IntentRequest, interpretationGraph: InterpretationGraph): IntentResult | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const rawInterpretation = value.interpretation as Record<string, unknown> | undefined;
  const rawProposal = value.proposal as Record<string, unknown> | undefined;
  const rawClarification = value.clarification as Record<string, unknown> | undefined;
  if (!rawInterpretation || !rawProposal || !rawClarification) return null;
  const rawPlan = rawProposal.designPlan as Record<string, unknown> | undefined;
  if (!rawPlan) return null;

  const artifactMap = new Map(request.project.artifacts.map((artifact) => [artifact.id, artifact]));
  const anchorTargetIds = new Set(request.anchor.targetIds);
  const protectedControls = protectedControlsForGraph(interpretationGraph);
  const operations = normalizeDesignOperations((Array.isArray(rawProposal.operations) ? rawProposal.operations : [])
    .flatMap((candidate): DesignOperation[] => {
      if (!candidate || typeof candidate !== "object") return [];
      const operation = candidate as Record<string, unknown>;
      const artifactId = typeof operation.artifactId === "string" ? operation.artifactId : "";
      const artifact = artifactMap.get(artifactId);
      const control = typeof operation.control === "string" ? operation.control as InstrumentId : null;
      const numericValue = typeof operation.value === "number" ? operation.value : Number.NaN;
      const targetIds = stringArray(operation.targetIds, 16);
      if (!artifact || !control || !CONTROLS.includes(control) || !Number.isFinite(numericValue)) return [];
      if (protectedControls.has(control)) return [];
      if (!capabilityManifests[artifact.kind].instruments.some((item) => item.id === control)) return [];
      if (request.scope !== "project" && artifactId !== request.anchor.artifactId) return [];
      if (!modelOperationTargetsAreValid(artifact, targetIds, control)) return [];
      if (
        (request.scope === "element" || request.scope === "region") &&
        (targetIds.length === 0 || targetIds.some((id) => !anchorTargetIds.has(id)))
      ) return [];
      const baseline = targetIds[0]
        ? resolveNodeValues(artifact, targetIds[0])[control]
        : artifact.values[control];
      if (Math.round(numericValue) === Math.round(baseline)) return [];
      const direction = numericValue > baseline ? 1 : -1;
      const visibleValue = Math.abs(numericValue - baseline) < minimumVisibleDelta(control)
        ? baseline + direction * minimumVisibleDelta(control)
        : numericValue;
      return [{
        artifactId,
        targetIds,
        control,
        value: Math.max(0, Math.min(100, Math.round(visibleValue))),
      }];
    })
    .slice(0, 24));

  const desiredOutcome = typeof rawInterpretation.desiredOutcome === "string"
    ? rawInterpretation.desiredOutcome.trim()
    : request.transcript.trim();
  const requestedChanges = stringArray(rawInterpretation.requestedChanges, 8);
  const confidence = typeof rawInterpretation.confidence === "number"
    ? Math.max(0, Math.min(1, rawInterpretation.confidence))
    : 0.5;

  const rawCraftSkills = Array.isArray(rawPlan.craftSkills) ? rawPlan.craftSkills : [];
  const availableCraftSkills = new Map(
    (request.project.designIntelligence?.craftSkillLibrary ?? []).map((skill) => [skill.id, skill]),
  );
  const craftSkills = rawCraftSkills.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const skill = candidate as Record<string, unknown>;
    const id = shortText(skill.id, `craft-${index + 1}`, 80).replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase();
    const librarySkill = availableCraftSkills.get(id);
    if (availableCraftSkills.size && !librarySkill) return [];
    const label = librarySkill?.label ?? shortText(skill.label, "Relevant craft check", 100);
    return [{
      id,
      label,
      reason: shortText(skill.reason, `Needed to evaluate ${label.toLowerCase()}.`, 240),
    }];
  }).filter((skill, index, skills) => skills.findIndex((candidate) => candidate.id === skill.id) === index).slice(0, 4);
  const rawMotion = rawPlan.motion as Record<string, unknown> | undefined;
  const rawVerification = rawPlan.verification as Record<string, unknown> | undefined;
  const rawChecks = Array.isArray(rawVerification?.checks) ? rawVerification.checks : [];
  const checks = rawChecks.flatMap((candidate, index) => {
    if (!candidate || typeof candidate !== "object") return [];
    const check = candidate as Record<string, unknown>;
    const kind = enumValue(check.kind, ["deterministic", "visual", "temporal"] as const, "visual");
    return [{
      id: shortText(check.id, `check-${index + 1}`, 80).replace(/[^a-zA-Z0-9_-]/g, "-").toLowerCase(),
      label: shortText(check.label, "Inspect the rendered result", 120),
      kind,
      status: kind === "deterministic" ? "planned" as const : "unverified" as const,
      detail: shortText(check.detail, "This condition must be inspected after execution.", 240),
    }];
  }).slice(0, 8);
  const evidenceIds = new Set((request.evidencePack?.items ?? []).map((item) => item.id));
  const evidenceUsed = stringArray(rawPlan.evidenceUsed, 4).filter((id) => evidenceIds.has(id));

  const designPlan: DesignPlan = {
    surfaceMode: enumValue(rawPlan.surfaceMode, ["persuade", "operate", "read", "experience"] as const, "persuade"),
    diagnosis: shortText(rawPlan.diagnosis, "The selected artifact needs a clearer design response to the expressed outcome."),
    strategy: shortText(rawPlan.strategy, "Apply a measured, medium-specific revision while preserving the stated constraints."),
    contextReasoning: shortText(rawPlan.contextReasoning, "The strategy is grounded to the artifact, audience, and selected scope."),
    characterMove: shortText(rawPlan.characterMove, "Protect the existing Bobalicious character while making the requested quality more apparent."),
    craftSkills,
    executorLane: enumValue(rawPlan.executorLane, ["structured", "programmable", "generative"] as const, "structured"),
    executorReason: shortText(rawPlan.executorReason, "The available semantic layers and controls can preserve editability."),
    successCriteria: stringArray(rawPlan.successCriteria, 6),
    evidenceUsed,
    motion: {
      required: rawMotion?.required === true,
      token: enumValue(rawMotion?.token, ["snap", "ui", "gentle", "lively", "ambient", "none"] as const, "none"),
      purpose: shortText(rawMotion?.purpose, "No temporal behavior is required for this revision.", 240),
      states: stringArray(rawMotion?.states, 6),
      timing: shortText(rawMotion?.timing, "Static artifact", 160),
      reducedMotion: shortText(rawMotion?.reducedMotion, "Preserve the same state and hierarchy without motion.", 200),
    },
    verification: {
      status: "planned",
      checks,
      unverifiedConditions: stringArray(rawVerification?.unverifiedConditions, 6),
      updatedAt: new Date().toISOString(),
    },
  };

  return {
    interpretation: {
      desiredOutcome,
      requestedChanges: requestedChanges.length ? requestedChanges : ["Translate the expression into a reviewable design proposal"],
      preserve: stringArray(rawInterpretation.preserve),
      avoid: stringArray(rawInterpretation.avoid),
      assumptions: stringArray(rawInterpretation.assumptions),
      ambiguities: stringArray(rawInterpretation.ambiguities),
      confidence,
    },
    proposal: {
      summary: typeof rawProposal.summary === "string" ? rawProposal.summary.trim().slice(0, 240) : "Translate the latest expression",
      rationale: typeof rawProposal.rationale === "string" ? rawProposal.rationale.trim().slice(0, 800) : "Mapped the expressed outcome to available artifact capabilities.",
      assumptions: stringArray(rawProposal.assumptions),
      designPlan,
      operations,
    },
    clarification: {
      required: rawClarification.required === true,
      question: typeof rawClarification.question === "string" ? rawClarification.question.trim().slice(0, 240) : "",
      options: stringArray(rawClarification.options, 4),
    },
  };
}

const outputSchema = {
  type: "object",
  properties: {
    interpretation: {
      type: "object",
      properties: {
        desiredOutcome: { type: "string" },
        requestedChanges: { type: "array", items: { type: "string" }, maxItems: 8 },
        preserve: { type: "array", items: { type: "string" }, maxItems: 8 },
        avoid: { type: "array", items: { type: "string" }, maxItems: 8 },
        assumptions: { type: "array", items: { type: "string" }, maxItems: 8 },
        ambiguities: { type: "array", items: { type: "string" }, maxItems: 8 },
        confidence: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["desiredOutcome", "requestedChanges", "preserve", "avoid", "assumptions", "ambiguities", "confidence"],
      additionalProperties: false,
    },
    proposal: {
      type: "object",
      properties: {
        summary: { type: "string" },
        rationale: { type: "string" },
        assumptions: { type: "array", items: { type: "string" }, maxItems: 8 },
        designPlan: {
          type: "object",
          properties: {
            surfaceMode: { type: "string", enum: ["persuade", "operate", "read", "experience"] },
            diagnosis: { type: "string" },
            strategy: { type: "string" },
            contextReasoning: { type: "string" },
            characterMove: { type: "string" },
            craftSkills: {
              type: "array",
              maxItems: 6,
              items: {
                type: "object",
                properties: {
                  id: { type: "string" },
                  label: { type: "string" },
                  reason: { type: "string" },
                },
                required: ["id", "label", "reason"],
                additionalProperties: false,
              },
            },
            executorLane: { type: "string", enum: ["structured", "programmable", "generative"] },
            executorReason: { type: "string" },
            successCriteria: { type: "array", items: { type: "string" }, maxItems: 6 },
            evidenceUsed: { type: "array", items: { type: "string" }, maxItems: 4 },
            motion: {
              type: "object",
              properties: {
                required: { type: "boolean" },
                token: { type: "string", enum: ["snap", "ui", "gentle", "lively", "ambient", "none"] },
                purpose: { type: "string" },
                states: { type: "array", items: { type: "string" }, maxItems: 6 },
                timing: { type: "string" },
                reducedMotion: { type: "string" },
              },
              required: ["required", "token", "purpose", "states", "timing", "reducedMotion"],
              additionalProperties: false,
            },
            verification: {
              type: "object",
              properties: {
                checks: {
                  type: "array",
                  maxItems: 8,
                  items: {
                    type: "object",
                    properties: {
                      id: { type: "string" },
                      label: { type: "string" },
                      kind: { type: "string", enum: ["deterministic", "visual", "temporal"] },
                      detail: { type: "string" },
                    },
                    required: ["id", "label", "kind", "detail"],
                    additionalProperties: false,
                  },
                },
                unverifiedConditions: { type: "array", items: { type: "string" }, maxItems: 6 },
              },
              required: ["checks", "unverifiedConditions"],
              additionalProperties: false,
            },
          },
          required: [
            "surfaceMode",
            "diagnosis",
            "strategy",
            "contextReasoning",
            "characterMove",
            "craftSkills",
            "executorLane",
            "executorReason",
            "successCriteria",
            "evidenceUsed",
            "motion",
            "verification"
          ],
          additionalProperties: false,
        },
        operations: {
          type: "array",
          maxItems: 24,
          items: {
            type: "object",
            properties: {
              artifactId: { type: "string" },
              targetIds: { type: "array", items: { type: "string" }, maxItems: 16 },
              control: { type: "string", enum: CONTROLS },
              value: { type: "number", minimum: 0, maximum: 100 },
            },
            required: ["artifactId", "targetIds", "control", "value"],
            additionalProperties: false,
          },
        },
      },
      required: ["summary", "rationale", "assumptions", "designPlan", "operations"],
      additionalProperties: false,
    },
    clarification: {
      type: "object",
      properties: {
        required: { type: "boolean" },
        question: { type: "string" },
        options: { type: "array", items: { type: "string" }, maxItems: 4 },
      },
      required: ["required", "question", "options"],
      additionalProperties: false,
    },
  },
  required: ["interpretation", "proposal", "clarification"],
  additionalProperties: false,
};

export async function POST(request: Request) {
  const identity = await authenticateModelRequest(request);
  if (!identity.ok) return identity.response;
  const parsed = await readBoundedJson<unknown>(request, 3_500_000, "Intent request");
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  if (!validRequest(body)) {
    return Response.json({ error: "The intent request is incomplete." }, { status: 400 });
  }
  const inputImages = (body.evidencePack?.items ?? []).flatMap((item) => item.dataUrl ? [item.dataUrl] : []);
  const structuredInput = {
    ...body,
    evidencePack: body.evidencePack ? {
      ...body.evidencePack,
      items: body.evidencePack.items.map((item) => ({ ...item, dataUrl: undefined })),
    } : undefined,
  };
  if (!modelInputWithinBudget(structuredInput, inputImages)) {
    return Response.json({ error: "The intent context exceeds Meant's model-input budget." }, { status: 413 });
  }

  const apiKey = (process.env.OPENAI_API_KEY ?? process.env.demo_open_api_key)?.trim();
  if (!apiKey) {
    return Response.json(
      { error: "The OpenAI intent compiler is not configured for this deployment." },
      { status: 503 },
    );
  }

  const requestStarted = performance.now();
  const reasoningEffort = selectDesignReasoningEffort(body.transcript, body.scope);
  const requestMode = reasoningEffort === "high" ? "strategic" : "bounded";
  const anchorArtifact = body.project.artifacts.find((artifact) => artifact.id === body.anchor.artifactId)
    ?? body.project.artifacts[0]!;
  const contextArtifacts = body.scope === "project" ? body.project.artifacts : [anchorArtifact];
  const compactArtifacts = contextArtifacts.map((artifact) => ({
    id: artifact.id,
    kind: artifact.kind,
    name: artifact.name,
    version: artifact.version,
    values: artifact.values,
    nodes: artifact.nodes.map((node) => ({
      ...node,
      primitiveCapabilities: primitiveCapabilitiesForNode(node),
    })),
    capabilities: capabilityManifests[artifact.kind],
  }));
  const graphArtifacts = body.scope === "project" ? body.project.artifacts : [anchorArtifact];
  const makeGraphs = (semanticScores?: Record<string, number>) => graphArtifacts.map((artifact) => buildInterpretationGraph({
    transcript: body.transcript.trim(),
    artifact,
    targetIds:
      artifact.id === anchorArtifact.id && (body.scope === "element" || body.scope === "region")
        ? body.anchor.targetIds
        : [],
    targetNames: body.scope === "project" ? [artifact.name] : body.anchor.targetNames,
    profile: body.project.designIntelligence,
    semanticScores,
  }));
  const graphStarted = performance.now();
  let interpretationGraph = mergeInterpretationGraphs(makeGraphs());
  let graphDuration = performance.now() - graphStarted;
  let embeddingDuration = 0;
  const needsSemanticRecall = interpretationNeedsSemanticRecall(interpretationGraph);
  if (needsSemanticRecall) {
    const embeddingModel = semanticEmbeddingModel();
    if (!embeddingModel) {
      return Response.json({ error: "The semantic recall model is not configured correctly." }, { status: 503 });
    }
    const embeddingStarted = performance.now();
    const embeddingBudget = await reserveModelRequestBudget(identity.principal.id, "intent");
    if (embeddingBudget) return embeddingBudget;
    const semanticScores = await semanticConceptScores(apiKey, identity.safetyIdentifier, embeddingModel, body.transcript.trim());
    embeddingDuration = performance.now() - embeddingStarted;
    if (semanticScores) {
      const semanticGraphStarted = performance.now();
      interpretationGraph = mergeInterpretationGraphs(makeGraphs(semanticScores));
      graphDuration += performance.now() - semanticGraphStarted;
    }
  }
  const context = {
    transcript: body.transcript.trim(),
    scope: body.scope,
    requestMode,
    anchor: body.anchor,
    recentConversation: (body.conversation ?? []).map((turn) => ({
      transcript: turn.transcript,
      resolvedTranscript: turn.resolvedTranscript,
      status: turn.status,
      scope: turn.scope,
      anchor: turn.anchor,
    })),
    project: {
      name: body.project.name,
      brief: body.project.brief,
      accentRule: body.project.accentRule,
      designIntelligence: body.project.designIntelligence,
      artifacts: compactArtifacts,
    },
    interpretationGraph: graphPromptSlice(interpretationGraph),
    evidencePack: {
      authorityNote: body.evidencePack?.authorityNote ?? "Evidence governs only the properties explicitly named by the user.",
      items: (body.evidencePack?.items ?? []).map((item) => ({
        id: item.id,
        kind: item.kind,
        label: item.label,
        governs: item.governs,
        provenance: item.provenance,
        mimeType: item.mimeType,
      })),
    },
    renderSnapshot: body.renderSnapshot
      ? {
          artifactId: body.renderSnapshot.artifactId,
          viewport: body.renderSnapshot.viewport,
          nodes: body.renderSnapshot.nodes.slice(0, 80).map((node) => ({
            id: node.id,
            label: node.label,
            kind: node.kind,
            text: node.text?.slice(0, 160),
            rect: node.rect,
            style: node.style,
          })),
        }
      : undefined,
  };

  const systemPrompt = [
    "You are GHOSA's intent compiler for collaborative creative work.",
    "Match strategy search to requestMode. For strategic requests, privately compare at least three materially different design strategies. For bounded requests, choose the least destructive faithful route without expanding the task. Compare against craft, medium context, the supplied taste profile, edit locality, and actual executor limits. Return only the concise chosen diagnosis, strategy, and operations; never expose hidden chain-of-thought.",
    "Translate ordinary perceptual language into a reversible, reviewable proposal using only the controls and IDs in the supplied context.",
    "First classify the surface as persuade, operate, read, or experience. Use the active artifact's context profile. Diagnose composition and information structure before styling.",
    "Route only the smallest relevant set of craft skills from craftSkillLibrary—normally one to three—and return their exact IDs. Turn their checks and the acceptanceBar into concrete success criteria and post-execution verification checks.",
    "Treat the brand grammar as project law, the taste profile as a preference signal, craft rules as a quality floor, and executor capabilities as hard limits. Do not allow a template or taste preference to override accessibility or stated preservation constraints.",
    "Use interpretationGraph as a bounded semantic evidence slice joining the person's language to relevant design concepts, relations, project overlays, and the selected artifact. Linguistic preserve and exclude operators are binding. Design paths are contextual hypotheses: choose only paths that serve the request and available medium, and never treat embedding similarity as authority. Keep the chosen operations and explanation faithful to the supplied relation rationales.",
    "Use semanticOntology as the grounding contract. Address the most specific node that faithfully matches the person's selection and language; preserve parent-child relationships, edit locality, and the node's declared first-class primitive controls. Never collapse a mapped text, action, image, shape, effect, or decoration into a misleading parent target.",
    "Use renderSnapshot as the current visual evidence when it is present. Diagnose actual scale, bounds, hierarchy, density, contrast, and relationships from that rendered state rather than reasoning only from abstract control numbers.",
    "Evidence items are property-scoped. Use an image or sketch only for the property named in its governs field, cite used evidence by its exact ID, and do not let a reference silently override brand, copy, or structure.",
    "Follow representationPolicy in preference order. Choose structured execution when supplied layers and controls can satisfy the request. Use programmable for editable coded graphics derived from geometry or composition evidence. Use generative only for bounded raster, photographic, illustrative, or temporal assets. Never flatten a structured artifact merely because a generator could imitate it. If the requested outcome requires an unavailable lane, request clarification instead of pretending numeric controls can perform it.",
    "Motion must have a semantic purpose, explicit states, and one exact token from motionVocabulary. Use none when motion.required is false. Preserve the same hierarchy and feedback with the calm reduced-motion behavior. Avoid ornamental motion in routine interface work.",
    "Reject generic AI styling: decorative gradients, glass, cards, pills, glow, or animation are not strategies unless they solve the diagnosed problem and belong to the brand grammar. Prefer one strong compositional idea over accumulated effects.",
    "Create a verification plan that separates deterministic checks from visual and temporal inspection. Never claim that an unrendered proposal has passed a check; visual and temporal conditions remain unverified until execution and inspection.",
    "Do not apply changes. Do not invent content, artifacts, targets, controls, or technical requirements.",
    "Treat preserve and avoid language as binding constraints. Ground words like this, that, and it to the supplied anchor.",
    "Use recentConversation only to resolve conversational references and omitted intent. A short follow-up such as 'this one too' means repeat the immediately preceding applied design intent on the new anchor. Never inherit from a rejected, merely proposed, or unresolved turn, and never carry forward an old target when the current anchor supplies a new one.",
    "Control values are absolute numbers from 0 to 100. Compare them with current values and prefer meaningful but measured deltas, usually 4 to 18 points.",
    "For element or region scope, every operation must use the anchor artifact and one or more anchor target IDs. Those IDs are real editable layers: choose only targets whose capabilities include the requested control.",
    "For artifact scope, use only the anchor artifact. For project scope, coordinate relevant operations across artifacts without forcing every artifact to change.",
    "Use approachable outcome language in the interpretation; the operations may use the exact capability IDs.",
    "Request one focused clarification only when the ambiguity could materially change the target or outcome. Otherwise set clarification.required to false with an empty question and options.",
    "Clarifications must use simple designer-to-client language. Never mention capability IDs, controls, executors, nodes, schemas, tokens, or other implementation details.",
  ].join(" ");

  const visualEvidence = (body.evidencePack?.items ?? []).filter(
    (item): item is EvidenceItem & { dataUrl: string } => typeof item.dataUrl === "string",
  );
  const userContent: Array<Record<string, unknown>> = [
    { type: "input_text", text: JSON.stringify(context) },
    ...visualEvidence.map((item) => ({
      type: "input_image",
      image_url: item.dataUrl,
      detail: "high",
    })),
  ];

  try {
    const modelStarted = performance.now();
    const responseBudget = await reserveModelRequestBudget(identity.principal.id, "intent");
    if (responseBudget) return responseBudget;
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Safety-Identifier": identity.safetyIdentifier,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.6-sol",
        reasoning: { effort: reasoningEffort },
        store: false,
        max_output_tokens: reasoningEffort === "high" ? 3_500 : reasoningEffort === "medium" ? 3_000 : 2_400,
        prompt_cache_key: "ghosa-intent-2026-08-28",
        prompt_cache_options: { mode: "explicit" },
        input: [
          {
            role: "system",
            content: [{
              type: "input_text",
              text: systemPrompt,
              prompt_cache_breakpoint: { mode: "explicit" },
            }],
          },
          { role: "user", content: userContent },
        ],
        text: {
          verbosity: "low",
          format: {
            type: "json_schema",
            name: "ghosa_intent_contract",
            strict: true,
            schema: outputSchema,
          },
        },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const payload = await upstream.json() as Record<string, unknown>;
    const modelDuration = performance.now() - modelStarted;
    if (!upstream.ok) {
      return Response.json(
        { error: "Meant could not finish that design pass. Try again." },
        {
          status: upstream.status,
          headers: {
            "Server-Timing": serverTimingHeader([
              ["graph", graphDuration],
              ["embedding", embeddingDuration],
              ["model", modelDuration],
              ["total", performance.now() - requestStarted],
            ]),
          },
        },
      );
    }

    const sanitizeStarted = performance.now();
    const text = responseText(payload);
    if (!text) return Response.json({ error: "The model returned no intent contract." }, { status: 502 });
    const result = sanitizeResult(JSON.parse(text), body, interpretationGraph);
    if (!result) return Response.json({ error: "The model returned an invalid intent contract." }, { status: 502 });
    const needsUnavailableExecutor =
      result.proposal.designPlan.executorLane !== "structured" ||
      result.proposal.designPlan.motion.required;
    if (needsUnavailableExecutor && !result.clarification.required) {
      const lane = result.proposal.designPlan.motion.required
        ? "temporal or motion"
        : result.proposal.designPlan.executorLane;
      result.clarification = {
        required: true,
        question: `This direction needs a ${lane} executor that is not yet available in this canvas. How should Meant proceed?`,
        options: [
          "Create the closest structured revision",
          "Preserve this as a future execution plan",
        ],
      };
      result.proposal.operations = [];
    }
    const protectedControls = protectedControlsForGraph(interpretationGraph);
    if (!result.clarification.required && result.proposal.operations.length === 0 && protectedControls.size) {
      const protectedLabels = interpretationGraph.constraints
        .filter((constraint) => constraint.protectedControls?.length)
        .map((constraint) => constraint.label)
        .slice(0, 2);
      result.clarification = {
        required: true,
        question: `The available change would alter ${protectedLabels.join(" and ")}, which you asked Meant to keep. How should Meant proceed?`,
        options: [
          "Try a different design route",
          "Keep the current design",
        ],
      };
    }
    if (!result.clarification.required && result.proposal.operations.length === 0) {
      return Response.json({ error: "The model did not produce a usable proposal." }, { status: 502 });
    }

    const { operationEvidence, selectedPathIds } = operationEvidenceForGraph(
      interpretationGraph,
      result.proposal.operations,
      body.project.artifacts,
    );
    const selectedPathIdSet = new Set(selectedPathIds);
    result.proposal.designPlan.semanticTrace = {
      ...interpretationGraph,
      paths: interpretationGraph.paths.filter((path) => selectedPathIdSet.has(path.id)),
    };
    result.proposal.designPlan.operationEvidence = operationEvidence;

    makeClarificationHuman(result);

    const sanitizeDuration = performance.now() - sanitizeStarted;
    return Response.json(
      {
        result,
        model: "gpt-5.6-sol",
        reasoningEffort,
        responseId: payload.id ?? null,
      },
      {
        headers: {
          "Server-Timing": serverTimingHeader([
            ["graph", graphDuration],
            ["embedding", embeddingDuration],
            ["model", modelDuration],
            ["sanitize", sanitizeDuration],
            ["total", performance.now() - requestStarted],
          ]),
        },
      },
    );
  } catch {
    return Response.json({ error: "The intent compiler could not be reached." }, { status: 502 });
  }
}
