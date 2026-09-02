export type ArtifactKind = "web" | "graphic" | "photo";

export type IntentScope = "element" | "region" | "artifact" | "project";

export type SurfaceMode = "persuade" | "operate" | "read" | "experience";

export type ExecutorLane = "structured" | "programmable" | "generative";

export type DesignConceptKind =
  | "perception"
  | "principle"
  | "property"
  | "pattern"
  | "operation"
  | "constraint";

export type DesignRelationKind =
  | "manifests_as"
  | "supports"
  | "conflicts_with"
  | "softens"
  | "intensifies"
  | "requires"
  | "works_in"
  | "degrades_in";

export type LinguisticOperator =
  | "request"
  | "increase"
  | "decrease"
  | "preserve"
  | "exclude";

export type MotionTokenId = "snap" | "ui" | "gentle" | "lively" | "ambient";

export type EvidenceKind =
  | "reference_image"
  | "geometry_sketch"
  | "screenshot"
  | "timing_reference"
  | "written_note";

export type InstrumentId =
  | "warmth"
  | "contrast"
  | "spacing"
  | "focalStrength"
  | "softness"
  | "surfaceDepth"
  | "cornerRadius"
  | "typeScale"
  | "accentStrength"
  | "saturation"
  | "cropScale";

export type ArtifactValues = Record<InstrumentId, number>;

export type NodeAlignment = "start" | "center" | "end";
export type NodeDirection = "row" | "column";

export interface NodePrimitives {
  content?: string;
  fill?: string;
  alignment?: NodeAlignment;
  direction?: NodeDirection;
  /** A subtle opposing edge used only when one ink cannot clear a mixed backdrop. */
  legibilityEdge?: "dark" | "light";
}

export type SemanticNodeKind =
  | "composition"
  | "group"
  | "text"
  | "action"
  | "image"
  | "shape"
  | "background"
  | "effect"
  | "decoration";

export interface ArtifactNode {
  id: string;
  name: string;
  /** Stable, machine-readable identity for routing contextual controls. */
  kind: SemanticNodeKind;
  /** Short human description of the job this layer performs. */
  purpose: string;
  role: string;
  parentId?: string;
  capabilities: InstrumentId[];
  visible?: boolean;
  locked?: boolean;
  /** Layer-local design state. Missing values inherit from the parent/artifact. */
  values?: Partial<ArtifactValues>;
  /** Direct, non-scalar primitives owned by this semantic layer. */
  primitives?: NodePrimitives;
}

export interface CreativeArtifact {
  id: string;
  kind: ArtifactKind;
  name: string;
  format: string;
  version: number;
  values: ArtifactValues;
  nodes: ArtifactNode[];
}

export interface VoiceEnvelope {
  id: string;
  rawTranscript: string;
  correctedTranscript?: string;
  corrections: Array<{
    replacedText: string;
    replacementText: string;
  }>;
  captureMethod: "gpt-transcribe" | "gpt-live-transcribe" | "speech-recognition" | "typed-fallback";
  audioRetained: boolean;
  createdAt: string;
}

export interface ExpressionInterpretation {
  desiredOutcome: string;
  requestedChanges: string[];
  preserve: string[];
  avoid: string[];
  assumptions: string[];
  ambiguities: string[];
  confidence: number;
}

export interface InterpretationSignal {
  phrase: string;
  operator: LinguisticOperator;
  conceptId: string;
  conceptLabel: string;
  confidence: number;
  grounded: boolean;
}

export interface InterpretationPath {
  id: string;
  phrase: string;
  operator: LinguisticOperator;
  effect: "increase" | "decrease" | "hold" | "exclude" | "guard";
  sourceConceptId: string;
  sourceLabel: string;
  relation: DesignRelationKind;
  targetConceptId: string;
  targetLabel: string;
  realization: string;
  controls: InstrumentId[];
  confidence: number;
  rationale: string;
  artifactId: string;
  artifactKind: ArtifactKind;
  grounded: boolean;
  sourceIds: string[];
}

export interface OperationEvidence {
  operationId: string;
  pathId: string;
  explanation: string;
}

export interface InterpretationConstraint {
  kind: "explicit_preserve" | "explicit_avoid" | "brand" | "taste";
  label: string;
  source: string;
  protectedControls?: InstrumentId[];
}

/**
 * A request-scoped join between language, design knowledge, the selected
 * artifact, and project overlays. It is evidence for a plan—not canonical
 * knowledge and not an automatic learning event.
 */
export interface InterpretationGraph {
  version: string;
  retrievalMode: "graph" | "hybrid";
  reading: string;
  signals: InterpretationSignal[];
  paths: InterpretationPath[];
  constraints: InterpretationConstraint[];
  groundings: Array<{
    artifactId: string;
    artifactKind: ArtifactKind;
    targetIds: string[];
    targetNames: string[];
    availableControls: InstrumentId[];
  }>;
  unresolved: string[];
}

export interface EvidenceItem {
  id: string;
  kind: EvidenceKind;
  label: string;
  governs: string;
  provenance: "user_provided" | "project_memory";
  mimeType?: string;
}

export interface EvidencePack {
  items: EvidenceItem[];
  authorityNote: string;
}

export interface MotionGrammar {
  required: boolean;
  token: MotionTokenId | "none";
  purpose: string;
  states: string[];
  timing: string;
  reducedMotion: string;
}

export interface VerificationCheck {
  id: string;
  label: string;
  kind: "deterministic" | "visual" | "temporal";
  status: "planned" | "passed" | "failed" | "unverified";
  detail: string;
}

export interface VerificationLedger {
  status: "planned" | "partial" | "verified" | "blocked";
  checks: VerificationCheck[];
  unverifiedConditions: string[];
  updatedAt: string;
}

export interface DesignCritique {
  verdict: "pass" | "revise";
  summary: string;
  scores: {
    intentFidelity: number;
    hierarchy: number;
    legibility: number;
    composition: number;
    brandFidelity: number;
    editLocality: number;
  };
  revisedOperations: DesignOperation[];
}

export interface DesignPlan {
  surfaceMode: SurfaceMode;
  diagnosis: string;
  strategy: string;
  contextReasoning: string;
  characterMove: string;
  craftSkills: Array<{
    id: string;
    label: string;
    reason: string;
  }>;
  executorLane: ExecutorLane;
  executorReason: string;
  successCriteria: string[];
  evidenceUsed: string[];
  semanticTrace?: InterpretationGraph;
  operationEvidence?: OperationEvidence[];
  motion: MotionGrammar;
  verification: VerificationLedger;
}

/** A compact, privacy-preserving reading of the rendered artifact. */
export interface RenderedNodeSnapshot {
  id: string;
  label: string;
  kind?: string;
  text?: string;
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  style: {
    fontSize: string;
    lineHeight: string;
    color: string;
    backgroundColor: string;
    opacity: string;
    transform: string;
    filter: string;
    borderRadius: string;
  };
}

export interface RenderSnapshot {
  artifactId: string;
  viewport: { width: number; height: number };
  nodes: RenderedNodeSnapshot[];
}

export type ExpressionStatus =
  | "captured"
  | "interpreted"
  | "needs_clarification"
  | "staged"
  | "approved"
  | "applied"
  | "undone"
  | "rejected";

export interface ExpressionPacket {
  id: string;
  createdAt: string;
  status: ExpressionStatus;
  scope: IntentScope;
  voiceEnvelope: VoiceEnvelope;
  anchor: {
    artifactId: string;
    artifactVersion: number;
    targetIds: string[];
    targetNames: string[];
  };
  interpretation: ExpressionInterpretation;
  evidencePack?: EvidencePack;
  contextResolution?: {
    sourceExpressionPacketId: string;
    sourceTranscript: string;
    resolvedTranscript: string;
  };
  clarification?: {
    question: string;
    options: string[];
  };
}

export interface DesignOperation {
  artifactId: string;
  targetIds: string[];
  control: InstrumentId;
  value: number;
}

export type CanonicalProperty = InstrumentId | "content" | "fill" | "alignment" | "direction";
export type CanonicalValue = number | string;
export type CanonicalOperationKind = "set_numeric" | "set_text" | "set_color" | "set_enum";

/** Immutable, revision-bound executable operation shared by every input surface. */
export interface CanonicalOperation {
  operationId: string;
  projectId: string;
  workspaceId: string;
  baseRevision: number;
  artifactId: string;
  artifactVersion: number;
  targetIds: string[];
  kind: CanonicalOperationKind;
  property: CanonicalProperty;
  value: CanonicalValue;
}

export interface AuthorityEnvelope {
  status: "inspect_only" | "staged" | "approved" | "consumed" | "revoked";
  changeSetId: string;
  artifactVersions: Record<string, number>;
  projectId: string;
  workspaceId: string;
  baseRevision: number;
  operationDigest: string;
  allowedAction: "apply_change_set";
  constraints: string[];
  issuedAt?: string;
  expiresAt?: string;
}

export interface ChangeSet {
  id: string;
  expressionPacketId: string;
  expressionPacketSnapshot?: ExpressionPacket;
  summary: string;
  rationale: string;
  assumptions: string[];
  designPlan?: DesignPlan;
  operations: CanonicalOperation[];
  createdAt: string;
  authority: AuthorityEnvelope;
}

export interface AppliedOperation extends DesignOperation {
  id: string;
  beforeValues: Array<{ targetId: string; value: number }>;
  afterValues: Array<{ targetId: string; value: number }>;
}

export interface CanonicalAppliedOperation extends CanonicalOperation {
  id: string;
  beforeValues: Array<{ targetId: string; value: CanonicalValue }>;
  afterValues: Array<{ targetId: string; value: CanonicalValue }>;
}

export interface AppliedChange {
  id: string;
  expressionPacketId: string;
  summary: string;
  appliedAt: string;
  operations: Array<AppliedOperation | CanonicalAppliedOperation>;
  designPlan?: DesignPlan;
}

export interface UndoEntry {
  artifacts: CreativeArtifact[];
  expressionPacketId?: string;
  appliedChangeId?: string;
}

export interface ProvenanceEvent {
  id: string;
  type:
    | "expression_captured"
    | "clarification_requested"
    | "change_staged"
    | "authority_issued"
    | "change_applied"
    | "change_undone"
    | "verification_completed"
    | "evidence_added"
    | "instrument_adjusted"
    | "verification_completed"
    | "tool_called";
  label: string;
  detail: string;
  createdAt: string;
}

export interface CapabilityInstrument {
  id: InstrumentId;
  label: string;
  description: string;
  min: number;
  max: number;
  unit?: string;
}

export interface CapabilityManifest {
  artifactKind: ArtifactKind;
  label: string;
  description: string;
  instruments: CapabilityInstrument[];
}

export interface DesignIntelligenceProfile {
  version: string;
  brandGrammar: {
    characterHypothesis: string;
    primitives: string[];
    invariants: string[];
    ranges: string[];
    forbidden: string[];
    signatureBehaviors: string[];
  };
  tasteProfile: {
    preferences: string[];
    protectedQualities: string[];
    rejectedPatterns: string[];
  };
  semanticOntology: {
    principles: string[];
    requiredNodeFields: string[];
    selectionRules: string[];
    primitiveFamilies: Array<{
      kind: SemanticNodeKind;
      firstClassControls: string[];
    }>;
  };
  craftSkillLibrary: Array<{
    id: string;
    label: string;
    useWhen: string;
    checks: string[];
  }>;
  contextProfiles: Array<{
    artifactKind: ArtifactKind;
    objective: string;
    prioritize: string[];
    commonFailures: string[];
  }>;
  motionVocabulary: {
    tokens: Array<{
      id: MotionTokenId;
      purpose: string;
      timing: string;
    }>;
    stagger: Array<"tight" | "base" | "relaxed">;
    reducedMotion: "calm";
  };
  representationPolicy: {
    preferenceOrder: ExecutorLane[];
    rules: string[];
  };
  acceptanceBar: string[];
  craftRules: string[];
}

export interface StudioProject {
  id: string;
  name: string;
  brief: string;
  accentRule: string;
  artifacts: CreativeArtifact[];
  designIntelligence?: DesignIntelligenceProfile;
  expressionPackets: ExpressionPacket[];
  activeChangeSet?: ChangeSet;
  latestAppliedChange?: AppliedChange;
  latestDesignPlan?: DesignPlan;
  latestDesignPlanExpressionPacketId?: string;
  latestVerification?: VerificationLedger;
  provenance: ProvenanceEvent[];
  /** The general-purpose visual document used by Meant's conversational composition surface. */
  composition?: import("../meant/composition-core").CompositionDocument;
  compositionReceipts?: import("../meant/composition-core").CompositionReceipt[];
}

export interface ProjectContextIdentity {
  projectId: string;
  workspaceId: string;
  revision: number;
}

export interface CommittedChange {
  id: string;
  projectId: string;
  workspaceId: string;
  parentRevision: number;
  revision: number;
  kind: "apply" | "revert";
  revertedChangeId?: string;
  operationDigest: string;
  summary: string;
  committedAt: string;
}
