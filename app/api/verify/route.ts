import type {
  CreativeArtifact,
  DesignCritique,
  DesignOperation,
  DesignPlan,
  InstrumentId,
  IntentScope,
  RenderSnapshot,
} from "@/lib/ghosa/contracts";
import { resolveNodeValues } from "@/lib/ghosa/intent";
import { capabilityManifests } from "@/lib/ghosa/seed";
import {
  validCreativeArtifact,
  validDesignOperation,
  validDesignPlan,
  validModelImageDataUrl,
  validRenderSnapshot,
  validVerifyAnchor,
  modelInputWithinBudget,
} from "@/lib/server/model-request-validation";
import {
  authenticateModelRequest,
  readBoundedJson,
  reserveModelRequestBudget,
} from "@/lib/server/request-security";

const CONTROLS: InstrumentId[] = [
  "warmth", "contrast", "spacing", "focalStrength", "softness", "surfaceDepth",
  "cornerRadius", "typeScale", "accentStrength", "saturation", "cropScale",
];

interface VerifyRequest {
  transcript: string;
  scope: IntentScope;
  anchor: { artifactId: string; targetIds: string[]; targetNames: string[] };
  designPlan: DesignPlan;
  operations: DesignOperation[];
  artifacts: CreativeArtifact[];
  beforeSnapshot?: RenderSnapshot;
  afterSnapshot?: RenderSnapshot;
  beforeImage?: string;
  afterImage?: string;
}

function isImage(value: unknown): value is string {
  return validModelImageDataUrl(value);
}

function validRequest(value: unknown): value is VerifyRequest {
  if (!value || typeof value !== "object") return false;
  const body = value as Partial<VerifyRequest>;
  const artifacts = body.artifacts ?? [];
  const artifactsAreValid = Array.isArray(artifacts) && artifacts.length > 0 && artifacts.length <= 12 &&
    artifacts.every(validCreativeArtifact) && new Set(artifacts.map((artifact) => artifact.id)).size === artifacts.length;
  const anchor = validVerifyAnchor(body.anchor) ? body.anchor : undefined;
  const anchorArtifact = artifactsAreValid && anchor
    ? artifacts.find((artifact) => artifact.id === anchor.artifactId)
    : undefined;
  const anchorTargetsAreValid = !!anchorArtifact && !!anchor && anchor.targetIds.every((targetId) =>
    anchorArtifact.nodes.some((node) => node.id === targetId)
  );
  const operationsAreValid = Array.isArray(body.operations) && body.operations.length > 0 && body.operations.length <= 24 &&
    body.operations.every((operation) => {
      if (!validDesignOperation(operation)) return false;
      const artifact = artifactsAreValid ? artifacts.find((candidate) => candidate.id === operation.artifactId) : undefined;
      return !!artifact && operation.targetIds.every((targetId) => artifact.nodes.some((node) => node.id === targetId));
    });
  return (
    typeof body.transcript === "string" && body.transcript.trim().length > 0 && body.transcript.length <= 6_000 &&
    ["element", "region", "artifact", "project"].includes(String(body.scope)) &&
    !!anchor && anchorTargetsAreValid &&
    validDesignPlan(body.designPlan) && operationsAreValid && artifactsAreValid &&
    (!body.beforeSnapshot || validRenderSnapshot(body.beforeSnapshot)) &&
    (!body.afterSnapshot || validRenderSnapshot(body.afterSnapshot)) &&
    (!body.beforeImage || isImage(body.beforeImage)) &&
    (!body.afterImage || isImage(body.afterImage))
  );
}

function responseText(payload: unknown) {
  if (!payload || typeof payload !== "object") return null;
  const response = payload as { output_text?: unknown; output?: Array<{ content?: Array<{ type?: string; text?: unknown }> }> };
  if (typeof response.output_text === "string") return response.output_text;
  for (const item of response.output ?? []) {
    for (const content of item.content ?? []) {
      if (content.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return null;
}

function clampScore(value: unknown) {
  return typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(1, value)) : 0.5;
}

function sanitizeCritique(raw: unknown, request: VerifyRequest): DesignCritique | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const rawScores = value.scores as Record<string, unknown> | undefined;
  if (!rawScores) return null;
  const artifactMap = new Map(request.artifacts.map((artifact) => [artifact.id, artifact]));
  const anchorIds = new Set(request.anchor.targetIds);
  const revisedOperations = (Array.isArray(value.revisedOperations) ? value.revisedOperations : [])
    .flatMap((candidate): DesignOperation[] => {
      if (!candidate || typeof candidate !== "object") return [];
      const operation = candidate as Record<string, unknown>;
      const artifactId = typeof operation.artifactId === "string" ? operation.artifactId : "";
      const artifact = artifactMap.get(artifactId);
      const control = typeof operation.control === "string" ? operation.control as InstrumentId : null;
      const targetIds = Array.isArray(operation.targetIds)
        ? operation.targetIds.filter((item): item is string => typeof item === "string").slice(0, 16)
        : [];
      const nextValue = typeof operation.value === "number" ? operation.value : Number.NaN;
      if (!artifact || !control || !CONTROLS.includes(control) || !Number.isFinite(nextValue)) return [];
      if (!capabilityManifests[artifact.kind].instruments.some((item) => item.id === control)) return [];
      if (request.scope !== "project" && artifactId !== request.anchor.artifactId) return [];
      if ((request.scope === "element" || request.scope === "region") &&
          (targetIds.length === 0 || targetIds.some((id) => !anchorIds.has(id)))) return [];
      const nodes = new Map(artifact.nodes.map((node) => [node.id, node]));
      if (targetIds.some((id) => !nodes.get(id)?.capabilities.includes(control))) return [];
      const baseline = targetIds[0] ? resolveNodeValues(artifact, targetIds[0])[control] : artifact.values[control];
      const rounded = Math.max(0, Math.min(100, Math.round(nextValue)));
      if (Math.abs(rounded - baseline) < 3) return [];
      return [{ artifactId, targetIds, control, value: rounded }];
    })
    .slice(0, 12);

  const requestedVerdict = value.verdict === "revise" ? "revise" : "pass";
  return {
    verdict: requestedVerdict === "revise" && revisedOperations.length ? "revise" : "pass",
    summary: typeof value.summary === "string" && value.summary.trim()
      ? value.summary.trim().slice(0, 320)
      : "The result was checked against the stated intent and the current design system.",
    scores: {
      intentFidelity: clampScore(rawScores.intentFidelity),
      hierarchy: clampScore(rawScores.hierarchy),
      legibility: clampScore(rawScores.legibility),
      composition: clampScore(rawScores.composition),
      brandFidelity: clampScore(rawScores.brandFidelity),
      editLocality: clampScore(rawScores.editLocality),
    },
    revisedOperations,
  };
}

const outputSchema = {
  type: "object",
  properties: {
    verdict: { type: "string", enum: ["pass", "revise"] },
    summary: { type: "string" },
    scores: {
      type: "object",
      properties: {
        intentFidelity: { type: "number", minimum: 0, maximum: 1 },
        hierarchy: { type: "number", minimum: 0, maximum: 1 },
        legibility: { type: "number", minimum: 0, maximum: 1 },
        composition: { type: "number", minimum: 0, maximum: 1 },
        brandFidelity: { type: "number", minimum: 0, maximum: 1 },
        editLocality: { type: "number", minimum: 0, maximum: 1 },
      },
      required: ["intentFidelity", "hierarchy", "legibility", "composition", "brandFidelity", "editLocality"],
      additionalProperties: false,
    },
    revisedOperations: {
      type: "array",
      maxItems: 12,
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
  required: ["verdict", "summary", "scores", "revisedOperations"],
  additionalProperties: false,
};

export async function POST(request: Request) {
  const identity = await authenticateModelRequest(request);
  if (!identity.ok) return identity.response;
  const parsed = await readBoundedJson<unknown>(request, 3_500_000, "Verification request");
  if (!parsed.ok) return parsed.response;
  const body = parsed.value;
  if (!validRequest(body)) return Response.json({ error: "The verification request is incomplete." }, { status: 400 });
  const inputImages = [body.beforeImage, body.afterImage].filter((image): image is string => Boolean(image));
  const structuredInput = { ...body, beforeImage: undefined, afterImage: undefined };
  if (!modelInputWithinBudget(structuredInput, inputImages)) {
    return Response.json({ error: "The verification context exceeds Meant's model-input budget." }, { status: 413 });
  }

  const apiKey = (process.env.OPENAI_API_KEY ?? process.env.demo_open_api_key)?.trim();
  if (!apiKey) return Response.json({ error: "Design verification is not configured." }, { status: 503 });

  const context = {
    transcript: body.transcript,
    scope: body.scope,
    anchor: body.anchor,
    designPlan: body.designPlan,
    operationsApplied: body.operations,
    artifactsAfterApply: body.artifacts.map((artifact) => ({
      id: artifact.id,
      kind: artifact.kind,
      name: artifact.name,
      values: artifact.values,
      nodes: artifact.nodes,
    })),
    beforeSnapshot: body.beforeSnapshot,
    afterSnapshot: body.afterSnapshot,
  };
  const userContent: Array<Record<string, unknown>> = [
    { type: "input_text", text: JSON.stringify(context) },
  ];
  if (body.beforeImage) {
    userContent.push({ type: "input_text", text: "BEFORE render" });
    userContent.push({ type: "input_image", image_url: body.beforeImage, detail: "high" });
  }
  if (body.afterImage) {
    userContent.push({ type: "input_text", text: "AFTER render" });
    userContent.push({ type: "input_image", image_url: body.afterImage, detail: "high" });
  }

  const systemPrompt = [
    "You are GHOSA's post-execution design critic.",
    "Judge the AFTER result against the person's exact intent, the selected scope, the chosen design plan, and the BEFORE result.",
    "Evaluate intent fidelity, hierarchy, legibility, composition, Bobalicious brand fidelity, and edit locality.",
    "Use the images as primary visual evidence when present and the rendered DOM snapshots as supporting geometric evidence.",
    "Return pass when the result is materially better and meets the intent. Do not revise merely to express a different taste preference.",
    "Return revise only for a clear, consequential weakness that the listed structured controls can fix. Supply the smallest correction, using only exact artifact IDs, semantic target IDs, and control names in the context.",
    "Never add content, invent capabilities, change unrelated areas, or expose hidden reasoning. This is the sole automatic revision pass.",
  ].join(" ");

  try {
    const budget = await reserveModelRequestBudget(identity.principal.id, "verify");
    if (budget) return budget;
    const upstream = await fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "OpenAI-Safety-Identifier": identity.safetyIdentifier,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-5.6-sol",
        reasoning: { effort: "medium" },
        store: false,
        max_output_tokens: 1_800,
        input: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent },
        ],
        text: { format: { type: "json_schema", name: "ghosa_design_critique", strict: true, schema: outputSchema } },
      }),
      signal: AbortSignal.timeout(60_000),
    });
    const payload = await upstream.json() as Record<string, unknown>;
    if (!upstream.ok) {
      return Response.json({ error: "Meant could not verify that result." }, { status: upstream.status });
    }
    const text = responseText(payload);
    if (!text) return Response.json({ error: "The design critic returned no result." }, { status: 502 });
    const result = sanitizeCritique(JSON.parse(text), body);
    if (!result) return Response.json({ error: "The design critic returned an invalid result." }, { status: 502 });
    return Response.json({ result, model: "gpt-5.6-sol", responseId: payload.id ?? null });
  } catch {
    return Response.json({ error: "The design critic could not be reached." }, { status: 502 });
  }
}
