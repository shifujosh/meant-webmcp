import type { CanonicalProperty, DesignOperation, DesignPlan } from "./contracts";
import { operationRegistry } from "./operation-registry";

type OperationInput = DesignOperation | { artifactId: string; targetIds: string[]; property: CanonicalProperty; value: string | number };

export interface CommandSurface {
  getProjectContext: () => unknown;
  listPackets: (status?: string) => unknown;
  inspectArtifact: (artifactId: string) => unknown;
  stageChangeSet: (input: {
    expressionPacketId: string;
    summary: string;
    rationale: string;
    assumptions?: string[];
    designPlan?: DesignPlan;
    operations: OperationInput[];
  }) => unknown;
  reviseChangeSet: (input: {
    changeSetId: string;
    summary?: string;
    rationale?: string;
    assumptions?: string[];
    designPlan?: DesignPlan;
    operations: OperationInput[];
  }) => unknown;
  requestClarification: (packetId: string, question: string, options: string[]) => unknown;
  applyStaged: (changeSetId: string, expectedRevision: number, operationDigest: string) => unknown;
  undoCommitted: (committedChangeId: string, expectedRevision: number) => unknown;
}

export interface WebMcpToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, unknown>;
  annotations?: Record<string, boolean>;
  execute: (input: Record<string, unknown>) => unknown;
}

const designOperationSchema = {
  oneOf: Object.values(operationRegistry).map((definition) => ({
    type: "object",
    properties: {
      artifactId: { type: "string", maxLength: 128 },
      targetIds: { type: "array", maxItems: 16, items: { type: "string", maxLength: 128 } },
      property: { type: "string", enum: [definition.property] },
      value: definition.kind === "set_numeric"
        ? { type: "number", minimum: definition.min, maximum: definition.max }
        : definition.kind === "set_enum"
          ? { type: "string", enum: definition.values }
          : { type: "string", maxLength: definition.kind === "set_text" ? 4000 : 32 },
    },
    required: ["artifactId", "targetIds", "property", "value"],
    additionalProperties: false,
  })),
};

/**
 * One registry powers browser Site tools and contract tests. Commands are read
 * lazily so every tool always reaches the current React workspace state.
 */
export function createWebMcpTools(getCommands: () => CommandSurface | null): WebMcpToolDefinition[] {
  const commands = () => getCommands();
  return [
    {
      name: "get_project_context",
      title: "Get project context",
      description: "Read the live Meant project, active artifact, semantic selection, unresolved expressions, and staged change.",
      inputSchema: { type: "object", properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: () => commands()?.getProjectContext(),
    },
    {
      name: "list_expression_packets",
      title: "List expressions",
      description: "List grounded human expressions instead of reconstructing intent from the interface.",
      inputSchema: {
        type: "object",
        properties: { status: { type: "string", maxLength: 32 } },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (input) => commands()?.listPackets(typeof input.status === "string" ? input.status : undefined),
    },
    {
      name: "inspect_artifact",
      title: "Inspect artifact",
      description: "Inspect an artifact's semantic layer graph, current values, version, and available design controls.",
      inputSchema: {
        type: "object",
        properties: { artifactId: { type: "string", maxLength: 128 } },
        required: ["artifactId"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: (input) => commands()?.inspectArtifact(String(input.artifactId)),
    },
    {
      name: "stage_change_set",
      title: "Stage design change",
      description: "Stage a reversible typed proposal from one grounded expression without applying it.",
      inputSchema: {
        type: "object",
        properties: {
          expressionPacketId: { type: "string", maxLength: 128 },
          summary: { type: "string", maxLength: 240 },
          rationale: { type: "string", maxLength: 600 },
          assumptions: { type: "array", maxItems: 8, items: { type: "string", maxLength: 240 } },
          operations: { type: "array", maxItems: 24, items: designOperationSchema },
        },
        required: ["expressionPacketId", "summary", "rationale", "operations"],
        additionalProperties: false,
      },
      execute: (input) => commands()?.stageChangeSet({
        expressionPacketId: String(input.expressionPacketId),
        summary: String(input.summary),
        rationale: String(input.rationale),
        assumptions: Array.isArray(input.assumptions) ? input.assumptions.map(String) : [],
        operations: Array.isArray(input.operations) ? input.operations as OperationInput[] : [],
      }),
    },
    {
      name: "revise_change_set",
      title: "Revise design change",
      description: "Revise the active staged proposal after human correction.",
      inputSchema: {
        type: "object",
        properties: {
          changeSetId: { type: "string", maxLength: 128 },
          summary: { type: "string", maxLength: 240 },
          rationale: { type: "string", maxLength: 600 },
          assumptions: { type: "array", maxItems: 8, items: { type: "string", maxLength: 240 } },
          operations: { type: "array", maxItems: 24, items: designOperationSchema },
        },
        required: ["changeSetId", "operations"],
        additionalProperties: false,
      },
      execute: (input) => commands()?.reviseChangeSet({
        changeSetId: String(input.changeSetId),
        summary: typeof input.summary === "string" ? input.summary : undefined,
        rationale: typeof input.rationale === "string" ? input.rationale : undefined,
        assumptions: Array.isArray(input.assumptions) ? input.assumptions.map(String) : undefined,
        operations: Array.isArray(input.operations) ? input.operations as OperationInput[] : [],
      }),
    },
    {
      name: "request_clarification",
      title: "Request clarification",
      description: "Attach one focused question to an ambiguous expression instead of guessing.",
      inputSchema: {
        type: "object",
        properties: {
          expressionPacketId: { type: "string", maxLength: 128 },
          question: { type: "string", maxLength: 240 },
          options: { type: "array", items: { type: "string", maxLength: 100 }, maxItems: 4 },
        },
        required: ["expressionPacketId", "question", "options"],
        additionalProperties: false,
      },
      execute: (input) => commands()?.requestClarification(
        String(input.expressionPacketId),
        String(input.question),
        Array.isArray(input.options) ? input.options.map(String) : [],
      ),
    },
    {
      name: "apply_staged_change_set",
      title: "Request Apply confirmation",
      description: "Request visible human confirmation for the exact staged change. This agent tool never commits by itself.",
      inputSchema: {
        type: "object",
        properties: {
          changeSetId: { type: "string", maxLength: 128 },
          expectedRevision: { type: "integer", minimum: 1 },
          operationDigest: { type: "string", pattern: "^sha256-[0-9a-f]{64}$" },
        },
        required: ["changeSetId", "expectedRevision", "operationDigest"],
        additionalProperties: false,
      },
      execute: (input) => commands()?.applyStaged(String(input.changeSetId), Number(input.expectedRevision), String(input.operationDigest)),
    },
    {
      name: "undo_committed_change",
      title: "Request Undo confirmation",
      description: "Request visible human confirmation for one exact eligible committed change. This agent tool never reverts by itself.",
      inputSchema: {
        type: "object",
        properties: { committedChangeId: { type: "string", maxLength: 128 }, expectedRevision: { type: "integer", minimum: 1 } },
        required: ["committedChangeId", "expectedRevision"],
        additionalProperties: false,
      },
      execute: (input) => commands()?.undoCommitted(String(input.committedChangeId), Number(input.expectedRevision)),
    },
  ];
}
