export type CompositionKind = "deck" | "poster" | "infographic";
export type CompositionNodeType = "text" | "shape" | "image" | "chart" | "group";
export type CompositionLayout = "free" | "stack" | "grid";

export interface CompositionNodeStyle {
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  fontFamily: "sans" | "serif" | "mono";
  fontSize: number;
  fontWeight: number;
  lineHeight: number;
  letterSpacing: number;
  color: string;
  backgroundColor: string;
  borderColor: string;
  borderWidth: number;
  borderRadius: number;
  textAlign: "left" | "center" | "right";
  opacity: number;
  rotation: number;
}

export interface CompositionNode {
  id: string;
  type: CompositionNodeType;
  role: string;
  name: string;
  content?: string;
  assetUrl?: string;
  parentId?: string;
  locked?: boolean;
  hidden?: boolean;
  style: CompositionNodeStyle;
}

export interface CompositionFrame {
  id: string;
  name: string;
  purpose: string;
  layout: CompositionLayout;
  background: string;
  nodes: CompositionNode[];
}

export interface DesignContract {
  character: string;
  audience: string;
  objective: string;
  preserve: string[];
  avoid: string[];
  palette: string[];
  typeSystem: { display: "sans" | "serif"; body: "sans" | "serif" };
}

export interface CompositionDocument {
  id: string;
  title: string;
  kind: CompositionKind;
  version: number;
  width: number;
  height: number;
  createdAt: string;
  updatedAt: string;
  designContract: DesignContract;
  frames: CompositionFrame[];
}

type NodePatch = {
  content?: string;
  style?: Partial<CompositionNodeStyle>;
};

type FramePatch = Partial<Pick<CompositionFrame, "name" | "purpose" | "layout" | "background">>;

type CompositionReplacement = Pick<CompositionDocument, "title" | "kind" | "width" | "height" | "designContract" | "frames">;

export type CompositionOperationInput =
  | { kind: "document.replace"; frameId: "document"; targetId: "composition"; document: CompositionReplacement }
  | { kind: "node.update"; frameId: string; targetId: string; patch: NodePatch }
  | { kind: "node.add"; frameId: string; targetId: string; node: CompositionNode }
  | { kind: "node.remove"; frameId: string; targetId: string }
  | { kind: "frame.update"; frameId: string; targetId: string; patch: FramePatch }
  | { kind: "frame.add"; frameId: string; targetId: string; frame: CompositionFrame; index?: number }
  | { kind: "frame.remove"; frameId: string; targetId: string }
  | { kind: "frame.reorder"; frameId: string; targetId: string; index: number }
  | { kind: "contract.update"; frameId: "document"; targetId: "design-contract"; patch: Partial<DesignContract> };

export type CompositionOperation = CompositionOperationInput & {
  id: string;
  documentId: string;
  baseVersion: number;
};

export interface CompositionDraft {
  id: string;
  sourceTurnId: string;
  summary: string;
  status: "exploring" | "kept" | "discarded";
  baseVersion: number;
  operations: CompositionOperation[];
  preview: CompositionDocument;
  createdAt: string;
}

export interface CompositionReceipt {
  id: string;
  draftId: string;
  summary: string;
  beforeVersion: number;
  afterVersion: number;
  operations: CompositionOperation[];
  affectedFrameIds: string[];
  affectedNodeIds: string[];
  keptAt: string;
}

export interface NewCompositionInput {
  kind: CompositionKind;
  brief: string;
  title?: string;
}

const isoNow = () => new Date().toISOString();

const style = (patch: Partial<CompositionNodeStyle>): CompositionNodeStyle => ({
  x: 8,
  y: 8,
  width: 40,
  height: 20,
  zIndex: 1,
  fontFamily: "sans",
  fontSize: 24,
  fontWeight: 500,
  lineHeight: 1.08,
  letterSpacing: -0.02,
  color: "#191816",
  backgroundColor: "transparent",
  borderColor: "transparent",
  borderWidth: 0,
  borderRadius: 0,
  textAlign: "left",
  opacity: 1,
  rotation: 0,
  ...patch,
});

export function createSeedComposition(): CompositionDocument {
  const timestamp = "2026-08-31T00:00:00.000Z";
  return {
    id: "composition-meant-intro",
    title: "Meant — conversational composition",
    kind: "deck",
    version: 1,
    width: 1600,
    height: 1000,
    createdAt: timestamp,
    updatedAt: timestamp,
    designContract: {
      character: "Decisive, warm, editorial, and tactile",
      audience: "People with a visual idea who do not want to operate a design tool",
      objective: "Show how conversation can become precise, reversible visual form",
      preserve: ["Clear hierarchy", "Warm paper", "Visible revision state"],
      avoid: ["Generic AI gradients", "Dashboard chrome", "Decorative voice waveforms"],
      palette: ["#F3EFE5", "#FFFCF5", "#191816", "#666158", "#F04B32", "#F1D64B"],
      typeSystem: { display: "serif", body: "sans" },
    },
    frames: [
      {
        id: "frame-opening",
        name: "Opening",
        purpose: "Introduce the product promise",
        layout: "free",
        background: "#F3EFE5",
        nodes: [
          {
            id: "opening-index",
            type: "text",
            role: "eyebrow",
            name: "Opening label",
            content: "MEANT / 01",
            style: style({ x: 7, y: 7, width: 28, height: 5, fontSize: 14, fontWeight: 680, letterSpacing: 0.12 }),
          },
          {
            id: "opening-title",
            type: "text",
            role: "title",
            name: "Opening title",
            content: "A better way to direct design.",
            style: style({ x: 7, y: 24, width: 70, height: 40, fontFamily: "serif", fontSize: 96, fontWeight: 400, lineHeight: 0.92, letterSpacing: -0.055 }),
          },
          {
            id: "opening-note",
            type: "text",
            role: "body",
            name: "Opening supporting copy",
            content: "Speak in outcomes. Shape the work together. Keep exactly what works.",
            style: style({ x: 60, y: 78, width: 31, height: 10, fontSize: 22, fontWeight: 470, lineHeight: 1.35, color: "#666158" }),
          },
          {
            id: "opening-mark",
            type: "shape",
            role: "accent",
            name: "Proof mark",
            style: style({ x: 81, y: 8, width: 12, height: 12, backgroundColor: "#F04B32", borderRadius: 999, rotation: -8 }),
          },
        ],
      },
      {
        id: "frame-problem",
        name: "Problem",
        purpose: "Name the friction between intent and traditional design interfaces",
        layout: "free",
        background: "#191816",
        nodes: [
          {
            id: "problem-index",
            type: "text",
            role: "eyebrow",
            name: "Problem label",
            content: "THE GAP / 02",
            style: style({ x: 7, y: 7, width: 30, height: 5, fontSize: 14, fontWeight: 680, letterSpacing: 0.12, color: "#F04B32" }),
          },
          {
            id: "problem-title",
            type: "text",
            role: "title",
            name: "Problem title",
            content: "The idea is clear.\nThe interface gets in the way.",
            style: style({ x: 7, y: 19, width: 76, height: 38, fontFamily: "serif", fontSize: 76, fontWeight: 400, lineHeight: 0.96, letterSpacing: -0.045, color: "#FFFCF5" }),
          },
          {
            id: "problem-body",
            type: "text",
            role: "body",
            name: "Problem explanation",
            content: "People think in stories, feelings, references, and outcomes—not coordinates, panels, and property names.",
            style: style({ x: 52, y: 70, width: 39, height: 16, fontSize: 24, fontWeight: 450, lineHeight: 1.35, color: "#B9AA94" }),
          },
          {
            id: "problem-rule",
            type: "shape",
            role: "divider",
            name: "Problem divider",
            style: style({ x: 7, y: 70, width: 36, height: 0.25, backgroundColor: "#F04B32" }),
          },
        ],
      },
      {
        id: "frame-proof",
        name: "Proof",
        purpose: "Show the conversational composition loop",
        layout: "free",
        background: "#FFFCF5",
        nodes: [
          {
            id: "proof-index",
            type: "text",
            role: "eyebrow",
            name: "Proof label",
            content: "THE LOOP / 03",
            style: style({ x: 7, y: 7, width: 28, height: 5, fontSize: 14, fontWeight: 680, letterSpacing: 0.12 }),
          },
          {
            id: "proof-title",
            type: "text",
            role: "title",
            name: "Proof title",
            content: "Say it.\nShape it.\nKeep it.",
            style: style({ x: 7, y: 20, width: 50, height: 58, fontFamily: "serif", fontSize: 88, fontWeight: 400, lineHeight: 0.88, letterSpacing: -0.055 }),
          },
          {
            id: "proof-metric",
            type: "text",
            role: "callout",
            name: "Loop count",
            content: "03",
            style: style({ x: 68, y: 24, width: 23, height: 23, fontSize: 94, fontWeight: 700, lineHeight: 1, color: "#F04B32", textAlign: "right" }),
          },
          {
            id: "proof-body",
            type: "text",
            role: "body",
            name: "Loop explanation",
            content: "One live draft. One visible history. One shared command surface for people and agents.",
            style: style({ x: 59, y: 68, width: 32, height: 18, fontSize: 23, fontWeight: 470, lineHeight: 1.35, color: "#666158" }),
          },
        ],
      },
    ],
  };
}

const starterContract = (kind: CompositionKind): DesignContract => ({
  character: kind === "poster" ? "Bold, immediate, and memorable" : kind === "infographic" ? "Clear, structured, and evidence-led" : "Narrative, decisive, and editorial",
  audience: "The audience described in the creative brief",
  objective: kind === "poster" ? "Land one idea at a glance" : kind === "infographic" ? "Make a complex idea easy to scan and understand" : "Turn one idea into a clear visual story",
  preserve: ["Clear hierarchy", "Readable contrast", "One dominant idea"],
  avoid: ["Generic AI gradients", "Unverified claims", "Decorative clutter"],
  palette: ["#F3EFE5", "#FFFCF5", "#191816", "#666158", "#F04B32", "#F1D64B"],
  typeSystem: { display: "serif", body: "sans" },
});

function briefTitle(brief: string, explicit?: string) {
  const source = (explicit?.trim() || brief.trim() || "Untitled composition")
    .replace(/^(?:create|make|design)\s+(?:a|an)\s+(?:deck|poster|infographic)\s+(?:about|for)\s+/i, "")
    .split(/[.!?\n]/)[0]!
    .trim()
    .slice(0, 88);
  return source ? source.charAt(0).toUpperCase() + source.slice(1) : "Untitled composition";
}

function replacementFromBrief(input: NewCompositionInput): CompositionReplacement {
  const title = briefTitle(input.brief, input.title);
  const contract = starterContract(input.kind);
  if (input.kind === "poster") {
    return {
      title,
      kind: "poster",
      width: 1080,
      height: 1350,
      designContract: contract,
      frames: [{
        id: "frame-poster",
        name: "Poster",
        purpose: "Land one memorable idea",
        layout: "free",
        background: "#F3EFE5",
        nodes: [
          { id: "poster-label", type: "text", role: "eyebrow", name: "Poster label", content: "A NEW IDEA", style: style({ x: 8, y: 7, width: 44, height: 5, fontSize: 18, fontWeight: 700, letterSpacing: .12 }) },
          { id: "poster-title", type: "text", role: "title", name: "Poster title", content: title, style: style({ x: 8, y: 19, width: 82, height: 44, fontFamily: "serif", fontSize: 98, fontWeight: 400, lineHeight: .9, letterSpacing: -.055 }) },
          { id: "poster-brief", type: "text", role: "body", name: "Poster supporting copy", content: input.brief.trim().slice(0, 320), style: style({ x: 46, y: 74, width: 44, height: 15, fontSize: 24, fontWeight: 480, lineHeight: 1.3, color: "#666158" }) },
          { id: "poster-accent", type: "shape", role: "accent", name: "Poster accent", style: style({ x: 8, y: 75, width: 23, height: 18, backgroundColor: "#F04B32", borderRadius: 999, rotation: -7 }) },
        ],
      }],
    };
  }
  if (input.kind === "infographic") {
    return {
      title,
      kind: "infographic",
      width: 1080,
      height: 1350,
      designContract: contract,
      frames: [{
        id: "frame-overview",
        name: "Overview",
        purpose: "Turn the brief into a scannable explanation",
        layout: "free",
        background: "#FFFCF5",
        nodes: [
          { id: "info-label", type: "text", role: "eyebrow", name: "Infographic label", content: "A QUICK GUIDE", style: style({ x: 7, y: 6, width: 42, height: 4, fontSize: 16, fontWeight: 720, letterSpacing: .12, color: "#F04B32" }) },
          { id: "info-title", type: "text", role: "title", name: "Infographic title", content: title, style: style({ x: 7, y: 14, width: 82, height: 28, fontFamily: "serif", fontSize: 76, fontWeight: 400, lineHeight: .94, letterSpacing: -.045 }) },
          { id: "info-brief", type: "text", role: "body", name: "Infographic summary", content: input.brief.trim().slice(0, 360), style: style({ x: 7, y: 43, width: 78, height: 12, fontSize: 23, lineHeight: 1.32, color: "#666158" }) },
          { id: "info-one", type: "text", role: "callout", name: "First point", content: "01\nName the signal", style: style({ x: 7, y: 62, width: 25, height: 17, fontSize: 30, fontWeight: 680, lineHeight: 1.15, color: "#F04B32" }) },
          { id: "info-two", type: "text", role: "callout", name: "Second point", content: "02\nShow the shift", style: style({ x: 37, y: 62, width: 25, height: 17, fontSize: 30, fontWeight: 680, lineHeight: 1.15 }) },
          { id: "info-three", type: "text", role: "callout", name: "Third point", content: "03\nMake it actionable", style: style({ x: 67, y: 62, width: 27, height: 17, fontSize: 30, fontWeight: 680, lineHeight: 1.15 }) },
          { id: "info-rule", type: "shape", role: "divider", name: "Infographic divider", style: style({ x: 7, y: 87, width: 87, height: .35, backgroundColor: "#191816" }) },
        ],
      }],
    };
  }
  return {
    title,
    kind: "deck",
    width: 1600,
    height: 1000,
    designContract: contract,
    frames: [
      { id: "frame-opening", name: "Opening", purpose: "Introduce the central idea", layout: "free", background: "#F3EFE5", nodes: [
        { id: "opening-label", type: "text", role: "eyebrow", name: "Opening label", content: "OPENING / 01", style: style({ x: 7, y: 7, width: 32, height: 5, fontSize: 14, fontWeight: 700, letterSpacing: .12 }) },
        { id: "opening-title", type: "text", role: "title", name: "Opening title", content: title, style: style({ x: 7, y: 23, width: 78, height: 42, fontFamily: "serif", fontSize: 92, fontWeight: 400, lineHeight: .92, letterSpacing: -.055 }) },
        { id: "opening-brief", type: "text", role: "body", name: "Opening brief", content: input.brief.trim().slice(0, 320), style: style({ x: 57, y: 76, width: 35, height: 13, fontSize: 22, lineHeight: 1.34, color: "#666158" }) },
      ] },
      { id: "frame-story", name: "Story", purpose: "Develop the core message", layout: "free", background: "#191816", nodes: [
        { id: "story-label", type: "text", role: "eyebrow", name: "Story label", content: "THE STORY / 02", style: style({ x: 7, y: 7, width: 32, height: 5, fontSize: 14, fontWeight: 700, letterSpacing: .12, color: "#F04B32" }) },
        { id: "story-title", type: "text", role: "title", name: "Story title", content: "What matters most?", style: style({ x: 7, y: 22, width: 72, height: 36, fontFamily: "serif", fontSize: 82, fontWeight: 400, lineHeight: .94, color: "#FFFCF5" }) },
        { id: "story-body", type: "text", role: "body", name: "Story body", content: "Shape this frame with the evidence, tension, or insight that makes the idea matter.", style: style({ x: 52, y: 69, width: 39, height: 18, fontSize: 24, lineHeight: 1.35, color: "#B9AA94" }) },
      ] },
      { id: "frame-close", name: "Close", purpose: "Leave the audience with a clear next thought", layout: "free", background: "#FFFCF5", nodes: [
        { id: "close-label", type: "text", role: "eyebrow", name: "Close label", content: "THE TAKEAWAY / 03", style: style({ x: 7, y: 7, width: 35, height: 5, fontSize: 14, fontWeight: 700, letterSpacing: .12 }) },
        { id: "close-title", type: "text", role: "title", name: "Close title", content: "Make the next move unmistakable.", style: style({ x: 7, y: 23, width: 73, height: 42, fontFamily: "serif", fontSize: 84, fontWeight: 400, lineHeight: .92, letterSpacing: -.05 }) },
        { id: "close-accent", type: "shape", role: "accent", name: "Close accent", style: style({ x: 76, y: 68, width: 16, height: 16, backgroundColor: "#F04B32", borderRadius: 999 }) },
      ] },
    ],
  };
}

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, stableValue(item)]));
  }
  return value;
}

function stableStringify(value: unknown) {
  return JSON.stringify(stableValue(value));
}

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

const IDENTIFIER = /^[a-zA-Z0-9][a-zA-Z0-9._:-]{0,119}$/;

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} must be an object`);
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: readonly string[], label: string) {
  const unsupported = Object.keys(value).filter((key) => !allowed.includes(key));
  if (unsupported.length) throw new Error(`${label} contains unsupported fields: ${unsupported.join(", ")}`);
}

function boundedString(value: unknown, label: string, maximum: number, minimum = 1) {
  if (typeof value !== "string" || value.trim().length < minimum || value.length > maximum) {
    throw new Error(`${label} must be bounded text`);
  }
  return value;
}

/**
 * Keep a human-readable receipt label within the durable draft contract while
 * leaving the complete turn available to the intent planner.
 */
export function summarizeCompositionDirection(value: string, maximum = 240) {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized || maximum < 1) throw new Error("Direction summary must be bounded text");
  if (normalized.length <= maximum) return normalized;
  if (maximum === 1) return "…";
  return `${normalized.slice(0, maximum - 1).trimEnd()}…`;
}

function identifier(value: unknown, label: string) {
  if (typeof value !== "string" || !IDENTIFIER.test(value)) throw new Error(`${label} is invalid`);
  return value;
}

function finiteNumber(value: unknown, label: string, minimum: number, maximum: number, integer = false) {
  if (typeof value !== "number" || !Number.isFinite(value) || value < minimum || value > maximum || (integer && !Number.isInteger(value))) {
    throw new Error(`${label} is outside the supported range`);
  }
}

function validateColor(value: unknown, label: string) {
  if (typeof value !== "string" || !/^(?:#[0-9a-f]{6}|transparent)$/i.test(value)) {
    throw new Error(`${label} requires a six-digit hex color or transparent`);
  }
}

const STYLE_KEYS = [
  "x", "y", "width", "height", "zIndex", "fontFamily", "fontSize", "fontWeight", "lineHeight",
  "letterSpacing", "color", "backgroundColor", "borderColor", "borderWidth", "borderRadius", "textAlign",
  "opacity", "rotation",
] as const satisfies readonly (keyof CompositionNodeStyle)[];

function validateStylePatch(value: unknown, requireComplete = false) {
  const patch = asRecord(value, "Node style");
  exactKeys(patch, STYLE_KEYS, "Node style");
  if (!requireComplete && !Object.keys(patch).length) throw new Error("Node style requires one visible property");
  if (requireComplete) {
    const missing = STYLE_KEYS.filter((key) => !(key in patch));
    if (missing.length) throw new Error(`Node style is missing required fields: ${missing.join(", ")}`);
  }
  for (const key of ["x", "y"] as const) {
    if (patch[key] !== undefined) finiteNumber(patch[key], key, -20, 140);
  }
  for (const key of ["width", "height"] as const) {
    if (patch[key] !== undefined) finiteNumber(patch[key], key, 0.1, 140);
  }
  if (patch.zIndex !== undefined) finiteNumber(patch.zIndex, "zIndex", -100, 1000, true);
  if (patch.fontFamily !== undefined && !["sans", "serif", "mono"].includes(String(patch.fontFamily))) throw new Error("fontFamily is unsupported");
  if (patch.fontSize !== undefined) finiteNumber(patch.fontSize, "fontSize", 8, 240);
  if (patch.fontWeight !== undefined) finiteNumber(patch.fontWeight, "fontWeight", 100, 900, true);
  if (patch.lineHeight !== undefined) finiteNumber(patch.lineHeight, "lineHeight", 0.7, 3);
  if (patch.letterSpacing !== undefined) finiteNumber(patch.letterSpacing, "letterSpacing", -0.2, 1);
  if (patch.borderWidth !== undefined) finiteNumber(patch.borderWidth, "borderWidth", 0, 24);
  if (patch.borderRadius !== undefined) finiteNumber(patch.borderRadius, "borderRadius", 0, 999);
  if (patch.textAlign !== undefined && !["left", "center", "right"].includes(String(patch.textAlign))) throw new Error("textAlign is unsupported");
  if (patch.opacity !== undefined) finiteNumber(patch.opacity, "opacity", 0, 1);
  if (patch.rotation !== undefined) finiteNumber(patch.rotation, "rotation", -360, 360);
  for (const key of ["color", "backgroundColor", "borderColor"] as const) {
    if (patch[key] !== undefined) validateColor(patch[key], key);
  }
}

function frameFor(document: CompositionDocument, frameId: string) {
  const frame = document.frames.find((candidate) => candidate.id === frameId);
  if (!frame) throw new Error(`Unknown frame: ${frameId}`);
  return frame;
}

function validateStringArray(value: unknown, label: string, maximumItems = 24) {
  if (!Array.isArray(value) || value.length > maximumItems) throw new Error(`${label} must be a bounded list`);
  value.forEach((item, index) => boundedString(item, `${label}[${index}]`, 240));
}

function validateDesignContract(value: unknown, partial = false) {
  const contract = asRecord(value, "Design contract");
  const keys = ["character", "audience", "objective", "preserve", "avoid", "palette", "typeSystem"];
  exactKeys(contract, keys, "Design contract");
  if (!partial) {
    const missing = keys.filter((key) => !(key in contract));
    if (missing.length) throw new Error(`Design contract is missing required fields: ${missing.join(", ")}`);
  }
  for (const key of ["character", "audience", "objective"] as const) {
    if (contract[key] !== undefined) boundedString(contract[key], `Design contract ${key}`, 500);
  }
  for (const key of ["preserve", "avoid"] as const) {
    if (contract[key] !== undefined) validateStringArray(contract[key], `Design contract ${key}`);
  }
  if (contract.palette !== undefined) {
    if (!Array.isArray(contract.palette) || !contract.palette.length || contract.palette.length > 20) throw new Error("Design contract palette must be bounded");
    contract.palette.forEach((color, index) => validateColor(color, `palette[${index}]`));
  }
  if (contract.typeSystem !== undefined) {
    const typeSystem = asRecord(contract.typeSystem, "Design contract typeSystem");
    exactKeys(typeSystem, ["display", "body"], "Design contract typeSystem");
    // `typeSystem` is one atomic contract value. Accepting a nested partial here
    // would replace the complete value during apply and silently erase one role.
    if (!("display" in typeSystem) || !("body" in typeSystem)) throw new Error("Design contract typeSystem is incomplete");
    for (const key of ["display", "body"] as const) {
      if (typeSystem[key] !== undefined && !["sans", "serif"].includes(String(typeSystem[key]))) throw new Error(`Design contract ${key} typeface is unsupported`);
    }
  }
}

function validateNode(value: unknown, seenNodeIds?: Set<string>): asserts value is CompositionNode {
  const node = asRecord(value, "Composition node");
  exactKeys(node, ["id", "type", "role", "name", "content", "locked", "hidden", "style"], "Composition node");
  const nodeId = identifier(node.id, "Node id");
  if (seenNodeIds?.has(nodeId)) throw new Error(`Duplicate node: ${nodeId}`);
  seenNodeIds?.add(nodeId);
  if (!["text", "shape"].includes(String(node.type))) throw new Error(`Unsupported node type: ${String(node.type)}`);
  boundedString(node.role, "Node role", 80);
  boundedString(node.name, "Node name", 160);
  if (node.content !== undefined && (typeof node.content !== "string" || node.content.length > 4000)) throw new Error("Node content must be bounded text");
  if (node.locked !== undefined && typeof node.locked !== "boolean") throw new Error("Node locked must be boolean");
  if (node.hidden !== undefined && typeof node.hidden !== "boolean") throw new Error("Node hidden must be boolean");
  validateStylePatch(node.style, true);
}

function validateFrame(value: unknown, seenFrameIds?: Set<string>, seenNodeIds?: Set<string>): asserts value is CompositionFrame {
  const frame = asRecord(value, "Composition frame");
  exactKeys(frame, ["id", "name", "purpose", "layout", "background", "nodes"], "Composition frame");
  const frameId = identifier(frame.id, "Frame id");
  if (seenFrameIds?.has(frameId)) throw new Error(`Duplicate frame: ${frameId}`);
  seenFrameIds?.add(frameId);
  boundedString(frame.name, "Frame name", 160);
  boundedString(frame.purpose, "Frame purpose", 500);
  if (!["free", "stack", "grid"].includes(String(frame.layout))) throw new Error("Frame layout is unsupported");
  validateColor(frame.background, "background");
  if (!Array.isArray(frame.nodes) || !frame.nodes.length || frame.nodes.length > 200) throw new Error(`Frame ${frameId} requires bounded visible structure`);
  frame.nodes.forEach((node) => validateNode(node, seenNodeIds));
}

function validateReplacement(value: unknown): asserts value is CompositionReplacement {
  const document = asRecord(value, "Composition replacement");
  exactKeys(document, ["title", "kind", "width", "height", "designContract", "frames"], "Composition replacement");
  boundedString(document.title, "Composition title", 160);
  if (!["deck", "poster", "infographic"].includes(String(document.kind))) throw new Error("Unsupported composition kind");
  finiteNumber(document.width, "Composition width", 320, 8000, true);
  finiteNumber(document.height, "Composition height", 320, 8000, true);
  validateDesignContract(document.designContract);
  if (!Array.isArray(document.frames) || !document.frames.length || document.frames.length > 60) throw new Error("A composition requires between one and sixty frames");
  const frameIds = new Set<string>();
  const nodeIds = new Set<string>();
  document.frames.forEach((frame) => validateFrame(frame, frameIds, nodeIds));
}

export function validateCompositionDocument(value: unknown): asserts value is CompositionDocument {
  const document = asRecord(value, "Composition document");
  exactKeys(document, ["id", "title", "kind", "version", "width", "height", "createdAt", "updatedAt", "designContract", "frames"], "Composition document");
  identifier(document.id, "Composition id");
  finiteNumber(document.version, "Composition version", 1, 1_000_000_000, true);
  for (const key of ["createdAt", "updatedAt"] as const) {
    const timestamp = boundedString(document[key], `Composition ${key}`, 64);
    if (Number.isNaN(Date.parse(timestamp))) throw new Error(`Composition ${key} must be a timestamp`);
  }
  validateReplacement({
    title: document.title,
    kind: document.kind,
    width: document.width,
    height: document.height,
    designContract: document.designContract,
    frames: document.frames,
  });
}

function validateNodePatch(value: unknown) {
  const patch = asRecord(value, "Node patch");
  exactKeys(patch, ["content", "style"], "Node patch");
  if (!Object.keys(patch).length) throw new Error("Node patch requires one visible change");
  if (patch.content !== undefined && (typeof patch.content !== "string" || patch.content.length > 4000)) throw new Error("Node content must be bounded text");
  if (patch.style !== undefined) validateStylePatch(patch.style);
}

function validateFramePatch(value: unknown) {
  const patch = asRecord(value, "Frame patch");
  exactKeys(patch, ["name", "purpose", "layout", "background"], "Frame patch");
  if (!Object.keys(patch).length) throw new Error("Frame patch requires one visible change");
  if (patch.name !== undefined) boundedString(patch.name, "Frame name", 160);
  if (patch.purpose !== undefined) boundedString(patch.purpose, "Frame purpose", 500);
  if (patch.layout !== undefined && !["free", "stack", "grid"].includes(String(patch.layout))) throw new Error("Frame layout is unsupported");
  if (patch.background !== undefined) validateColor(patch.background, "background");
}

function validateOperationInput(document: CompositionDocument, value: unknown): CompositionOperationInput {
  const input = asRecord(value, "Composition operation");
  const kind = input.kind;
  if (kind === "document.replace") {
    exactKeys(input, ["kind", "frameId", "targetId", "document"], "document.replace operation");
    if (input.frameId !== "document" || input.targetId !== "composition") throw new Error("document.replace targets the composition root");
    validateReplacement(input.document);
  } else if (kind === "node.update") {
    exactKeys(input, ["kind", "frameId", "targetId", "patch"], "node.update operation");
    const frame = frameFor(document, identifier(input.frameId, "Frame id"));
    const targetId = identifier(input.targetId, "Node id");
    const current = frame.nodes.find((node) => node.id === targetId);
    if (!current) throw new Error(`Unknown node: ${targetId}`);
    if (current.locked) throw new Error(`Locked node: ${targetId}`);
    validateNodePatch(input.patch);
  } else if (kind === "node.add") {
    exactKeys(input, ["kind", "frameId", "targetId", "node"], "node.add operation");
    const frameId = identifier(input.frameId, "Frame id");
    frameFor(document, frameId);
    validateNode(input.node);
    const node = input.node as CompositionNode;
    if (input.targetId !== node.id) throw new Error("node.add target must match the node id");
    if (frameFor(document, frameId).nodes.length >= 200) throw new Error(`Frame ${frameId} cannot contain more than two hundred nodes`);
    if (document.frames.some((frame) => frame.nodes.some((current) => current.id === node.id))) throw new Error(`Duplicate node: ${node.id}`);
  } else if (kind === "node.remove") {
    exactKeys(input, ["kind", "frameId", "targetId"], "node.remove operation");
    const frame = frameFor(document, identifier(input.frameId, "Frame id"));
    const targetId = identifier(input.targetId, "Node id");
    const current = frame.nodes.find((node) => node.id === targetId);
    if (!current) throw new Error(`Unknown node: ${targetId}`);
    if (current.locked) throw new Error(`Locked node: ${targetId}`);
    if (frame.nodes.length <= 1) throw new Error(`Frame ${frame.id} must retain at least one node`);
  } else if (kind === "frame.update") {
    exactKeys(input, ["kind", "frameId", "targetId", "patch"], "frame.update operation");
    const frameId = identifier(input.frameId, "Frame id");
    frameFor(document, frameId);
    if (input.targetId !== frameId) throw new Error("frame.update target must match its frame id");
    validateFramePatch(input.patch);
  } else if (kind === "frame.add") {
    exactKeys(input, ["kind", "frameId", "targetId", "frame", "index"], "frame.add operation");
    validateFrame(input.frame);
    const frame = input.frame as CompositionFrame;
    if (input.frameId !== frame.id || input.targetId !== frame.id) throw new Error("frame.add target must match the frame id");
    if (document.frames.length >= 60) throw new Error("A composition cannot contain more than sixty frames");
    if (document.frames.some((current) => current.id === frame.id)) throw new Error(`Duplicate frame: ${frame.id}`);
    const existingNodeIds = new Set(document.frames.flatMap((current) => current.nodes.map((node) => node.id)));
    for (const node of frame.nodes) if (existingNodeIds.has(node.id)) throw new Error(`Duplicate node: ${node.id}`);
    if (input.index !== undefined) finiteNumber(input.index, "Frame index", 0, 60, true);
  } else if (kind === "frame.remove") {
    exactKeys(input, ["kind", "frameId", "targetId"], "frame.remove operation");
    const frameId = identifier(input.frameId, "Frame id");
    frameFor(document, frameId);
    if (input.targetId !== frameId) throw new Error("frame.remove target must match its frame id");
    if (document.frames.length <= 1) throw new Error("A composition must retain at least one frame");
  } else if (kind === "frame.reorder") {
    exactKeys(input, ["kind", "frameId", "targetId", "index"], "frame.reorder operation");
    const frameId = identifier(input.frameId, "Frame id");
    frameFor(document, frameId);
    if (input.targetId !== frameId) throw new Error("frame.reorder target must match its frame id");
    finiteNumber(input.index, "Frame index", 0, Math.max(0, document.frames.length - 1), true);
  } else if (kind === "contract.update") {
    exactKeys(input, ["kind", "frameId", "targetId", "patch"], "contract.update operation");
    if (input.frameId !== "document" || input.targetId !== "design-contract") throw new Error("contract.update targets the design contract root");
    const patch = asRecord(input.patch, "Design contract patch");
    if (!Object.keys(patch).length) throw new Error("Design contract patch requires one visible change");
    validateDesignContract(patch, true);
  } else {
    throw new Error(`Unsupported composition operation: ${String(kind)}`);
  }
  return input as unknown as CompositionOperationInput;
}

export function createCompositionOperation(
  document: CompositionDocument,
  input: CompositionOperationInput,
): CompositionOperation {
  const validated = validateOperationInput(document, input);
  const bytes = stableStringify({ documentId: document.id, baseVersion: document.version, ...validated });
  return { id: `cop-${fnv1a(bytes)}`, documentId: document.id, baseVersion: document.version, ...validated } as CompositionOperation;
}

export function createCompositionFromBrief(document: CompositionDocument, input: NewCompositionInput): Extract<CompositionOperation, { kind: "document.replace" }> {
  if (!["deck", "poster", "infographic"].includes(input.kind)) throw new Error("Unsupported composition kind");
  if (!input.brief.trim() || input.brief.length > 4000) throw new Error("A new composition requires a bounded creative brief");
  return createCompositionOperation(document, {
    kind: "document.replace",
    frameId: "document",
    targetId: "composition",
    document: replacementFromBrief(input),
  }) as Extract<CompositionOperation, { kind: "document.replace" }>;
}

/** Re-ground an untrusted client operation against the authoritative document. */
export function rebindCompositionOperation(document: CompositionDocument, value: unknown): CompositionOperation {
  const candidate = asRecord(value, "Composition operation");
  const id = candidate.id;
  const documentId = candidate.documentId;
  const baseVersion = candidate.baseVersion;
  const input = { ...candidate };
  delete input.id;
  delete input.documentId;
  delete input.baseVersion;
  const grounded = createCompositionOperation(document, input as CompositionOperationInput);
  if (id !== grounded.id || documentId !== grounded.documentId || baseVersion !== grounded.baseVersion) {
    throw new Error("Composition operation authority does not match the current document");
  }
  return grounded;
}

function applyCompositionOperationsUnchecked(document: CompositionDocument, operations: CompositionOperation[]): CompositionDocument {
  const next = structuredClone(document);
  for (const operation of operations) {
    if (operation.documentId !== document.id || operation.baseVersion !== document.version) {
      throw new Error("Operation is not bound to this document version");
    }
    if (operation.kind === "document.replace") {
      next.title = operation.document.title;
      next.kind = operation.document.kind;
      next.width = operation.document.width;
      next.height = operation.document.height;
      next.designContract = structuredClone(operation.document.designContract);
      next.frames = structuredClone(operation.document.frames);
      continue;
    }
    if (operation.kind === "contract.update") {
      next.designContract = {
        ...next.designContract,
        ...operation.patch,
        typeSystem: operation.patch.typeSystem ?? next.designContract.typeSystem,
      };
      continue;
    }
    if (operation.kind === "frame.add") {
      const index = Math.max(0, Math.min(operation.index ?? next.frames.length, next.frames.length));
      next.frames.splice(index, 0, structuredClone(operation.frame));
      continue;
    }
    const frameIndex = next.frames.findIndex((frame) => frame.id === operation.frameId);
    if (frameIndex < 0) throw new Error(`Unknown frame: ${operation.frameId}`);
    if (operation.kind === "frame.remove") {
      if (next.frames.length <= 1) throw new Error("A composition must retain at least one frame");
      next.frames.splice(frameIndex, 1);
      continue;
    }
    if (operation.kind === "frame.reorder") {
      const [frame] = next.frames.splice(frameIndex, 1);
      next.frames.splice(Math.max(0, Math.min(operation.index, next.frames.length)), 0, frame!);
      continue;
    }
    if (operation.kind === "frame.update") {
      next.frames[frameIndex] = { ...next.frames[frameIndex]!, ...operation.patch };
      continue;
    }
    const frame = next.frames[frameIndex]!;
    const nodeIndex = frame.nodes.findIndex((node) => node.id === operation.targetId);
    if (operation.kind === "node.add") {
      frame.nodes.push(structuredClone(operation.node));
    } else if (operation.kind === "node.remove") {
      if (nodeIndex < 0) throw new Error(`Unknown node: ${operation.targetId}`);
      frame.nodes.splice(nodeIndex, 1);
    } else {
      if (nodeIndex < 0) throw new Error(`Unknown node: ${operation.targetId}`);
      const node = frame.nodes[nodeIndex]!;
      frame.nodes[nodeIndex] = {
        ...node,
        ...operation.patch,
        style: operation.patch.style ? { ...node.style, ...operation.patch.style } : node.style,
      };
    }
  }
  next.updatedAt = isoNow();
  validateCompositionDocument(next);
  return next;
}

function visibleCompositionState(document: CompositionDocument) {
  return {
    title: document.title,
    kind: document.kind,
    width: document.width,
    height: document.height,
    designContract: document.designContract,
    frames: document.frames,
  };
}

function compositionHasVisibleChange(before: CompositionDocument, after: CompositionDocument) {
  return stableStringify(visibleCompositionState(before)) !== stableStringify(visibleCompositionState(after));
}

function rebindOrderedCompositionOperations(document: CompositionDocument, values: unknown[], maximum: number): CompositionOperation[] {
  if (!Array.isArray(values) || !values.length || values.length > maximum) throw new Error(`A composition change requires between one and ${maximum} operations`);
  let working = structuredClone(document);
  const grounded: CompositionOperation[] = [];
  for (const value of values) {
    const operation = rebindCompositionOperation(working, value);
    grounded.push(operation);
    working = applyCompositionOperationsUnchecked(working, [operation]);
  }
  return grounded;
}

/** Re-ground a complete ordered batch against each preceding operation. */
export function rebindCompositionOperations(document: CompositionDocument, values: unknown[]): CompositionOperation[] {
  return rebindOrderedCompositionOperations(document, values, 32);
}

function withoutOperationAuthority(operation: CompositionOperation): CompositionOperationInput {
  const input = { ...operation } as Record<string, unknown>;
  delete input.id;
  delete input.documentId;
  delete input.baseVersion;
  return input as unknown as CompositionOperationInput;
}

function mergeAdjacentPreviewUpdates(left: CompositionOperationInput, right: CompositionOperationInput): CompositionOperationInput | null {
  if (left.kind === "node.update" && right.kind === "node.update" && left.frameId === right.frameId && left.targetId === right.targetId) {
    return {
      ...right,
      patch: {
        ...left.patch,
        ...right.patch,
        style: left.patch.style || right.patch.style ? { ...left.patch.style, ...right.patch.style } : undefined,
      },
    };
  }
  if (left.kind === "frame.update" && right.kind === "frame.update" && left.frameId === right.frameId) {
    return { ...right, patch: { ...left.patch, ...right.patch } };
  }
  if (left.kind === "contract.update" && right.kind === "contract.update") {
    return { ...right, patch: { ...left.patch, ...right.patch } };
  }
  return null;
}

/** Collapse repeated adjacent tuning updates without changing their visible result. */
export function compactCompositionOperations(document: CompositionDocument, values: unknown[]): CompositionOperation[] {
  const validated = rebindOrderedCompositionOperations(document, values, 256);
  const compacted: CompositionOperationInput[] = [];
  for (const operation of validated) {
    const input = withoutOperationAuthority(operation);
    const previous = compacted.at(-1);
    const merged = previous ? mergeAdjacentPreviewUpdates(previous, input) : null;
    if (merged) compacted[compacted.length - 1] = merged;
    else compacted.push(input);
  }
  if (compacted.length > 32) throw new Error("This Exploring direction is too large to Keep safely. Keep or discard it before continuing.");
  let working = structuredClone(document);
  return compacted.map((input) => {
    const operation = createCompositionOperation(working, input);
    working = applyCompositionOperationsUnchecked(working, [operation]);
    return operation;
  });
}

/** Ground preview-safe unbound inputs against the live ordered document. */
export function groundCompositionOperationInputs(document: CompositionDocument, values: unknown[]): CompositionOperation[] {
  if (!Array.isArray(values) || !values.length || values.length > 32) throw new Error("A composition preview requires between one and thirty-two operations");
  let working = structuredClone(document);
  const grounded: CompositionOperation[] = [];
  for (const value of values) {
    const candidate = asRecord(value, "Composition operation input");
    if (["id", "documentId", "baseVersion"].some((key) => key in candidate)) throw new Error("Preview inputs must not supply operation authority");
    if (!["node.update", "frame.update", "contract.update"].includes(String(candidate.kind))) throw new Error("This operation is not exposed to preview agents");
    const operation = createCompositionOperation(working, candidate as CompositionOperationInput);
    grounded.push(operation);
    working = applyCompositionOperationsUnchecked(working, [operation]);
  }
  return grounded;
}

export function applyCompositionOperations(
  document: CompositionDocument,
  operations: CompositionOperation[],
): CompositionDocument {
  return applyCompositionOperationsUnchecked(document, rebindCompositionOperations(document, operations));
}

export function createCompositionDraft(
  document: CompositionDocument,
  sourceTurnId: string,
  summary: string,
  operations: CompositionOperation[],
): CompositionDraft {
  if (!operations.length) throw new Error("A draft requires at least one visible operation");
  boundedString(sourceTurnId, "Draft source turn", 120);
  const normalizedSummary = boundedString(summary.trim(), "Draft summary", 240);
  const grounded = rebindCompositionOperations(document, operations);
  const preview = applyCompositionOperationsUnchecked(document, grounded);
  if (!compositionHasVisibleChange(document, preview)) throw new Error("An Exploring draft must contain a visible change");
  const bytes = stableStringify({ sourceTurnId, summary: normalizedSummary, baseVersion: document.version, operations: grounded });
  return {
    id: `draft-${fnv1a(bytes)}`,
    sourceTurnId,
    summary: normalizedSummary,
    status: "exploring",
    baseVersion: document.version,
    operations: grounded,
    preview,
    createdAt: isoNow(),
  };
}

/**
 * Continue shaping one Exploring branch while the kept document remains
 * untouched underneath it. New operations are grounded against the current
 * preview, but the full branch stays bound to the kept base version.
 */
export function extendCompositionDraft(
  document: CompositionDocument,
  current: CompositionDraft,
  sourceTurnId: string,
  summary: string,
  operations: CompositionOperation[],
): CompositionDraft {
  if (current.status !== "exploring" || current.baseVersion !== document.version) {
    throw new Error("Stale draft cannot be refined against current work");
  }
  if (!operations.length) throw new Error("A refinement requires at least one visible operation");
  if (operations.some((operation) => operation.documentId !== document.id || operation.baseVersion !== document.version)) {
    throw new Error("Refinement operations are not bound to the kept document version");
  }
  const compacted = compactCompositionOperations(document, [...current.operations, ...operations]);
  return createCompositionDraft(
    document,
    sourceTurnId,
    summary,
    compacted,
  );
}

export function keepCompositionDraft(document: CompositionDocument, draft: CompositionDraft) {
  if (draft.status !== "exploring" || draft.baseVersion !== document.version) {
    throw new Error("Stale draft cannot overwrite current work");
  }
  const keptAt = isoNow();
  const preview = applyCompositionOperations(document, draft.operations);
  if (!compositionHasVisibleChange(document, preview)) throw new Error("A no-op draft cannot create a kept revision");
  const next: CompositionDocument = { ...preview, version: document.version + 1, updatedAt: keptAt };
  const affectedFrameIds = [...new Set(draft.operations.flatMap((operation) => operation.kind === "document.replace" ? operation.document.frames.map((frame) => frame.id) : operation.frameId === "document" ? [] : [operation.frameId]))];
  const affectedNodeIds = [...new Set(draft.operations.flatMap((operation) => operation.kind.startsWith("node.") ? [operation.targetId] : []))];
  const receipt: CompositionReceipt = {
    id: `receipt-${fnv1a(stableStringify({ draftId: draft.id, keptAt, afterVersion: next.version }))}`,
    draftId: draft.id,
    summary: draft.summary,
    beforeVersion: document.version,
    afterVersion: next.version,
    operations: draft.operations,
    affectedFrameIds,
    affectedNodeIds,
    keptAt,
  };
  return { document: next, receipt };
}

export async function compositionOperationDigest(operations: CompositionOperation[]) {
  const bytes = new TextEncoder().encode(stableStringify(operations));
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return `sha256-${Array.from(new Uint8Array(digest)).map((byte) => byte.toString(16).padStart(2, "0")).join("")}`;
}

function selectedNodes(document: CompositionDocument, frameId: string, selectedNodeIds: string[]) {
  const frame = frameFor(document, frameId);
  const exact = frame.nodes.filter((node) => selectedNodeIds.includes(node.id));
  return exact.length ? exact : frame.nodes.filter((node) => node.role === "title");
}

export function planCompositionTurn(document: CompositionDocument, input: {
  transcript: string;
  selectedFrameId: string;
  selectedNodeIds: string[];
}) {
  const transcript = input.transcript.trim();
  if (!transcript) return [];
  const targets = selectedNodes(document, input.selectedFrameId, input.selectedNodeIds);
  const operations: CompositionOperation[] = [];
  for (const node of targets) {
    const patch: NodePatch = {};
    const stylePatch: Partial<CompositionNodeStyle> = {};
    if (/\b(?:quieter|smaller|less prominent|dial (?:it )?back)\b/i.test(transcript)) {
      stylePatch.fontSize = Math.max(12, Math.round(node.style.fontSize * 0.84));
      stylePatch.fontWeight = Math.max(350, node.style.fontWeight - 80);
    }
    if (/\b(?:larger|bigger|louder|more prominent)\b/i.test(transcript)) {
      stylePatch.fontSize = Math.min(220, Math.round(node.style.fontSize * 1.16));
      stylePatch.fontWeight = Math.min(800, node.style.fontWeight + 60);
    }
    if (/\b(?:editorial|serif|literary)\b/i.test(transcript)) stylePatch.fontFamily = "serif";
    if (/\b(?:modern|clean|sans)\b/i.test(transcript)) stylePatch.fontFamily = "sans";
    if (/\b(?:center|centred|centered)\b/i.test(transcript)) stylePatch.textAlign = "center";
    if (/\b(?:coral|proof red|orange red)\b/i.test(transcript)) stylePatch.color = "#F04B32";
    if (/\b(?:black|carbon)\b/i.test(transcript)) stylePatch.color = "#191816";
    const replacement = transcript.match(/\b(?:say|read|replace (?:it|this|the text) with)\s+["“]?(.+?)["”]?\s*$/i)?.[1];
    if (replacement) patch.content = replacement.replace(/["”]$/, "").trim().slice(0, 4000);
    if (Object.keys(stylePatch).length) patch.style = stylePatch;
    if (Object.keys(patch).length) operations.push(createCompositionOperation(document, {
      kind: "node.update",
      frameId: input.selectedFrameId,
      targetId: node.id,
      patch,
    }));
  }
  if (/\b(?:warmer|warm paper)\b/i.test(transcript)) {
    operations.push(createCompositionOperation(document, {
      kind: "frame.update",
      frameId: input.selectedFrameId,
      targetId: input.selectedFrameId,
      patch: { background: "#F3EFE5" },
    }));
  }
  if (/\b(?:dark|night)\b/i.test(transcript)) {
    operations.push(createCompositionOperation(document, {
      kind: "frame.update",
      frameId: input.selectedFrameId,
      targetId: input.selectedFrameId,
      patch: { background: "#191816" },
    }));
  }
  if (/\b(?:less copy|shorter|more concise)\b/i.test(transcript)) {
    const frame = frameFor(document, input.selectedFrameId);
    for (const node of frame.nodes.filter((candidate) => candidate.role === "body" && !targets.some((target) => target.id === candidate.id))) {
      const concise = (node.content ?? "").split(/[.!?]/)[0]?.trim();
      if (concise && concise !== node.content) operations.push(createCompositionOperation(document, {
        kind: "node.update",
        frameId: frame.id,
        targetId: node.id,
        patch: { content: `${concise}.` },
      }));
    }
  }
  return operations.filter((operation, index, all) => all.findIndex((candidate) => candidate.id === operation.id) === index);
}
