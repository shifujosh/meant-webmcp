"use client";

/* eslint-disable @next/next/no-img-element -- external editorial reference is intentionally rendered without optimization */

import {
  Aperture,
  Braces,
  Check,
  ChevronDown,
  ChevronRight,
  Command,
  FileImage,
  Globe2,
  Hand,
  History,
  Layers3,
  ListTree,
  LocateFixed,
  Mic,
  MicOff,
  Minus,
  Moon,
  MousePointer2,
  Network,
  Plus,
  RotateCcw,
  Settings2,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  Sun,
  UserRound,
  WandSparkles,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  AppliedOperation,
  CanonicalAppliedOperation,
  CanonicalOperation,
  CanonicalProperty,
  CommittedChange,
  ArtifactKind,
  ArtifactNode,
  CapabilityManifest,
  ChangeSet,
  CreativeArtifact,
  DesignPlan,
  DesignOperation,
  EvidenceItem,
  EvidenceKind,
  ExpressionPacket,
  InstrumentId,
  InterpretationPath,
  IntentScope,
  NodePrimitives,
  ProvenanceEvent,
  RenderSnapshot,
  SemanticNodeKind,
  StudioProject,
} from "@/lib/ghosa/contracts";
import { actionStyle, controlMetrics, formatControlValue, mediaFilter, textStyle } from "@/lib/ghosa/control-effects";
import { resolveContextualFollowUp } from "@/lib/ghosa/conversation";
import { normalizeDesignOperations, protectedControlsForGraph, protectedControlsForText } from "@/lib/ghosa/design-graph";
import { applyOperations, interpretExpression, resolveNodeValues, suggestedControlForLanguage } from "@/lib/ghosa/intent";
import { executablePropertiesForNode, type ExpressionSurface } from "@/lib/ghosa/operation-registry";
import { applyCanonicalOperations } from "@/lib/ghosa/transaction-core";
import { capabilityManifests, seedProject } from "@/lib/ghosa/seed";
import { createWebMcpTools, type CommandSurface } from "@/lib/ghosa/webmcp";

const PHOTO_URL =
  "https://images.unsplash.com/photo-1756132540944-ad87ca91f358?auto=format&fit=crop&fm=jpg&q=82&w=1800";
const THEME_STORAGE_KEY = "meant-studio-theme";
const WORKSPACE_STORAGE_KEY = "meant-bobalicious-workspace-v1";
const LEGACY_THEME_STORAGE_KEY = "ghosa-studio-theme";
const LEGACY_WORKSPACE_STORAGE_KEY = "ghosa-bobalicious-workspace-v1";

const uid = (prefix: string) =>
  `${prefix}-${typeof crypto !== "undefined" && crypto.randomUUID ? crypto.randomUUID() : Date.now()}`;

const now = () => new Date().toISOString();

const event = (
  type: ProvenanceEvent["type"],
  label: string,
  detail: string,
): ProvenanceEvent => ({ id: uid("event"), type, label, detail, createdAt: now() });

function artifactIcon(kind: ArtifactKind) {
  if (kind === "web") return Globe2;
  if (kind === "graphic") return Layers3;
  return Aperture;
}

const semanticKindLabels: Record<SemanticNodeKind, string> = {
  composition: "Artboard",
  group: "Group",
  text: "Text",
  action: "Button",
  image: "Image",
  shape: "Shape",
  background: "Background",
  effect: "Effect",
  decoration: "Decoration",
};

function semanticIcon(kind: SemanticNodeKind) {
  if (kind === "text") return <Command />;
  if (kind === "image") return <Aperture />;
  if (kind === "action") return <MousePointer2 />;
  if (kind === "composition" || kind === "group") return <ListTree />;
  return <Layers3 />;
}

const primitiveGroups = ["Emphasis", "Type", "Color", "Layout", "Shape", "Image", "Effects"] as const;

function primitiveGroupForInstrument(control: InstrumentId): (typeof primitiveGroups)[number] {
  if (control === "typeScale") return "Type";
  if (["warmth", "contrast", "accentStrength", "saturation"].includes(control)) return "Color";
  if (control === "spacing") return "Layout";
  if (control === "cornerRadius") return "Shape";
  if (control === "cropScale") return "Image";
  if (["softness", "surfaceDepth"].includes(control)) return "Effects";
  return "Emphasis";
}

type DirectPrimitive = "content" | "fill" | "alignment" | "direction";
type OperationInput = DesignOperation | {
  artifactId: string;
  targetIds: string[];
  property: CanonicalProperty;
  value: string | number;
};

export function directPrimitivesForNode(node?: ArtifactNode): DirectPrimitive[] {
  return node ? executablePropertiesForNode(node).filter((property): property is DirectPrimitive =>
    ["content", "fill", "alignment", "direction"].includes(property),
  ) : [];
}

const nodeContent: Record<string, string> = {
  "web-wordmark": "BOBALICIOUS",
  "web-nav-menu": "Menu",
  "web-nav-locations": "Locations",
  "web-nav-story": "Our story",
  "web-eyebrow": "Made fresh. Shaken happy.",
  "web-headline": "Joy, with\nextra pearls.",
  "web-supporting-copy": "Big flavor, chewy pearls, made fresh for your kind of day.",
  "web-primary-action": "Order a favorite",
  "web-secondary-action": "Build your own",
  "web-footer-location": "Freshly shaken in New York",
  "web-footer-flavors": "Mango · Matcha · Brown sugar",
  "graphic-index": "BOBALICIOUS · SUMMER DROP",
  "graphic-kicker": "Mango meets matcha",
  "graphic-headline": "Mango.\nMatcha.\nMadness.",
  "graphic-footer-flavor": "Bright mango. Smooth matcha.",
  "graphic-footer-availability": "Peach available now.",
  "photo-caption-label": "Bobalicious editorial 01",
  "photo-attribution": "Photo: Najib Chari · Unsplash",
};

const brandSwatches = ["#3A241C", "#F46666", "#FFB547", "#86A96B", "#FFF1D6"];

export function fillIntent(text: string) {
  const explicitHex = text.match(/#[0-9a-f]{6}\b|#[0-9a-f]{3}\b/i)?.[0];
  if (explicitHex) return explicitHex;
  const named: Array<[RegExp, string]> = [
    [/\bcoral\b/i, "#F46666"],
    [/\bmango\b/i, "#FFB547"],
    [/\bmatcha\b/i, "#86A96B"],
    [/\b(?:cream|bone)\b/i, "#FFF1D6"],
    [/\b(?:espresso|brown)\b/i, "#3A241C"],
    [/\bwhite\b/i, "#FFFFFF"],
    [/\bblack\b/i, "#111111"],
    [/\bnavy\b/i, "#1E3A5F"],
    [/\bblue\b/i, "#2563EB"],
    [/\bteal\b/i, "#0F766E"],
    [/\bgreen\b/i, "#2F7D4A"],
    [/\byellow\b/i, "#EAB308"],
    [/\borange\b/i, "#EA7A21"],
    [/\bred\b/i, "#DC3F45"],
    [/\bpink\b/i, "#DB4F83"],
    [/\bpurple\b/i, "#7657D6"],
    [/\b(?:gray|grey)\b/i, "#667085"],
  ];
  return named.find(([pattern]) => pattern.test(text))?.[1];
}

export type InstantLanguageDisposition = "execute" | "advice" | "preserve" | "unsupported";

/**
 * Protect the instant path from accidentally treating questions, preservation
 * constraints, or unsupported low-level typography requests as edits.
 */
export function instantLanguageDisposition(text: string): InstantLanguageDisposition {
  const trimmed = text.trim();
  const actionRequest =
    /^(?:please\s+)?(?:make|change|fix|adjust|set|replace|increase|decrease|add|remove|apply|improve|darken|brighten)\b/i.test(trimmed) ||
    /\b(?:can|could|would)\s+you\s+(?:please\s+)?(?:change|fix|adjust|make|set|replace|increase|decrease|add|remove|apply|improve|darken|brighten)\b/i.test(trimmed) ||
    /\bcan\s+(?:this|that|it)\s+be\s+(?:changed|fixed|adjusted|improved)\b/i.test(trimmed);
  if (
    /^(?:please\s+)?(?:do not|don't|never)\s+(?:make|change|set|replace|increase|decrease|add|remove|apply)\b/i.test(trimmed) ||
    /\b(?:keep|leave|preserve)\b.*\b(?:unchanged|as is|the same|current)\b/i.test(trimmed)
  ) {
    return "preserve";
  }
  if (/\b(?:letter spacing|tracking|kerning|font family|typeface|gradient|stroke width|border width)\b/i.test(trimmed)) {
    return "unsupported";
  }
  if (!actionRequest && (/^(?:would|should|is|are|do|does|what if|which|why|how)\b/i.test(trimmed) || /\?\s*$/.test(trimmed))) {
    return "advice";
  }
  return "execute";
}

/** Natural readability complaints are edit requests even when phrased as questions. */
export function isReadabilityRequest(text: string) {
  return /\b(?:unreadable|illegible|low[- ]contrast)\b/i.test(text) ||
    /\b(?:can(?:not|'t)|could(?: not|n't)|hard|difficult)\b[^.!?]{0,48}\b(?:read|see|make out)\b/i.test(text) ||
    /\b(?:text|copy|caption|label|headline|heading|title)\b[^.!?]{0,48}\b(?:blend(?:s|ed)? into|disappear(?:s|ed)? (?:into|against)|lost (?:on|against))\b/i.test(text);
}

/** Remove preservation clauses from an otherwise actionable instruction. */
export function actionableLanguage(text: string) {
  return text
    .replace(/[,.]?\s+(?:(?:but|and)\s+)?(?:without\s+(?:changing|making|altering|affecting)|while keeping|keep|leave|don't|do not)\b.*$/i, "")
    .trim();
}

export function fillCommandsForLanguage(text: string) {
  const clauses = text.split(/\s+(?:and|then)\s+/i).map((clause) => clause.trim()).filter(Boolean);
  const compound = clauses
    .map((transcript) => ({ transcript, fill: fillIntent(transcript) }))
    .filter((command): command is { transcript: string; fill: string } => Boolean(command.fill) && hasSemanticTargetLanguage(command.transcript));
  const distinctFills = new Set(compound.map((command) => command.fill));
  if (compound.length >= 2 && distinctFills.size >= 2) return compound;
  const fill = fillIntent(text);
  return fill ? [{ transcript: text, fill }] : [];
}

export function fillTargetsForLanguage(
  artifact: CreativeArtifact,
  transcript: string,
  anchoredIds: string[],
) {
  return semanticTargetsForLanguage(artifact, transcript, anchoredIds, "fill");
}

export function hasSemanticTargetLanguage(text: string) {
  return /\b(?:headline|heading|title|supporting copy|body copy|body text|subhead|wordmark|logo|buttons?|actions?|button group|call to action|cta|navigation|nav|header|footer|background|caption|eyebrow|kicker|label|photo|image|visual|subject|note|list|credit|link|vignette|field|wash|halo|wave|cluster|drink|frame)\b/i.test(text);
}

export function refersToSelectedLayer(text: string) {
  return /\b(?:it|this|that|selected|same|font|text color|copy color|its)\b/i.test(text);
}

export function semanticTargetsForLanguage(
  artifact: CreativeArtifact,
  transcript: string,
  anchoredIds: string[],
  primitive?: DirectPrimitive,
) {
  const supportsPrimitive = (node: ArtifactNode) => !primitive || directPrimitivesForNode(node).includes(primitive);
  const normalizePhrase = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  const language = ` ${normalizePhrase(transcript)} `;
  const namedTargets = artifact.nodes.filter((node) => {
    if (!supportsPrimitive(node)) return false;
    const names = [node.name, node.role]
      .map(normalizePhrase)
      .filter((phrase) => phrase.split(" ").length > 1 || phrase.length >= 7);
    return names.some((phrase) => language.includes(` ${phrase} `));
  });
  const hasCompoundTarget = /\b(?:and|plus|along with)\b/i.test(transcript);
  if (namedTargets.length && !hasCompoundTarget) return namedTargets.map((node) => node.id);

  const aliases: Array<[RegExp, (node: ArtifactNode) => boolean]> = [
    [/\b(?:headline|heading|title)\b/i, (node) => node.id.includes("headline")],
    [/\b(?:supporting copy|body copy|body text|subhead)\b/i, (node) => node.id.includes("supporting-copy")],
    [/\b(?:wordmark|logo)\b/i, (node) => node.id.includes("wordmark")],
    [/\b(?:buttons|actions|button group)\b/i, (node) => node.id.includes("actions") || node.kind === "action"],
    [/\b(?:button|call to action|cta)\b/i, (node) => node.kind === "action"],
    [/\b(?:navigation|nav)\b/i, (node) => node.id.includes("navigation") || node.id.includes("nav-")],
    [/\bheader\b/i, (node) => node.id.includes("header")],
    [/\bfooter\b/i, (node) => node.id.includes("footer")],
    [/\bbackground\b/i, (node) => node.kind === "background"],
    [/\bcaption\b/i, (node) => node.id.includes("caption") || node.id.includes("attribution")],
    [/\b(?:eyebrow|kicker|label)\b/i, (node) => /eyebrow|kicker|label/.test(node.id)],
    [/\b(?:photo|image|visual)\b/i, (node) => node.kind === "image"],
    [/\bsubject\b/i, (node) => node.id.includes("subject")],
  ];
  const explicitMatchers = aliases
    .filter(([pattern]) => pattern.test(transcript))
    .map(([, matcher]) => matcher);
  const explicitTargets = explicitMatchers.length
    ? artifact.nodes.filter((node) => explicitMatchers.some((matcher) => matcher(node)) && supportsPrimitive(node))
    : [];
  if (namedTargets.length && hasCompoundTarget) {
    return [...new Set([...namedTargets, ...explicitTargets].map((node) => node.id))];
  }
  if (explicitTargets.length) {
    // If one object class is named and the current selection belongs to it,
    // prefer that exact object ("make the button blue"). If multiple classes
    // are named, honor the full compound target ("headline and button").
    const selectedMatches = explicitTargets.filter((node) => anchoredIds.includes(node.id));
    if (explicitMatchers.length === 1 && selectedMatches.length) return selectedMatches.map((node) => node.id);
    if (
      explicitMatchers.length === 1 &&
      explicitTargets.length > 1 &&
      /\b(?:button|call to action|cta|caption)\b/i.test(transcript) &&
      !/\b(?:buttons|actions|captions)\b/i.test(transcript)
    ) {
      return [];
    }
    return explicitTargets.map((node) => node.id);
  }
  return artifact.nodes
    .filter((node) => anchoredIds.includes(node.id) && supportsPrimitive(node))
    .map((node) => node.id);
}

export function contextualTargetIds(
  artifact: CreativeArtifact,
  transcript: string,
  scope: IntentScope,
  anchorArtifactId: string,
  anchorTargetIds: string[],
  primitive?: DirectPrimitive,
) {
  const anchoredIds = artifact.id === anchorArtifactId ? anchorTargetIds : [];
  const supportsPrimitive = (id: string) =>
    !primitive || directPrimitivesForNode(artifact.nodes.find((node) => node.id === id)).includes(primitive);
  if (scope === "element" || scope === "region") return anchoredIds.filter(supportsPrimitive);
  const explicitIds = semanticTargetsForLanguage(artifact, transcript, anchoredIds, primitive);
  if (explicitIds.length) return explicitIds;
  if (scope === "artifact" && refersToSelectedLayer(transcript)) return anchoredIds.filter(supportsPrimitive);
  return [];
}

type PrimitiveLanguageChange = {
  primitive: Exclude<DirectPrimitive, "fill">;
  value: string;
};

function cleanReplacementText(value: string) {
  return value.trim().replace(/^["“']|["”']$/g, "").trim().slice(0, 240);
}

export function primitiveChangeForLanguage(text: string): PrimitiveLanguageChange | undefined {
  const saidText = text.match(/\b(?:make|have)\s+(?:(?:the\s+)?(?:headline|heading|title|button|caption|label|eyebrow|kicker|wordmark|logo|photo credit|editorial label|availability note|flavor note|location note|flavor list|menu link|locations link|our story link)|this layer|selected layer)\s+(?:say|read)\s+(.+)$/i)?.[1];
  const changedText = text.match(/\b(?:change|replace|set|update)\s+(?:(?:(?:the\s+)?(?:headline|heading|title|button|caption|label|eyebrow|kicker|wordmark|logo|supporting|body|photo credit|editorial label|availability note|flavor note|location note|flavor list|menu link|locations link|our story link)|this layer|selected layer)\s+)?(?:text|copy|wording|label)\s+(?:to|with)\s+(.+)$/i)?.[1];
  const quotedText = text.match(/\b(?:change|replace|set|update)\s+(?:the\s+)?(?:headline|heading|title|button|caption|label|eyebrow|kicker|wordmark|logo|photo credit|editorial label|availability note|flavor note|location note|flavor list|menu link|locations link|our story link)\s+(?:to|with)\s+["“'](.+?)["”']\s*$/i)?.[1];
  const content = cleanReplacementText(saidText ?? changedText ?? quotedText ?? "");
  if (content) return { primitive: "content", value: content };
  if (/\b(?:align|aligned|alignment|center|centre)\b/i.test(text)) {
    if (/\b(?:left|start)\b/i.test(text)) return { primitive: "alignment", value: "start" };
    if (/\b(?:center|centre|middle)\b/i.test(text)) return { primitive: "alignment", value: "center" };
    if (/\b(?:right|end)\b/i.test(text)) return { primitive: "alignment", value: "end" };
  }
  if (/\b(?:stack|stacked|vertical|vertically)\b/i.test(text)) return { primitive: "direction", value: "column" };
  if (/\b(?:horizontal|horizontally|across|side by side|in a row)\b/i.test(text)) return { primitive: "direction", value: "row" };
  return undefined;
}

function primitivesFor(artifact: CreativeArtifact, nodeId: string): NodePrimitives {
  return artifact.nodes.find((node) => node.id === nodeId)?.primitives ?? {};
}

function contentFor(artifact: CreativeArtifact, nodeId: string): string {
  return primitivesFor(artifact, nodeId).content ?? nodeContent[nodeId] ?? "";
}

function alignmentStyle(primitives: NodePrimitives): React.CSSProperties {
  const map = { start: "left", center: "center", end: "right" } as const;
  const textShadow = primitives.legibilityEdge === "dark"
    ? "0 1px 2px rgba(35,20,15,.9), 0 0 5px rgba(35,20,15,.72)"
    : primitives.legibilityEdge === "light"
      ? "0 1px 2px rgba(255,247,230,.92), 0 0 5px rgba(255,247,230,.7)"
      : undefined;
  return {
    ...(primitives.alignment ? { textAlign: map[primitives.alignment] } : {}),
    ...(textShadow ? { textShadow } : {}),
  };
}

function layoutStyle(primitives: NodePrimitives): React.CSSProperties {
  const alignItems = primitives.alignment === "start" ? "flex-start" : primitives.alignment === "end" ? "flex-end" : primitives.alignment;
  return {
    ...(primitives.direction ? { flexDirection: primitives.direction } : {}),
    ...(alignItems ? { alignItems, justifyContent: alignItems } : {}),
  };
}

function emphasisLabel(node: ArtifactNode) {
  if (node.kind === "text") return "Importance";
  if (node.kind === "action") return "Button importance";
  if (node.kind === "image") return node.role.includes("subject") ? "Subject emphasis" : "Image emphasis";
  if (node.kind === "effect") return "Focus area";
  if (node.kind === "group" || node.kind === "composition") return "Section importance";
  return "Visual presence";
}

function instrumentCopy(node: ArtifactNode | undefined, instrument: CapabilityManifest["instruments"][number]) {
  if (!node) {
    return instrument.id === "focalStrength"
      ? { ...instrument, label: "Overall emphasis" }
      : instrument;
  }
  const labels: Partial<Record<InstrumentId, string>> = {
    typeScale: node.kind === "text" || node.kind === "action" ? "Text size" : "Type scale",
    spacing: node.kind === "text" ? "Text spacing" : node.kind === "action" ? "Padding" : node.kind === "decoration" ? "Spread" : "Gap",
    focalStrength: emphasisLabel(node),
    softness: node.kind === "effect" ? "Feather" : "Blur",
    surfaceDepth: node.kind === "effect" ? "Effect depth" : "Shadow depth",
    cornerRadius: "Corner roundness",
    accentStrength: node.kind === "background" || node.kind === "shape" ? "Fill strength" : "Color strength",
    cropScale: "Crop / zoom",
    warmth: "Temperature",
    saturation: "Color intensity",
    contrast: node.kind === "text" ? "Legibility" : "Contrast",
  };
  return { ...instrument, label: labels[instrument.id] ?? instrument.label };
}

function scopePresentation(
  scope: IntentScope,
  projectName: string,
  artifactName: string,
  selectedName?: string,
) {
  if (scope === "project") {
    return {
      category: "Campaign",
      target: "All designs",
      voice: `Campaign · ${projectName}`,
      review: "Across the campaign",
    };
  }
  if (scope === "element" || scope === "region") {
    const target = selectedName ?? artifactName;
    return {
      category: "Layer",
      target,
      voice: `This layer · ${target}`,
      review: `Only ${target}`,
    };
  }
  return {
    category: "Design",
    target: artifactName,
    voice: `This design · ${artifactName}`,
    review: `This design · ${artifactName}`,
  };
}

function emphasisChoices(node?: ArtifactNode) {
  if (node?.kind === "effect") {
    return [
      { label: "Wide", value: 20 },
      { label: "Balanced", value: 50 },
      { label: "Tight", value: 85 },
    ];
  }
  return [
    { label: "Supporting", value: 20 },
    { label: "Balanced", value: 50 },
    { label: "Lead", value: 85 },
  ];
}

function nearestEmphasis(value: number, choices: ReturnType<typeof emphasisChoices>) {
  return choices.reduce((nearest, choice) =>
    Math.abs(choice.value - value) < Math.abs(nearest.value - value) ? choice : nearest,
  choices[0]);
}

function instrumentEndpoints(control: InstrumentId): [string, string] {
  const endpoints: Partial<Record<InstrumentId, [string, string]>> = {
    typeScale: ["Smaller", "Larger"],
    warmth: ["Cooler", "Warmer"],
    contrast: ["Softer", "Stronger"],
    spacing: ["Tighter", "More open"],
    focalStrength: ["Quieter", "More prominent"],
    softness: ["Crisper", "Softer"],
    surfaceDepth: ["Flat", "Layered"],
    cornerRadius: ["Sharper", "Rounder"],
    accentStrength: ["Subtle", "Bolder"],
    saturation: ["Muted", "Vivid"],
    cropScale: ["Wider", "Closer"],
  };
  return endpoints[control] ?? ["Less", "More"];
}

function timeLabel(value: string) {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function humanizeControl(control: InstrumentId) {
  return capabilityManifests.web.instruments
    .concat(capabilityManifests.graphic.instruments, capabilityManifests.photo.instruments)
    .find((instrument) => instrument.id === control)?.label ?? control;
}

function reviewOperation(
  operation: DesignOperation | AppliedOperation | CanonicalOperation | CanonicalAppliedOperation,
  artifact?: CreativeArtifact,
  target?: ArtifactNode,
  baselineOverride?: number | string,
) {
  if ("property" in operation) {
    const label = operation.property === "content" ? "Text" : operation.property === "fill" ? "Color" : operation.property === "alignment" ? "Alignment" : operation.property === "direction" ? "Layout" : humanizeControl(operation.property);
    return {
      label,
      direction: "Set exactly",
      value: typeof operation.value === "number" ? formatControlValue(operation.property as InstrumentId, operation.value) : operation.value,
    };
  }
  const baseline = baselineOverride ?? (artifact
    ? target
      ? resolveNodeValues(artifact, target.id)[operation.control]
      : artifact.values[operation.control]
    : 50);
  const instrument = artifact
    ? capabilityManifests[artifact.kind].instruments.find((item) => item.id === operation.control)
    : undefined;
  const label = instrument ? instrumentCopy(target, instrument).label : humanizeControl(operation.control);
  const [less, more] = instrumentEndpoints(operation.control);
  const numericBaseline = typeof baseline === "number" ? baseline : 50;
  const direction = operation.value === numericBaseline ? "Set" : operation.value > numericBaseline ? more : less;

  return {
    label,
    direction,
    value: formatControlValue(operation.control, operation.value),
  };
}

function balancedMeaningPaths(paths: InterpretationPath[], limit = 6) {
  const selected: InterpretationPath[] = [];
  for (const kind of ["web", "graphic", "photo"] as const) {
    const path = paths.find((candidate) => candidate.artifactKind === kind);
    if (path) selected.push(path);
  }
  for (const path of paths) {
    if (selected.length >= limit) break;
    if (!selected.some((candidate) => candidate.id === path.id && candidate.operator === path.operator)) selected.push(path);
  }
  return selected;
}

const artifactKindLabel: Record<ArtifactKind, string> = {
  web: "Web",
  graphic: "Social",
  photo: "Photo",
};

export function suggestedOperations(
  packet: ExpressionPacket,
  artifacts: CreativeArtifact[],
): DesignOperation[] {
  const transcript = packet.voiceEnvelope.correctedTranscript ?? packet.voiceEnvelope.rawTranscript;
  const suggested = suggestedControlForLanguage(transcript);
  const controls: InstrumentId[] =
    suggested.length > 0 ? suggested : ["contrast", "focalStrength"];
  const targets =
    packet.scope === "project"
      ? artifacts
      : artifacts.filter((artifact) => artifact.id === packet.anchor.artifactId);

  return targets.flatMap((artifact) => {
    const targetIds = contextualTargetIds(
      artifact,
      transcript,
      packet.scope,
      packet.anchor.artifactId,
      packet.anchor.targetIds,
    );
    if (!targetIds.length && hasSemanticTargetLanguage(transcript)) return [];
    const targetNodes = artifact.nodes.filter((node) => targetIds.includes(node.id));
    const allowed = new Set(
      targetNodes.length
        ? targetNodes.flatMap((node) => node.capabilities)
        : capabilityManifests[artifact.kind].instruments.map((item) => item.id),
    );
    const baseline = targetNodes[0]
      ? resolveNodeValues(artifact, targetNodes[0].id)
      : artifact.values;
    const exactRequestedValue = transcript.match(/\b(?:to|at)\s*(100|[1-9]?\d)(?:\s*%|\b)/i)?.[1];
    return controls
      .filter((control) => allowed.has(control))
      .map((control) => {
        const reduce =
          (control === "warmth" && /cool|less.*warm|reduce.*warm|decrease.*warm/i.test(transcript)) ||
          (control === "contrast" && /less.*contrast|lower.*contrast|softer.*contrast|reduce.*contrast|decrease.*contrast/i.test(transcript)) ||
          (control === "spacing" && /tight|closer|less.*spac|reduce.*(?:spac|gap|distance)|decrease.*(?:spac|gap|distance)/i.test(transcript)) ||
          (control === "focalStrength" && /quiet|subtle|less prominent/i.test(transcript)) ||
          (control === "softness" && /crisp|sharp|less.*blur|less.*soft|reduce.*(?:blur|soft)|decrease.*(?:blur|soft)/i.test(transcript)) ||
          (control === "surfaceDepth" && /flat|shallower|less depth|reduce.*shadow/i.test(transcript)) ||
          (control === "cornerRadius" && /square|sharper|less round/i.test(transcript)) ||
          (["accentStrength", "saturation"].includes(control) && /muted|desaturat|less.*color|less.*saturat|lower.*saturat|reduce.*saturat|decrease.*saturat|subtle/i.test(transcript)) ||
          (control === "typeScale" && /smaller|reduce.*(?:size|scale)|shrink/i.test(transcript)) ||
          (control === "cropScale" && /wider|zoom out|smaller|pull back/i.test(transcript));
        const pronounced = /\b(?:much|significantly|substantially|dramatically|noticeably|far)\b/i.test(transcript);
        const direction = (reduce ? -1 : 1) * (pronounced ? 20 : 10);
        return {
          artifactId: artifact.id,
          targetIds,
          control,
          value: exactRequestedValue === undefined
            ? Math.max(0, Math.min(100, baseline[control] + direction))
            : Number(exactRequestedValue),
        } satisfies DesignOperation;
      });
  });
}

export function operationsWouldChange(
  operations: DesignOperation[],
  artifacts: CreativeArtifact[],
) {
  if (!operations.length) return false;
  return applyOperations(artifacts, operations).some((artifact, index) => artifact !== artifacts[index]);
}

interface TargetProps {
  id: string;
  artifactId?: string;
  label?: string;
  kind?: string;
  selectedIds: string[];
  onSelect: (id: string) => void;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}

function Target({ id, artifactId, label, kind, selectedIds, onSelect, className = "", style, children }: TargetProps) {
  const selected = selectedIds.includes(id);
  return (
    <div
      className={`meant-target ${selected ? "is-selected" : ""} ${className}`}
      data-artifact-id={artifactId}
      data-node-kind={kind}
      data-node-label={label ?? id}
      data-semantic-node={id}
      style={style}
      onClick={(clickEvent) => {
        clickEvent.stopPropagation();
        onSelect(id);
      }}
      onKeyDown={(keyEvent) => {
        if (keyEvent.key === "Enter" || keyEvent.key === " ") {
          keyEvent.preventDefault();
          keyEvent.stopPropagation();
          onSelect(id);
        }
      }}
      aria-label={`Select ${label ?? id}`}
      role="button"
      tabIndex={0}
    >
      {children}
      {selected ? <span className="selection-chip">{label ?? "Selected"}</span> : null}
    </div>
  );
}

function captureRenderSnapshot(canvas: HTMLElement | null, artifactId: string): RenderSnapshot | undefined {
  if (!canvas) return undefined;
  const canvasRect = canvas.getBoundingClientRect();
  const nodes = Array.from(canvas.querySelectorAll<HTMLElement>("[data-semantic-node]"))
    .slice(0, 100)
    .map((element) => {
      const rect = element.getBoundingClientRect();
      const computed = window.getComputedStyle(element);
      return {
        id: element.dataset.semanticNode ?? "",
        label: element.dataset.nodeLabel ?? element.dataset.semanticNode ?? "Layer",
        kind: element.dataset.nodeKind,
        text: element.innerText.replace(/\s+/g, " ").trim().slice(0, 160) || undefined,
        rect: {
          x: Math.round((rect.left - canvasRect.left) * 10) / 10,
          y: Math.round((rect.top - canvasRect.top) * 10) / 10,
          width: Math.round(rect.width * 10) / 10,
          height: Math.round(rect.height * 10) / 10,
        },
        style: {
          fontSize: computed.fontSize,
          lineHeight: computed.lineHeight,
          color: computed.color,
          backgroundColor: computed.backgroundColor,
          opacity: computed.opacity,
          transform: computed.transform,
          filter: computed.filter,
          borderRadius: computed.borderRadius,
        },
      };
    })
    .filter((node) => node.id);
  return {
    artifactId,
    viewport: { width: Math.round(canvasRect.width), height: Math.round(canvasRect.height) },
    nodes,
  };
}

async function fetchWithTimeout(input: RequestInfo | URL, init: RequestInit, timeoutMs: number) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(input, { ...init, signal: controller.signal });
  } finally {
    window.clearTimeout(timeout);
  }
}

export function WebComposition({
  artifact,
  selectedIds,
  onSelect,
  onQuickAdjust,
}: {
  artifact: CreativeArtifact;
  selectedIds: string[];
  onSelect: (id: string) => void;
  onQuickAdjust: (control: InstrumentId, delta: number) => void;
}) {
  const frame = resolveNodeValues(artifact, "web-frame");
  const header = resolveNodeValues(artifact, "web-header");
  const wordmark = resolveNodeValues(artifact, "web-wordmark");
  const navigation = resolveNodeValues(artifact, "web-navigation");
  const navMenu = resolveNodeValues(artifact, "web-nav-menu");
  const navLocations = resolveNodeValues(artifact, "web-nav-locations");
  const navStory = resolveNodeValues(artifact, "web-nav-story");
  const hero = resolveNodeValues(artifact, "web-hero");
  const copy = resolveNodeValues(artifact, "web-copy");
  const eyebrow = resolveNodeValues(artifact, "web-eyebrow");
  const headline = resolveNodeValues(artifact, "web-headline");
  const supporting = resolveNodeValues(artifact, "web-supporting-copy");
  const image = resolveNodeValues(artifact, "web-image");
  const colorField = resolveNodeValues(artifact, "web-color-field");
  const sun = resolveNodeValues(artifact, "web-sun");
  const pearls = resolveNodeValues(artifact, "web-pearls");
  const actions = resolveNodeValues(artifact, "web-actions");
  const primaryAction = resolveNodeValues(artifact, "web-primary-action");
  const secondaryAction = resolveNodeValues(artifact, "web-secondary-action");
  const footer = resolveNodeValues(artifact, "web-footer");
  const footerLocation = resolveNodeValues(artifact, "web-footer-location");
  const footerFlavors = resolveNodeValues(artifact, "web-footer-flavors");
  const footerWave = resolveNodeValues(artifact, "web-footer-wave");
  const headerPrimitives = primitivesFor(artifact, "web-header");
  const wordmarkPrimitives = primitivesFor(artifact, "web-wordmark");
  const navigationPrimitives = primitivesFor(artifact, "web-navigation");
  const copyPrimitives = primitivesFor(artifact, "web-copy");
  const eyebrowPrimitives = primitivesFor(artifact, "web-eyebrow");
  const headlinePrimitives = primitivesFor(artifact, "web-headline");
  const supportingPrimitives = primitivesFor(artifact, "web-supporting-copy");
  const actionsPrimitives = primitivesFor(artifact, "web-actions");
  const primaryActionPrimitives = primitivesFor(artifact, "web-primary-action");
  const secondaryActionPrimitives = primitivesFor(artifact, "web-secondary-action");
  const colorFieldPrimitives = primitivesFor(artifact, "web-color-field");
  const sunPrimitives = primitivesFor(artifact, "web-sun");
  const pearlPrimitives = primitivesFor(artifact, "web-pearls");
  const footerPrimitives = primitivesFor(artifact, "web-footer");
  const footerWavePrimitives = primitivesFor(artifact, "web-footer-wave");
  const frameMetrics = controlMetrics(frame);
  const headerMetrics = controlMetrics(header);
  const navigationMetrics = controlMetrics(navigation);
  const heroMetrics = controlMetrics(hero);
  const copyMetrics = controlMetrics(copy);
  const eyebrowMetrics = controlMetrics(eyebrow);
  const supportingMetrics = controlMetrics(supporting);
  const imageMetrics = controlMetrics(image);
  const colorFieldMetrics = controlMetrics(colorField);
  const sunMetrics = controlMetrics(sun);
  const pearlsMetrics = controlMetrics(pearls);
  const actionsMetrics = controlMetrics(actions);
  const footerMetrics = controlMetrics(footer);
  const footerWaveMetrics = controlMetrics(footerWave);
  const selectedCopy = selectedIds.includes("web-supporting-copy");

  return (
    <Target
      id="web-frame"
      artifactId={artifact.id}
      kind="composition"
      label="Launch page"
      selectedIds={selectedIds}
      onSelect={onSelect}
      className="web-composition bobalicious-web"
      style={{
        background: `hsl(${38 + frameMetrics.warmth * 8} ${58 + frameMetrics.saturation * 14}% ${99 - frameMetrics.contrast * 4.4}%)`,
        color: "#3a241c",
        borderRadius: `${frameMetrics.radius}px`,
        padding: `${12 + frameMetrics.spacing * 8}px`,
        boxShadow: `0 ${frameMetrics.depth * 0.7}px ${frameMetrics.depth * 2.2}px rgba(46,59,81,${0.08 + frameMetrics.depth / 500})`,
      }}
    >
      <Target id="web-header" kind="group" label="Header" selectedIds={selectedIds} onSelect={onSelect} className="web-composition-nav" style={{ ...layoutStyle(headerPrimitives), gap: `${12 * headerMetrics.spacing}px` }}>
        <Target id="web-wordmark" kind="text" label="Bobalicious wordmark" selectedIds={selectedIds} onSelect={onSelect} className="boba-wordmark" style={{ ...textStyle(wordmark, 16, { compact: true }), ...alignmentStyle(wordmarkPrimitives), color: wordmarkPrimitives.fill ?? "#3a241c" }}>
          {contentFor(artifact, "web-wordmark")}<span className="pearl-dots">•••</span>
        </Target>
        <Target id="web-navigation" kind="group" label="Navigation" selectedIds={selectedIds} onSelect={onSelect} className="boba-nav" style={{ ...layoutStyle(navigationPrimitives), gap: `${18 * navigationMetrics.spacing}px` }}>
          <Target id="web-nav-menu" kind="text" label="Menu link" selectedIds={selectedIds} onSelect={onSelect} style={alignmentStyle(primitivesFor(artifact, "web-nav-menu"))}><span style={{ ...textStyle(navMenu, 12, { compact: true }), color: primitivesFor(artifact, "web-nav-menu").fill ?? "#3a241c" }}>{contentFor(artifact, "web-nav-menu")}</span></Target>
          <Target id="web-nav-locations" kind="text" label="Locations link" selectedIds={selectedIds} onSelect={onSelect} style={alignmentStyle(primitivesFor(artifact, "web-nav-locations"))}><span style={{ ...textStyle(navLocations, 12, { compact: true }), color: primitivesFor(artifact, "web-nav-locations").fill ?? "#3a241c" }}>{contentFor(artifact, "web-nav-locations")}</span></Target>
          <Target id="web-nav-story" kind="text" label="Our story link" selectedIds={selectedIds} onSelect={onSelect} style={alignmentStyle(primitivesFor(artifact, "web-nav-story"))}><span style={{ ...textStyle(navStory, 12, { compact: true }), color: primitivesFor(artifact, "web-nav-story").fill ?? "#3a241c" }}>{contentFor(artifact, "web-nav-story")}</span></Target>
        </Target>
      </Target>
      <Target
        id="web-hero"
        kind="group"
        label="Hero composition"
        selectedIds={selectedIds}
        onSelect={onSelect}
        className="web-hero"
        style={{ gap: `${22 * heroMetrics.spacing}px` }}
      >
        <Target id="web-copy" kind="group" label="Hero copy" selectedIds={selectedIds} onSelect={onSelect} className="web-copy" style={{ ...layoutStyle(copyPrimitives), gap: `${14 * copyMetrics.spacing}px` }}>
          <Target id="web-eyebrow" kind="text" label="Freshness eyebrow" selectedIds={selectedIds} onSelect={onSelect} style={alignmentStyle(eyebrowPrimitives)}>
            <p className="eyebrow" style={{ ...textStyle(eyebrow, 10, { compact: true }), color: eyebrowPrimitives.fill ?? `hsl(0 82% ${38 + eyebrowMetrics.accent * 15}%)`, filter: `brightness(${0.72 + eyebrowMetrics.accent * 0.4})` }}>{contentFor(artifact, "web-eyebrow")}</p>
          </Target>
          <Target id="web-headline" kind="text" label="Hero headline" selectedIds={selectedIds} onSelect={onSelect} style={alignmentStyle(headlinePrimitives)}>
            <h2 style={{ ...textStyle(headline, 58, { compact: true }), color: headlinePrimitives.fill ?? "#3a241c", whiteSpace: "pre-line" }}>{contentFor(artifact, "web-headline")}</h2>
          </Target>
          <Target id="web-supporting-copy" kind="text" label="Supporting copy" selectedIds={selectedIds} onSelect={onSelect} className="supporting-copy-target" style={alignmentStyle(supportingPrimitives)}>
            <p
              className="web-deck"
              style={{
                ...textStyle(supporting, 14),
                color: supportingPrimitives.fill ?? "#3a241c",
                maxWidth: `${310 + supportingMetrics.spacing * 70}px`,
              }}
            >
              {contentFor(artifact, "web-supporting-copy")}
            </p>
            {selectedCopy ? (
              <div className="contextual-actions" role="group" aria-label="Quick design adjustments">
                <button onClick={(event) => { event.stopPropagation(); onQuickAdjust("typeScale", 8); }} type="button">↗ <span>Larger</span></button>
                <button onClick={(event) => { event.stopPropagation(); onQuickAdjust("focalStrength", 7); }} type="button">☺ <span>More playful</span></button>
                <button onClick={(event) => { event.stopPropagation(); onQuickAdjust("spacing", 7); }} type="button">↕ <span>More space</span></button>
              </div>
            ) : null}
          </Target>
          <Target id="web-actions" kind="group" label="Order actions" selectedIds={selectedIds} onSelect={onSelect} className="web-actions" style={{ ...layoutStyle(actionsPrimitives), gap: `${8 * actionsMetrics.spacing}px` }}>
              <Target id="web-primary-action" kind="action" label="Order a favorite" selectedIds={selectedIds} onSelect={onSelect} className="primary-action" style={{ ...actionStyle(primaryAction, "primary"), background: primaryActionPrimitives.fill ?? `hsl(0 82% ${49 + controlMetrics(primaryAction).accent * 8}%)` }}>
                {contentFor(artifact, "web-primary-action")}
              </Target>
              <Target id="web-secondary-action" kind="action" label="Build your own" selectedIds={selectedIds} onSelect={onSelect} className="secondary-action" style={{ ...actionStyle(secondaryAction, "secondary"), color: secondaryActionPrimitives.fill ?? "#3a241c", borderColor: secondaryActionPrimitives.fill ?? `rgba(58,36,28,${0.25 + controlMetrics(secondaryAction).contrast * 0.45})`, background: `rgba(255,255,255,${0.06 + controlMetrics(secondaryAction).accent * 0.18})` }}>{contentFor(artifact, "web-secondary-action")}</Target>
          </Target>
        </Target>
        <Target
          id="web-visual"
          kind="group"
          label="Product field"
          selectedIds={selectedIds}
          onSelect={onSelect}
          className="boba-product-field"
        >
          <Target id="web-color-field" kind="background" label="Mango field" selectedIds={selectedIds} onSelect={onSelect} className="boba-color-field" style={{ background: colorFieldPrimitives.fill ?? `hsl(${38 + colorFieldMetrics.warmth * 12} ${48 + colorFieldMetrics.saturation * 28}% ${52 + colorFieldMetrics.accent * 12}%)`, filter: `contrast(${colorFieldMetrics.contrast}) saturate(${colorFieldMetrics.saturation}) blur(${colorFieldMetrics.blur * 0.24}px)`, opacity: 0.72 + colorFieldMetrics.accent * 0.26 }}><span /></Target>
          <Target id="web-sun" kind="shape" label="Cream halo" selectedIds={selectedIds} onSelect={onSelect} className="boba-sun" style={{ background: sunPrimitives.fill ?? `hsl(${42 + sunMetrics.accent * 9} 82% ${86 + sunMetrics.accent * 8}%)`, filter: `contrast(${sunMetrics.contrast}) brightness(${0.72 + sunMetrics.accent * 0.4}) blur(${sunMetrics.blur * 0.45}px)`, opacity: Math.min(1, 0.45 + sunMetrics.contrast * 0.35), transform: `scale(${sunMetrics.focalScale})` }}><span /></Target>
          <Target id="web-image" kind="image" label="Signature drink" selectedIds={selectedIds} onSelect={onSelect} className="boba-product-image">
            <img
              alt="Brown sugar milk tea with tapioca pearls"
              src={PHOTO_URL}
              style={{
                filter: mediaFilter(image, 0.22),
                transform: `scale(${imageMetrics.cropScale * imageMetrics.focalScale})`,
              }}
            />
          </Target>
          <Target id="web-pearls" kind="decoration" label="Pearl cluster" selectedIds={selectedIds} onSelect={onSelect} className="boba-pearls" style={{ "--pearl-color": pearlPrimitives.fill ?? `hsl(18 46% ${12 + pearlsMetrics.accent * 12}%)`, right: `${2 + pearlsMetrics.spacing * 4}%`, bottom: `${2 + pearlsMetrics.spacing * 3}%`, opacity: Math.min(1, 0.42 + pearlsMetrics.contrast * 0.44), filter: `brightness(${0.72 + pearlsMetrics.accent * 0.4})`, transform: `scale(${pearlsMetrics.focalScale})` } as React.CSSProperties}>
            <span className="boba-pearl pearl-one" /><span className="boba-pearl pearl-two" /><span className="boba-pearl pearl-three" />
          </Target>
        </Target>
      </Target>
      <Target id="web-footer" kind="group" label="Footer notes" selectedIds={selectedIds} onSelect={onSelect} className="web-composition-footer" style={{ ...layoutStyle(footerPrimitives), gap: `${8 * footerMetrics.spacing}px` }}>
        <Target id="web-footer-location" kind="text" label="Location note" selectedIds={selectedIds} onSelect={onSelect} style={alignmentStyle(primitivesFor(artifact, "web-footer-location"))}><span style={{ ...textStyle(footerLocation, 9, { compact: true }), color: primitivesFor(artifact, "web-footer-location").fill }}>{contentFor(artifact, "web-footer-location")}</span></Target>
        <Target id="web-footer-flavors" kind="text" label="Flavor list" selectedIds={selectedIds} onSelect={onSelect} style={alignmentStyle(primitivesFor(artifact, "web-footer-flavors"))}><span style={{ ...textStyle(footerFlavors, 9, { compact: true }), color: primitivesFor(artifact, "web-footer-flavors").fill }}>{contentFor(artifact, "web-footer-flavors")}</span></Target>
      </Target>
      <Target id="web-footer-wave" kind="shape" label="Matcha wave" selectedIds={selectedIds} onSelect={onSelect} className="boba-footer-wave" style={{ background: footerWavePrimitives.fill ?? `hsl(${92 + footerWaveMetrics.warmth * 10} ${20 + footerWaveMetrics.saturation * 24}% ${38 + footerWaveMetrics.accent * 18}%)`, opacity: Math.min(1, 0.4 + footerWaveMetrics.contrast * 0.4), filter: `contrast(${footerWaveMetrics.contrast}) saturate(${footerWaveMetrics.saturation}) brightness(${0.72 + footerWaveMetrics.accent * 0.4}) blur(${footerWaveMetrics.blur * 0.18}px)` }}><span /></Target>
    </Target>
  );
}

export function GraphicComposition({
  artifact,
  selectedIds,
  onSelect,
}: {
  artifact: CreativeArtifact;
  selectedIds: string[];
  onSelect: (id: string) => void;
}) {
  const frame = resolveNodeValues(artifact, "graphic-frame");
  const wash = resolveNodeValues(artifact, "graphic-wash");
  const index = resolveNodeValues(artifact, "graphic-index");
  const kicker = resolveNodeValues(artifact, "graphic-kicker");
  const headline = resolveNodeValues(artifact, "graphic-headline");
  const orbit = resolveNodeValues(artifact, "graphic-orbit");
  const image = resolveNodeValues(artifact, "graphic-image");
  const footer = resolveNodeValues(artifact, "graphic-footer");
  const footerFlavor = resolveNodeValues(artifact, "graphic-footer-flavor");
  const footerAvailability = resolveNodeValues(artifact, "graphic-footer-availability");
  const washPrimitives = primitivesFor(artifact, "graphic-wash");
  const copyPrimitives = primitivesFor(artifact, "graphic-copy");
  const orbitPrimitives = primitivesFor(artifact, "graphic-orbit");
  const footerPrimitives = primitivesFor(artifact, "graphic-footer");
  const frameMetrics = controlMetrics(frame);
  const washMetrics = controlMetrics(wash);
  const copyMetrics = controlMetrics(resolveNodeValues(artifact, "graphic-copy"));
  const orbitMetrics = controlMetrics(orbit);
  const imageMetrics = controlMetrics(image);
  const footerMetrics = controlMetrics(footer);
  return (
    <div
      className="graphic-stage"
      style={{ padding: `${12 + frameMetrics.spacing * 8}px` }}
    >
      <Target
        id="graphic-frame"
        artifactId={artifact.id}
        kind="composition"
        label="Social frame"
        selectedIds={selectedIds}
        onSelect={onSelect}
        className="graphic-poster boba-poster"
        style={{ boxShadow: `0 ${frameMetrics.depth}px ${frameMetrics.depth * 3}px rgba(46,59,81,${0.12 + frameMetrics.depth / 360})` }}
      >
        <Target
          id="graphic-wash"
          kind="background"
          label="Flavor color wash"
          selectedIds={selectedIds}
          onSelect={onSelect}
          className="graphic-wash"
          style={{
            background: washPrimitives.fill ?? "linear-gradient(155deg,#f46666 0 52%,#ffb547 52% 78%,#86a96b 78%)",
            filter: mediaFilter(wash, 0.18),
            opacity: 0.62 + washMetrics.accent * 0.36,
          }}
        ><span /></Target>
        <Target id="graphic-index" kind="text" label="Campaign label" selectedIds={selectedIds} onSelect={onSelect} className="graphic-index" style={alignmentStyle(primitivesFor(artifact, "graphic-index"))}>
          <span style={{ ...textStyle(index, 9, { compact: true }), color: primitivesFor(artifact, "graphic-index").fill }}>{contentFor(artifact, "graphic-index")}</span>
        </Target>
        <Target id="graphic-copy" kind="group" label="Campaign copy" selectedIds={selectedIds} onSelect={onSelect} className="graphic-copy" style={{ ...layoutStyle(copyPrimitives), gap: `${14 * copyMetrics.spacing}px` }}>
          <Target id="graphic-kicker" kind="text" label="Flavor kicker" selectedIds={selectedIds} onSelect={onSelect} style={alignmentStyle(primitivesFor(artifact, "graphic-kicker"))}>
            <p style={{ ...textStyle(kicker, 10, { compact: true }), color: primitivesFor(artifact, "graphic-kicker").fill }}>{contentFor(artifact, "graphic-kicker")}</p>
          </Target>
          <Target id="graphic-headline" kind="text" label="Flavor headline" selectedIds={selectedIds} onSelect={onSelect} style={alignmentStyle(primitivesFor(artifact, "graphic-headline"))}>
            <h2 style={{ ...textStyle(headline, 72, { compact: true }), color: primitivesFor(artifact, "graphic-headline").fill, whiteSpace: "pre-line" }}>
              {contentFor(artifact, "graphic-headline")}
            </h2>
          </Target>
        </Target>
        <Target
          id="graphic-orbit"
          kind="group"
          label="Product crop"
          selectedIds={selectedIds}
          onSelect={onSelect}
          className="graphic-orbit boba-poster-product"
          style={{ background: orbitPrimitives.fill ?? `hsl(${38 + orbitMetrics.warmth * 10} ${44 + orbitMetrics.saturation * 30}% ${54 + orbitMetrics.accent * 10}%)`, boxShadow: `0 ${8 + orbitMetrics.focalScale * 4}px ${18 + orbitMetrics.focalScale * 15}px rgba(58,36,28,${0.12 + orbitMetrics.accent * 0.14})` }}
        >
          <Target id="graphic-image" kind="image" label="Signature drink" selectedIds={selectedIds} onSelect={onSelect} className="graphic-product-image">
            <img
              alt="Bobalicious brown sugar milk tea campaign product"
              src={PHOTO_URL}
              style={{
                filter: mediaFilter(image, 0.22),
                transform: `rotate(4deg) scale(${imageMetrics.cropScale * imageMetrics.focalScale})`,
              }}
            />
          </Target>
        </Target>
        <Target id="graphic-footer" kind="group" label="Campaign footer" selectedIds={selectedIds} onSelect={onSelect} className="graphic-bottomline" style={{ ...layoutStyle(footerPrimitives), gap: `${8 * footerMetrics.spacing}px` }}>
          <Target id="graphic-footer-flavor" kind="text" label="Flavor note" selectedIds={selectedIds} onSelect={onSelect} style={alignmentStyle(primitivesFor(artifact, "graphic-footer-flavor"))}><span style={{ ...textStyle(footerFlavor, 9, { compact: true }), color: primitivesFor(artifact, "graphic-footer-flavor").fill }}>{contentFor(artifact, "graphic-footer-flavor")}</span></Target>
          <Target id="graphic-footer-availability" kind="text" label="Availability note" selectedIds={selectedIds} onSelect={onSelect} style={alignmentStyle(primitivesFor(artifact, "graphic-footer-availability"))}><span style={{ ...textStyle(footerAvailability, 9, { compact: true }), color: primitivesFor(artifact, "graphic-footer-availability").fill }}>{contentFor(artifact, "graphic-footer-availability")}</span></Target>
        </Target>
      </Target>
    </div>
  );
}

export function PhotoComposition({
  artifact,
  selectedIds,
  onSelect,
}: {
  artifact: CreativeArtifact;
  selectedIds: string[];
  onSelect: (id: string) => void;
}) {
  const image = resolveNodeValues(artifact, "photo-image");
  const vignette = resolveNodeValues(artifact, "photo-vignette");
  const subject = resolveNodeValues(artifact, "photo-subject");
  const background = resolveNodeValues(artifact, "photo-background");
  const caption = resolveNodeValues(artifact, "photo-caption");
  const captionLabel = resolveNodeValues(artifact, "photo-caption-label");
  const attribution = resolveNodeValues(artifact, "photo-attribution");
  const captionPrimitives = primitivesFor(artifact, "photo-caption");
  const imageMetrics = controlMetrics(image);
  const vignetteMetrics = controlMetrics(vignette);
  const subjectMetrics = controlMetrics(subject);
  const backgroundMetrics = controlMetrics(background);
  const captionMetrics = controlMetrics(caption);
  return (
    <div className="photo-stage">
      <Target
        id="photo-frame"
        artifactId={artifact.id}
        kind="composition"
        label="Editorial frame"
        selectedIds={selectedIds}
        onSelect={onSelect}
        className="photo-frame boba-photo-frame"
      >
        <Target
          id="photo-image"
          kind="image"
          label="Milk tea photograph"
          selectedIds={selectedIds}
          onSelect={onSelect}
          className="photo-image"
          style={{
            backgroundImage: `url(${PHOTO_URL})`,
            filter: mediaFilter(image, 0.2),
            transform: `scale(${imageMetrics.cropScale * imageMetrics.focalScale})`,
          }}
        ><span /></Target>
        <Target id="photo-vignette" kind="effect" label="Edge vignette" selectedIds={selectedIds} onSelect={onSelect} className="photo-vignette" style={{ opacity: Math.min(0.88, 0.08 + vignetteMetrics.depth / 80 + (vignetteMetrics.contrast - 0.72) * 0.35), filter: `blur(${vignetteMetrics.blur * 0.28}px)`, background: `radial-gradient(circle,transparent ${18 + vignette.focalStrength * 0.48}%,rgba(13,7,12,.9) 110%)` }}><span className="overlay-handle">Vignette</span></Target>
        <Target
          id="photo-background"
          kind="background"
          label="Milk tea field"
          selectedIds={selectedIds}
          onSelect={onSelect}
          className="photo-background"
          style={{
            backdropFilter: `contrast(${backgroundMetrics.contrast}) saturate(${backgroundMetrics.saturation}) sepia(${Math.max(0, backgroundMetrics.warmth) * 0.22}) hue-rotate(${Math.max(0, -backgroundMetrics.warmth) * -9}deg) blur(${backgroundMetrics.blur * 0.35}px)`,
          }}
        >
          <span>Milk tea field</span>
        </Target>
        <Target
          id="photo-subject"
          kind="image"
          label="Brown sugar boba"
          selectedIds={selectedIds}
          onSelect={onSelect}
          className="photo-subject"
          style={{
            backdropFilter: `contrast(${subjectMetrics.contrast}) saturate(${subjectMetrics.saturation}) blur(${subjectMetrics.blur * 0.28}px)`,
            boxShadow: `0 0 ${12 + subjectMetrics.focalScale * 24}px rgba(166,145,242,${0.08 + (subjectMetrics.focalScale - 0.9) * 0.9})`,
            transform: `scale(${subjectMetrics.focalScale})`,
          }}
        >
          <span>Brown sugar boba</span>
        </Target>
        <Target id="photo-caption" kind="group" label="Editorial caption" selectedIds={selectedIds} onSelect={onSelect} className="photo-caption" style={{ ...layoutStyle(captionPrimitives), gap: `${8 * captionMetrics.spacing}px` }}>
          <Target id="photo-caption-label" kind="text" label="Editorial label" selectedIds={selectedIds} onSelect={onSelect} style={alignmentStyle(primitivesFor(artifact, "photo-caption-label"))}><span style={{ ...textStyle(captionLabel, 10, { compact: true }), color: primitivesFor(artifact, "photo-caption-label").fill }}>{contentFor(artifact, "photo-caption-label")}</span></Target>
          <Target id="photo-attribution" kind="text" label="Photo credit" selectedIds={selectedIds} onSelect={onSelect} style={alignmentStyle(primitivesFor(artifact, "photo-attribution"))}><span style={{ ...textStyle(attribution, 10, { compact: true }), color: primitivesFor(artifact, "photo-attribution").fill }}>{contentFor(artifact, "photo-attribution")}</span></Target>
        </Target>
      </Target>
    </div>
  );
}

type PendingEvidence = EvidenceItem & { dataUrl?: string };

type E2ECapture = {
  surface: ExpressionSurface;
  operations: CanonicalOperation[];
  operationDigest: string;
};

type E2EFault = "none" | "persistence" | "postcondition";

const evidenceLabels: Record<EvidenceKind, string> = {
  reference_image: "Visual reference",
  geometry_sketch: "Geometry sketch",
  screenshot: "Annotated screenshot",
  timing_reference: "Timing reference",
  written_note: "Direction note",
};

export default function MeantStudio() {
  const [project, setProject] = useState<StudioProject>(seedProject);
  const [activeArtifactId, setActiveArtifactId] = useState(seedProject.artifacts[0]!.id);
  const [selectedIds, setSelectedIds] = useState<string[]>(["web-supporting-copy"]);
  const [scope, setScope] = useState<IntentScope>("artifact");
  const [draft, setDraft] = useState("");
  const [interim, setInterim] = useState("");
  const [isListening, setIsListening] = useState(false);
  const [captureMethod, setCaptureMethod] = useState<
    "gpt-transcribe" | "gpt-live-transcribe" | "speech-recognition" | "typed-fallback"
  >("typed-fallback");
  const [transcriptionState, setTranscriptionState] = useState<
    "idle" | "connecting" | "listening" | "finalizing" | "fallback" | "error"
  >("idle");
  const [transcriptionNotice, setTranscriptionNotice] = useState("");
  const [agentStatus, setAgentStatus] = useState<"idle" | "interpreting" | "ready" | "error">("idle");
  const [agentNotice, setAgentNotice] = useState("");
  const [, setWebMcpStatus] = useState<"checking" | "ready" | "unavailable">(
    "checking",
  );
  const [, setPersistenceStatus] = useState<
    "loading" | "saving" | "saved" | "local"
  >("loading");
  const [showBefore, setShowBefore] = useState(false);
  const [history, setHistory] = useState<CommittedChange[]>([]);
  const [projectRevision, setProjectRevision] = useState(0);
  const [panel, setPanel] = useState("segments");
  const [artifactGalleryOpen, setArtifactGalleryOpen] = useState(false);
  const [reviewSheetOpen, setReviewSheetOpen] = useState(false);
  const [collapsedNodeIds, setCollapsedNodeIds] = useState<string[]>([]);
  const [appliedNotice, setAppliedNotice] = useState("");
  const [canvasPulse, setCanvasPulse] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [evidenceKind, setEvidenceKind] = useState<EvidenceKind>("reference_image");
  const [evidenceGovernance, setEvidenceGovernance] = useState("");
  const [pendingEvidence, setPendingEvidence] = useState<PendingEvidence[]>([]);
  const [evidenceNotice, setEvidenceNotice] = useState("");
  const [canvasView, setCanvasView] = useState({ x: 0, y: 0, scale: 1 });
  const [isPanning, setIsPanning] = useState(false);
  const [panelGuide, setPanelGuide] = useState<"artifacts" | "layers" | null>(null);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [e2eMode, setE2eMode] = useState(false);
  const [e2eWorkspaceId, setE2eWorkspaceId] = useState<string | null>(null);
  const [e2eFingerprint, setE2eFingerprint] = useState<string | null>(null);
  const [e2eVoiceText, setE2eVoiceText] = useState("");
  const [e2eWebMcpInput, setE2eWebMcpInput] = useState("");
  const [e2eUndoChangeId, setE2eUndoChangeId] = useState("");
  const [e2eFault, setE2eFault] = useState<E2EFault>("none");
  const [e2eCaptures, setE2eCaptures] = useState<E2ECapture[]>([]);
  const [e2ePostApprovalCalls, setE2ePostApprovalCalls] = useState<string[]>([]);
  const [e2eLastResult, setE2eLastResult] = useState<Record<string, unknown> | null>(null);
  const expressionInputRef = useRef<HTMLTextAreaElement | null>(null);
  const canvasRef = useRef<HTMLDivElement | null>(null);
  const layerPanelRef = useRef<HTMLElement | null>(null);
  const evidenceInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedAudioRef = useRef<Blob[]>([]);
  const voiceCaptureCancelledRef = useRef(false);
  const microphoneStreamRef = useRef<MediaStream | null>(null);
  const draftAtListenStartRef = useRef("");
  const projectRef = useRef(project);
  const activeArtifactIdRef = useRef(activeArtifactId);
  const selectedIdsRef = useRef(selectedIds);
  const commandsRef = useRef<CommandSurface | null>(null);
  const e2eToolsRef = useRef(new Map<string, ReturnType<typeof createWebMcpTools>[number]>());
  const compileExpressionRef = useRef<((packet: ExpressionPacket, evidence?: PendingEvidence[]) => Promise<void>) | null>(null);
  const evidencePayloadsRef = useRef(new Map<string, PendingEvidence[]>());
  const workspaceIdRef = useRef<string | null>(null);
  const e2eModeRef = useRef(false);
  const e2eFaultRef = useRef<E2EFault>("none");
  const projectRevisionRef = useRef(0);
  const persistenceHydratedRef = useRef(false);
  const seenPanelGuidesRef = useRef(new Set<"artifacts" | "layers">());
  const canvasPanRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    projectRef.current = project;
    activeArtifactIdRef.current = activeArtifactId;
    selectedIdsRef.current = selectedIds;
    projectRevisionRef.current = projectRevision;
  }, [activeArtifactId, project, projectRevision, selectedIds]);

  useEffect(() => {
    e2eFaultRef.current = e2eFault;
  }, [e2eFault]);

  useEffect(() => {
    const storedTheme = window.localStorage.getItem(THEME_STORAGE_KEY)
      ?? window.localStorage.getItem(LEGACY_THEME_STORAGE_KEY);
    if (storedTheme !== "light" && storedTheme !== "dark") return;
    window.localStorage.setItem(THEME_STORAGE_KEY, storedTheme);
    const frame = window.requestAnimationFrame(() => setTheme(storedTheme));
    return () => window.cancelAnimationFrame(frame);
  }, []);

  const chooseTheme = useCallback((nextTheme: "light" | "dark") => {
    setTheme(nextTheme);
    window.localStorage.setItem(THEME_STORAGE_KEY, nextTheme);
  }, []);

  useEffect(() => {
    const closeFloatingPanels = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key !== "Escape") return;
      setArtifactGalleryOpen(false);
      setReviewSheetOpen(false);
      setPanelGuide(null);
    };
    window.addEventListener("keydown", closeFloatingPanels);
    return () => window.removeEventListener("keydown", closeFloatingPanels);
  }, []);

  useEffect(() => {
    if (!panelGuide) return;
    const timer = window.setTimeout(() => setPanelGuide(null), 4_500);
    return () => window.clearTimeout(timer);
  }, [panelGuide]);

  useEffect(() => {
    let cancelled = false;
    const hydrate = async () => {
      const params = new URLSearchParams(window.location.search);
      const requestedWorkspace = params.get("workspaceId");
      const isolatedE2E = process.env.NODE_ENV !== "production" && params.get("e2e") === "1" && Boolean(requestedWorkspace?.startsWith("e2e-")) && /^[a-zA-Z0-9-]{12,96}$/.test(requestedWorkspace ?? "");
      const stored = isolatedE2E ? null : window.localStorage.getItem(WORKSPACE_STORAGE_KEY)
        ?? window.localStorage.getItem(LEGACY_WORKSPACE_STORAGE_KEY);
      const workspaceId = isolatedE2E ? requestedWorkspace! : stored ?? uid("workspace");
      if (!isolatedE2E) window.localStorage.setItem(WORKSPACE_STORAGE_KEY, workspaceId);
      e2eModeRef.current = isolatedE2E;
      setE2eMode(isolatedE2E);
      setE2eWorkspaceId(isolatedE2E ? workspaceId : null);
      setE2eFingerprint(isolatedE2E ? document.querySelector('meta[name="meant-draft-revision"]')?.getAttribute("content") ?? null : null);
      workspaceIdRef.current = workspaceId;
      try {
        const response = await fetch(`/api/project?workspaceId=${encodeURIComponent(workspaceId)}`, {
          cache: "no-store",
        });
        if (!response.ok) throw new Error("Project store unavailable");
        let body = (await response.json()) as { project?: StudioProject | null; revision?: number; history?: CommittedChange[] };
        if (!body.project) {
          const bootstrap = await fetch(`/api/project?workspaceId=${encodeURIComponent(workspaceId)}`, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ project: seedProject, expectedRevision: 0 }),
          });
          if (!bootstrap.ok && bootstrap.status !== 409) throw new Error("Project bootstrap unavailable");
          const refreshed = await fetch(`/api/project?workspaceId=${encodeURIComponent(workspaceId)}`, { cache: "no-store" });
          if (!refreshed.ok) throw new Error("Project store unavailable");
          body = await refreshed.json() as typeof body;
        }
        if (!cancelled && body.project?.artifacts?.length) {
          const currentIntelligence = body.project.designIntelligence;
          const canonicalIntelligence = seedProject.designIntelligence;
          const hydratedProject = {
            ...body.project,
            artifacts: body.project.artifacts.map((artifact) => {
              const canonicalArtifact = seedProject.artifacts.find((candidate) => candidate.id === artifact.id);
              if (!canonicalArtifact) return artifact;
              return {
                ...artifact,
                nodes: canonicalArtifact.nodes.map((canonicalNode) => ({
                  ...canonicalNode,
                  values: artifact.nodes.find((storedNode) => storedNode.id === canonicalNode.id)?.values ?? canonicalNode.values,
                  primitives: artifact.nodes.find((storedNode) => storedNode.id === canonicalNode.id)?.primitives ?? canonicalNode.primitives,
                })),
              };
            }),
            designIntelligence:
              currentIntelligence?.version === canonicalIntelligence?.version
                ? currentIntelligence
                : canonicalIntelligence,
          };
          projectRef.current = hydratedProject;
          setProject(hydratedProject);
          setActiveArtifactId(hydratedProject.artifacts[0]!.id);
          setSelectedIds(hydratedProject.artifacts[0]!.nodes[0] ? [hydratedProject.artifacts[0]!.nodes[0]!.id] : []);
          setProjectRevision(body.revision ?? 0);
          projectRevisionRef.current = body.revision ?? 0;
          setHistory(body.history ?? []);
        }
        if (!cancelled) setPersistenceStatus("saved");
      } catch {
        if (!cancelled) setPersistenceStatus("local");
      } finally {
        persistenceHydratedRef.current = true;
      }
    };
    void hydrate();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeArtifact =
    project.artifacts.find((artifact) => artifact.id === activeArtifactId) ?? project.artifacts[0]!;
  const manifest = capabilityManifests[activeArtifact.kind];
  const selectedNodes = activeArtifact.nodes.filter((node) => selectedIds.includes(node.id));
  const isLayerScope = scope === "element" || scope === "region";
  const canvasSelectedIds = isLayerScope ? selectedIds : [];
  const selectedValues = isLayerScope && selectedNodes[0]
    ? resolveNodeValues(activeArtifact, selectedNodes[0].id)
    : activeArtifact.values;
  const scopeCopy = scopePresentation(scope, project.name, activeArtifact.name, selectedNodes[0]?.name);
  const activePacket = project.expressionPackets[0];
  const activeChangeUndone = activePacket?.status === "undone";
  const activeAppliedChange = project.latestAppliedChange?.expressionPacketId === activePacket?.id
    ? project.latestAppliedChange
    : undefined;
  const activePlan = project.activeChangeSet?.designPlan
    ?? activeAppliedChange?.designPlan
    ?? (project.latestDesignPlanExpressionPacketId === activePacket?.id ? project.latestDesignPlan : undefined);
  const reviewOperations: Array<DesignOperation | AppliedOperation | CanonicalOperation | CanonicalAppliedOperation> = project.activeChangeSet?.operations
    ?? activeAppliedChange?.operations
    ?? [];
  const nodeMap = new Map(activeArtifact.nodes.map((node) => [node.id, node]));
  const visibleNodes = activeArtifact.nodes.filter((node) => {
    let parentId = node.parentId;
    while (parentId) {
      if (collapsedNodeIds.includes(parentId)) return false;
      parentId = nodeMap.get(parentId)?.parentId;
    }
    return true;
  });

  const previewArtifacts = useMemo(() => {
    if (!project.activeChangeSet || showBefore) return project.artifacts;
    return applyCanonicalOperations(project, project.activeChangeSet.operations).artifacts.map((artifact) => ({ ...artifact, version: Math.max(1, artifact.version - 1) }));
  }, [project, showBefore]);
  const renderedArtifact =
    previewArtifacts.find((artifact) => artifact.id === activeArtifactId) ?? activeArtifact;

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      const canvas = canvasRef.current;
      const selectedId = selectedIds[0];
      if (!canvas || !selectedId || !isLayerScope || (!artifactGalleryOpen && !reviewSheetOpen)) return;
      const selectedElement = canvas.querySelector<HTMLElement>(`[data-semantic-node="${selectedId}"]`);
      if (!selectedElement) return;
      const artifactElement = canvas.querySelector<HTMLElement>(`[data-semantic-node="${activeArtifact.id}"]`);
      const protectedElement = reviewSheetOpen ? artifactElement ?? selectedElement : selectedElement;

      const canvasBounds = canvas.getBoundingClientRect();
      const nodeBounds = protectedElement.getBoundingClientRect();
      const safeLeft = canvasBounds.left + (artifactGalleryOpen ? 310 : 24);
      const safeRight = canvasBounds.right - (reviewSheetOpen ? 424 : 24);
      const safeTop = canvasBounds.top + 24;
      const safeBottom = canvasBounds.bottom - 74;
      const safeWidth = Math.max(120, safeRight - safeLeft);
      const safeHeight = Math.max(120, safeBottom - safeTop);
      let deltaX = 0;
      let deltaY = 0;

      if (nodeBounds.width > safeWidth) deltaX = (safeLeft + safeRight) / 2 - (nodeBounds.left + nodeBounds.right) / 2;
      else if (nodeBounds.left < safeLeft) deltaX = safeLeft - nodeBounds.left;
      else if (nodeBounds.right > safeRight) deltaX = safeRight - nodeBounds.right;

      if (nodeBounds.height > safeHeight) deltaY = (safeTop + safeBottom) / 2 - (nodeBounds.top + nodeBounds.bottom) / 2;
      else if (nodeBounds.top < safeTop) deltaY = safeTop - nodeBounds.top;
      else if (nodeBounds.bottom > safeBottom) deltaY = safeBottom - nodeBounds.bottom;

      if (Math.abs(deltaX) > 1 || Math.abs(deltaY) > 1) {
        setCanvasView((current) => ({ ...current, x: current.x + deltaX, y: current.y + deltaY }));
      }

      if (reviewSheetOpen && panel === "segments") {
        layerPanelRef.current
          ?.querySelector<HTMLElement>(`[data-layer-id="${selectedId}"]`)
          ?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      }
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [activeArtifact.id, artifactGalleryOpen, isLayerScope, panel, reviewSheetOpen, selectedIds]);

  useEffect(() => {
    const animationFrame = window.requestAnimationFrame(() => {
      const renderedIds = new Set(
        Array.from(canvasRef.current?.querySelectorAll<HTMLElement>("[data-semantic-node]") ?? [])
          .map((element) => element.dataset.semanticNode)
          .filter(Boolean),
      );
      const missing = activeArtifact.nodes
        .filter((node) => node.visible !== false && !renderedIds.has(node.id))
        .map((node) => node.id);
      if (missing.length) console.warn("Meant semantic coverage gap", missing);
    });
    return () => window.cancelAnimationFrame(animationFrame);
  }, [activeArtifact]);

  const selectTarget = useCallback((targetId: string, revealControls = true) => {
    setSelectedIds((current) =>
      current.includes(targetId)
        ? current.length > 1
          ? current.filter((id) => id !== targetId)
          : current
        : [targetId],
    );
    setScope("element");
    if (revealControls) {
      setPanel("instruments");
      setReviewSheetOpen(true);
      setArtifactGalleryOpen(false);
      setPanelGuide(null);
    }
  }, []);

  const setCanvasScale = useCallback((nextScale: number) => {
    setCanvasView((current) => ({
      ...current,
      scale: Math.min(2.4, Math.max(0.45, nextScale)),
    }));
  }, []);

  const resetCanvasView = useCallback(() => {
    setCanvasView({ x: 0, y: 0, scale: 1 });
  }, []);

  const handleCanvasWheel = useCallback((wheelEvent: React.WheelEvent<HTMLDivElement>) => {
    wheelEvent.preventDefault();
    const bounds = wheelEvent.currentTarget.getBoundingClientRect();
    const pointerX = wheelEvent.clientX - (bounds.left + bounds.width / 2);
    const pointerY = wheelEvent.clientY - (bounds.top + bounds.height / 2);
    const factor = Math.exp(-wheelEvent.deltaY * 0.0014);
    setCanvasView((current) => {
      const nextScale = Math.min(2.4, Math.max(0.45, current.scale * factor));
      const ratio = nextScale / current.scale;
      return {
        scale: nextScale,
        x: pointerX - (pointerX - current.x) * ratio,
        y: pointerY - (pointerY - current.y) * ratio,
      };
    });
  }, []);

  const beginCanvasPan = useCallback((pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    if (pointerEvent.button !== 0) return;
    const target = pointerEvent.target as HTMLElement;
    if (target.closest("button, textarea, input, select, .meant-target")) return;
    pointerEvent.currentTarget.setPointerCapture(pointerEvent.pointerId);
    canvasPanRef.current = {
      pointerId: pointerEvent.pointerId,
      startX: pointerEvent.clientX,
      startY: pointerEvent.clientY,
      originX: canvasView.x,
      originY: canvasView.y,
    };
    setPanelGuide(null);
    setIsPanning(true);
  }, [canvasView.x, canvasView.y]);

  const moveCanvasPan = useCallback((pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    const pan = canvasPanRef.current;
    if (!pan || pan.pointerId !== pointerEvent.pointerId) return;
    setCanvasView((current) => ({
      ...current,
      x: pan.originX + pointerEvent.clientX - pan.startX,
      y: pan.originY + pointerEvent.clientY - pan.startY,
    }));
  }, []);

  const endCanvasPan = useCallback((pointerEvent: React.PointerEvent<HTMLDivElement>) => {
    if (canvasPanRef.current?.pointerId !== pointerEvent.pointerId) return;
    canvasPanRef.current = null;
    setIsPanning(false);
  }, []);

  const addEvidenceFile = useCallback((file?: File) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setEvidenceNotice("Meant currently accepts image references, screenshots, and visual timing boards.");
      return;
    }
    if (file.size > 1_500_000) {
      setEvidenceNotice("Keep each visual under 1.5 MB so it can remain transient and responsive.");
      return;
    }
    if (pendingEvidence.length >= 3) {
      setEvidenceNotice("Use no more than three high-value evidence items for one expression.");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") return;
      const item: PendingEvidence = {
        id: uid("evidence"),
        kind: evidenceKind,
        label: file.name.slice(0, 80) || evidenceLabels[evidenceKind],
        governs: evidenceGovernance.trim() || "Composition, geometry, and visual direction only",
        provenance: "user_provided",
        mimeType: file.type,
        dataUrl: reader.result,
      };
      setPendingEvidence((current) => [...current, item]);
      setEvidenceGovernance("");
      setEvidenceNotice("Visual evidence attached for this expression only.");
      if (evidenceInputRef.current) evidenceInputRef.current.value = "";
    };
    reader.onerror = () => setEvidenceNotice("That visual could not be read. Try a smaller image.");
    reader.readAsDataURL(file);
  }, [evidenceGovernance, evidenceKind, pendingEvidence.length]);

  const addWrittenEvidence = useCallback(() => {
    const governs = evidenceGovernance.trim();
    if (!governs) {
      setEvidenceNotice("Describe the decision this note should govern.");
      return;
    }
    if (pendingEvidence.length >= 3) {
      setEvidenceNotice("Use no more than three high-value evidence items for one expression.");
      return;
    }
    setPendingEvidence((current) => [...current, {
      id: uid("evidence"),
      kind: "written_note",
      label: evidenceLabels.written_note,
      governs,
      provenance: "user_provided",
    }]);
    setEvidenceGovernance("");
    setEvidenceNotice("Direction note attached for this expression.");
  }, [evidenceGovernance, pendingEvidence.length]);

  const captureExpression = useCallback((override?: {
    text: string;
    captureMethod: "gpt-transcribe" | "gpt-live-transcribe" | "speech-recognition" | "typed-fallback";
  }) => {
    const text = override?.text.trim() || `${draft} ${interim}`.trim();
    if (!text) return;
    const artifact = projectRef.current.artifacts.find(
      (item) => item.id === activeArtifactIdRef.current,
    );
    if (!artifact) return;
    const targets = artifact.nodes.filter((node) => selectedIdsRef.current.includes(node.id));
    const packet: ExpressionPacket = {
      id: uid("expression"),
      createdAt: now(),
      status: "captured",
      scope,
      voiceEnvelope: {
        id: uid("voice"),
        rawTranscript: text,
        corrections: [],
        captureMethod: override?.captureMethod ?? captureMethod,
        audioRetained: false,
        createdAt: now(),
      },
      anchor: {
        artifactId: artifact.id,
        artifactVersion: artifact.version,
        // Keep the current selection as grounding context even when authority
        // is artifact-wide. Short follow-ups like "now make it green" need a
        // stable referent, while contextualTargetIds still decides whether the
        // instruction is layer-specific or artifact-wide.
        targetIds: scope === "project" ? [] : targets.map((target) => target.id),
        targetNames:
          scope === "project"
            ? ["Entire campaign"]
            : scope === "artifact"
              ? [artifact.name]
              : targets.map((target) => target.name),
      },
      interpretation: interpretExpression(text),
      evidencePack: {
        items: pendingEvidence.map((item) => ({
          id: item.id,
          kind: item.kind,
          label: item.label,
          governs: item.governs,
          provenance: item.provenance,
          mimeType: item.mimeType,
        })),
        authorityNote: "Each evidence item governs only the property named by the user; it cannot silently override brand, accessibility, copy, or structure.",
      },
    };
    evidencePayloadsRef.current.set(packet.id, pendingEvidence);
    const currentProject = projectRef.current;
    const nextProject: StudioProject = {
      ...currentProject,
      expressionPackets: [packet, ...currentProject.expressionPackets],
      provenance: [
        event(
          "expression_captured",
          "Expression captured",
          `${packet.anchor.targetNames.join(", ")} · ${packet.scope} scope`,
        ),
        ...(pendingEvidence.length
          ? [event(
              "evidence_added",
              "Evidence pack attached",
              `${pendingEvidence.length} property-scoped item${pendingEvidence.length === 1 ? "" : "s"}`,
            )]
          : []),
        ...currentProject.provenance,
      ],
    };
    projectRef.current = nextProject;
    setProject(nextProject);
    setDraft("");
    setInterim("");
    queueMicrotask(() => void compileExpressionRef.current?.(packet, pendingEvidence));
    setPendingEvidence([]);
    setEvidenceOpen(false);
    setEvidenceNotice("");
  }, [captureMethod, draft, interim, pendingEvidence, scope]);

  const closeVoiceCapture = useCallback(() => {
    microphoneStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaRecorderRef.current = null;
    microphoneStreamRef.current = null;
    setIsListening(false);
  }, []);

  const startBrowserFallback = useCallback((reason: string) => {
    const Recognition = window.SpeechRecognition ?? window.webkitSpeechRecognition;
    if (!Recognition) {
      setCaptureMethod("typed-fallback");
      setIsListening(false);
      setTranscriptionState("error");
      setTranscriptionNotice(reason);
      return;
    }
    const recognition = new Recognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";
    recognition.onresult = (resultEvent) => {
      let finalText = "";
      let interimText = "";
      for (let index = resultEvent.resultIndex; index < resultEvent.results.length; index += 1) {
        const result = resultEvent.results[index];
        if (result.isFinal) finalText += result[0].transcript;
        else interimText += result[0].transcript;
      }
      if (finalText) setDraft((current) => `${current} ${finalText}`.trim());
      setInterim(interimText);
    };
    recognition.onerror = () => {
      setCaptureMethod("typed-fallback");
      setIsListening(false);
      setTranscriptionState("error");
      setTranscriptionNotice("Browser dictation stopped unexpectedly. You can continue by typing.");
    };
    recognition.onend = () => {
      setIsListening(false);
      setTranscriptionState("idle");
    };
    recognitionRef.current = recognition;
    setCaptureMethod("speech-recognition");
    setTranscriptionState("fallback");
    setTranscriptionNotice(`${reason} Using browser dictation for this turn.`);
    setIsListening(true);
    recognition.start();
  }, []);

  const transcribeRecordedTurn = useCallback(async (audio: Blob, extension: string) => {
    if (!audio.size) {
      setTranscriptionState("error");
      setTranscriptionNotice("No speech was recorded. Try again.");
      return;
    }
    setTranscriptionState("finalizing");
    setTranscriptionNotice("Understanding your direction…");
    try {
      const form = new FormData();
      form.set("audio", audio, `meant-direction.${extension}`);
      const response = await fetchWithTimeout("/api/transcribe", {
        method: "POST",
        body: form,
      }, 15_000);
      const body = await response.json() as { error?: string; text?: string };
      if (!response.ok || !body.text?.trim()) {
        throw new Error(body.error ?? "Meant could not hear that direction.");
      }
      const transcript = body.text.trim();
      setDraft([draftAtListenStartRef.current, transcript].filter(Boolean).join(" "));
      setInterim("");
      setCaptureMethod("gpt-transcribe");
      setTranscriptionState("idle");
      setTranscriptionNotice("Ready to apply.");
    } catch (error) {
      setTranscriptionState("error");
      setTranscriptionNotice(
        error instanceof DOMException && error.name === "AbortError"
          ? "Voice capture took too long. Try a shorter direction."
          : error instanceof Error
            ? error.message
            : "Meant could not hear that direction.",
      );
    }
  }, []);

  const startRecordedTranscription = useCallback(async () => {
    setTranscriptionState("connecting");
    setTranscriptionNotice("");
    setIsListening(true);
    try {
      if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") {
        startBrowserFallback("Recorded voice capture is unavailable on this browser.");
        return;
      }
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      microphoneStreamRef.current = stream;
      const preferredType = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"]
        .find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = preferredType
        ? new MediaRecorder(stream, { mimeType: preferredType })
        : new MediaRecorder(stream);
      voiceCaptureCancelledRef.current = false;
      mediaRecorderRef.current = recorder;
      recordedAudioRef.current = [];
      recorder.addEventListener("dataavailable", (event) => {
        if (event.data.size) recordedAudioRef.current.push(event.data);
      });
      recorder.addEventListener("stop", () => {
        if (voiceCaptureCancelledRef.current) {
          recordedAudioRef.current = [];
          closeVoiceCapture();
          return;
        }
        const mimeType = recorder.mimeType || recordedAudioRef.current[0]?.type || "audio/webm";
        const extension = mimeType.includes("mp4") ? "m4a" : mimeType.includes("ogg") ? "ogg" : "webm";
        const audio = new Blob(recordedAudioRef.current, { type: mimeType });
        recordedAudioRef.current = [];
        closeVoiceCapture();
        void transcribeRecordedTurn(audio, extension);
      });
      recorder.addEventListener("error", () => {
        closeVoiceCapture();
        setTranscriptionState("error");
        setTranscriptionNotice("Voice capture stopped unexpectedly. You can continue by typing.");
      });
      recorder.start(250);
      setCaptureMethod("gpt-transcribe");
      setTranscriptionState("listening");
      setTranscriptionNotice("Listening… tap again when you’re done.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Voice capture is unavailable.";
      closeVoiceCapture();
      startBrowserFallback(message);
    }
  }, [closeVoiceCapture, startBrowserFallback, transcribeRecordedTurn]);

  const stopRecordedTranscription = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    setIsListening(false);
    setTranscriptionState("finalizing");
    setTranscriptionNotice("Understanding your direction…");
    recorder.stop();
  }, []);

  const toggleListening = useCallback(() => {
    if (isListening) {
      if (mediaRecorderRef.current) stopRecordedTranscription();
      else recognitionRef.current?.stop();
      return;
    }
    draftAtListenStartRef.current = draft.trim();
    void startRecordedTranscription();
  }, [draft, isListening, startRecordedTranscription, stopRecordedTranscription]);

  useEffect(() => () => {
    recognitionRef.current?.abort();
    const recorder = mediaRecorderRef.current;
    voiceCaptureCancelledRef.current = true;
    if (recorder && recorder.state !== "inactive") recorder.stop();
    closeVoiceCapture();
  }, [closeVoiceCapture]);

  const refetchAuthoritativeProject = useCallback(async (minimumRevision?: number) => {
    if (!workspaceIdRef.current) return;
    const response = await fetch(`/api/project?workspaceId=${encodeURIComponent(workspaceIdRef.current)}`, { cache: "no-store" });
    if (!response.ok) return;
    const body = await response.json() as { project?: StudioProject | null; revision?: number; history?: CommittedChange[] };
    if (!body.project || !body.revision || (minimumRevision && body.revision < minimumRevision)) return;
    projectRef.current = body.project;
    setProject(body.project);
    setProjectRevision(body.revision);
    projectRevisionRef.current = body.revision;
    setHistory(body.history ?? []);
    setPersistenceStatus("saved");
  }, []);

  const stageChangeSet = useCallback(
    async (input: {
      expressionPacketId: string;
      summary: string;
      rationale: string;
      assumptions?: string[];
      designPlan?: DesignPlan;
      operations: OperationInput[];
      reveal?: boolean;
      surface?: ExpressionSurface;
    }) => {
      const current = projectRef.current;
      const packet = current.expressionPackets.find((item) => item.id === input.expressionPacketId);
      if (!packet) return { ok: false, error: "Expression packet not found" };
      if (!workspaceIdRef.current || projectRevisionRef.current < 1) return { ok: false, error: "Project context is not ready" };
      if (input.operations.length > 24) {
        return { ok: false, error: "A change set must contain between 1 and 24 operations" };
      }
      const legacyOperations = input.operations.filter((operation): operation is DesignOperation => "control" in operation);
      const primitiveOperations = input.operations.filter((operation): operation is Exclude<OperationInput, DesignOperation> => "property" in operation);
      const operations: OperationInput[] = [...normalizeDesignOperations(legacyOperations), ...primitiveOperations];
      if (operations.length === 0) return { ok: false, error: "A change set must contain at least one operation" };
      const protectedControls = input.designPlan?.semanticTrace
        ? protectedControlsForGraph(input.designPlan.semanticTrace)
        : new Set<InstrumentId>();
      for (const protectedPhrase of [...packet.interpretation.preserve, ...packet.interpretation.avoid]) {
        for (const control of protectedControlsForText(protectedPhrase)) protectedControls.add(control);
      }
      const preservationConflict = legacyOperations.find((operation) => protectedControls.has(operation.control));
      if (preservationConflict) {
        return { ok: false, error: `That proposal would change ${humanizeControl(preservationConflict.control)}, which you asked Meant to keep.` };
      }

      const invalid = legacyOperations.find((operation) => {
        const artifact = current.artifacts.find((item) => item.id === operation.artifactId);
        if (!artifact) return true;
        if (packet.scope !== "project" && artifact.id !== packet.anchor.artifactId) return true;
        if (!Array.isArray(operation.targetIds) || operation.targetIds.length > 16) return true;
        const knownNodes = new Map(artifact.nodes.map((node) => [node.id, node]));
        const knownNodeIds = new Set(knownNodes.keys());
        if (operation.targetIds.some((targetId) => !knownNodeIds.has(targetId))) return true;
        if (operation.targetIds.some((targetId) => !knownNodes.get(targetId)?.capabilities.includes(operation.control))) return true;
        if (
          (packet.scope === "element" || packet.scope === "region") &&
          (operation.targetIds.length === 0 ||
            operation.targetIds.some((targetId) => !packet.anchor.targetIds.includes(targetId)))
        ) {
          return true;
        }
        const allowed = capabilityManifests[artifact.kind].instruments.some(
          (instrument) => instrument.id === operation.control,
        );
        return !allowed || !Number.isFinite(operation.value) || operation.value < 0 || operation.value > 100;
      });
      if (invalid) return { ok: false, error: "One or more operations violate the artifact capability manifest" };

      const changeSetId = uid("change");
      const response = await fetch("/api/transactions/stage", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          workspaceId: workspaceIdRef.current,
          projectId: current.id,
          expectedRevision: projectRevisionRef.current,
          changeSetId,
          expressionPacketId: packet.id,
          expressionPacket: packet,
          summary: input.summary,
          rationale: input.rationale,
          assumptions: input.assumptions ?? [],
          designPlan: input.designPlan,
          operations,
        }),
      });
      const body = await response.json() as { error?: string; changeSet?: ChangeSet; operationDigest?: string; authoritativeRevision?: number };
      if (!response.ok || !body.changeSet) {
        if (response.status === 409) await refetchAuthoritativeProject(body.authoritativeRevision);
        if (e2eModeRef.current) setE2eLastResult({ ok: false, action: "stage", status: response.status, error: body.error ?? "The change could not be staged" });
        return { ok: false, error: body.error ?? "The change could not be staged" };
      }
      const changeSet = body.changeSet;
      if (e2eModeRef.current) {
        const surface = input.surface ?? (packet.voiceEnvelope.captureMethod === "gpt-transcribe" || packet.voiceEnvelope.captureMethod === "gpt-live-transcribe" || packet.voiceEnvelope.captureMethod === "speech-recognition" ? "voice" : "typed");
        setE2eLastResult(null);
        setE2eCaptures((items) => [...items, { surface, operations: changeSet.operations, operationDigest: body.operationDigest ?? changeSet.authority.operationDigest }]);
      }
      const nextProject: StudioProject = {
        ...current,
        activeChangeSet: changeSet,
        expressionPackets: current.expressionPackets.map((item) =>
          item.id === packet.id ? { ...item, status: "staged" } : item,
        ),
        provenance: [
          event(
            "change_staged",
            "Change set staged",
            `${changeSet.operations.length} typed operation${changeSet.operations.length === 1 ? "" : "s"}`,
          ),
          ...current.provenance,
        ],
      };
      projectRef.current = nextProject;
      setProject(nextProject);
      setShowBefore(false);
      if (input.reveal !== false) {
        setPanel("intent");
        setArtifactGalleryOpen(false);
        setPanelGuide("layers");
        setReviewSheetOpen(true);
      }
      return { ok: true, changeSet };
    },
    [refetchAuthoritativeProject],
  );

  const reviseChangeSet = useCallback(
    async (input: {
      changeSetId: string;
      summary?: string;
      rationale?: string;
      assumptions?: string[];
      designPlan?: DesignPlan;
      operations: OperationInput[];
    }) => {
      const current = projectRef.current.activeChangeSet;
      if (!current || current.id !== input.changeSetId) {
        return { ok: false, error: "Active change set not found" };
      }
      return await stageChangeSet({
        expressionPacketId: current.expressionPacketId,
        summary: input.summary ?? current.summary,
        rationale: input.rationale ?? current.rationale,
        assumptions: input.assumptions ?? current.assumptions,
        designPlan: input.designPlan ?? current.designPlan,
        operations: input.operations,
      });
    },
    [stageChangeSet],
  );

  const applyDirect = useCallback(async (options: { quiet?: boolean } = {}) => {
    const current = projectRef.current;
    const changeSet = current.activeChangeSet;
    if (!changeSet) return { ok: false, error: "No revision is ready to apply" };

    if (e2eModeRef.current) setE2ePostApprovalCalls(["POST /api/transactions/apply"]);
    const response = await fetch("/api/transactions/apply", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(e2eModeRef.current && e2eFaultRef.current !== "none" ? { "x-meant-e2e-fault": e2eFaultRef.current } : {}),
      },
      body: JSON.stringify({ workspaceId: workspaceIdRef.current, projectId: current.id, changeSetId: changeSet.id,
        expectedRevision: changeSet.authority.baseRevision, operationDigest: changeSet.authority.operationDigest }),
    });
    const body = await response.json() as { error?: string; project?: StudioProject; committedChangeId?: string; newRevision?: number; authoritativeRevision?: number };
    if (!response.ok || !body.project || !body.committedChangeId || !body.newRevision) {
      if (response.status === 409) await refetchAuthoritativeProject(body.authoritativeRevision);
      if (e2eModeRef.current) setE2eLastResult({ ok: false, status: response.status, error: body.error ?? "The change could not be committed" });
      return { ok: false, status: response.status, authoritativeRevision: body.authoritativeRevision, error: body.error ?? "The change could not be committed" };
    }
    const nextProject = body.project;
    projectRef.current = nextProject;
    setProject(nextProject);
    setProjectRevision(body.newRevision);
    projectRevisionRef.current = body.newRevision;
    setHistory((items) => [{ id: body.committedChangeId!, projectId: current.id, workspaceId: workspaceIdRef.current!, parentRevision: body.newRevision! - 1,
      revision: body.newRevision!, kind: "apply" as const, operationDigest: changeSet.authority.operationDigest, summary: changeSet.summary, committedAt: now() }, ...items].slice(0, 40));
    setPersistenceStatus("saved");
    setShowBefore(false);
    const packet = nextProject.expressionPackets.find((item) => item.id === changeSet.expressionPacketId);
    if (!options.quiet) {
      setAppliedNotice(`${packet?.anchor.targetNames.join(", ") ?? "Design"} updated. Undo is available.`);
      setCanvasPulse(true);
      window.setTimeout(() => setCanvasPulse(false), 700);
      window.setTimeout(() => setAppliedNotice(""), 5_000);
    }
    setPanelGuide(null);
    setReviewSheetOpen(false);
    if (e2eModeRef.current) setE2eLastResult({ ok: true, committedChangeId: body.committedChangeId, newRevision: body.newRevision });
    return { ok: true, changeSet, committedChangeId: body.committedChangeId, newRevision: body.newRevision };
  }, [refetchAuthoritativeProject]);

  const undoCommittedChange = useCallback(async (committedChangeId: string, expectedRevision = projectRevisionRef.current) => {
    if (!workspaceIdRef.current) return { ok: false, error: "Project context is not ready" };
    const response = await fetch("/api/transactions/undo", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ workspaceId: workspaceIdRef.current, projectId: projectRef.current.id, committedChangeId, expectedRevision, domain: "artifact" }),
    });
    const body = await response.json() as { error?: string; project?: StudioProject; committedChangeId?: string; revertedChangeId?: string; newRevision?: number; authoritativeRevision?: number };
    if (!response.ok || !body.project || !body.newRevision || !body.committedChangeId) {
      if (response.status === 409) await refetchAuthoritativeProject(body.authoritativeRevision);
      return { ok: false, status: response.status, authoritativeRevision: body.authoritativeRevision, error: body.error ?? "The committed change could not be undone" };
    }
    projectRef.current = body.project;
    setProject(body.project);
    setProjectRevision(body.newRevision);
    projectRevisionRef.current = body.newRevision;
    await refetchAuthoritativeProject(body.newRevision);
    setPanel("history");
    setReviewSheetOpen(true);
    setAgentStatus("ready");
    setAgentNotice("Change undone. The canvas is back to its prior state.");
    return { ok: true, committedChangeId: body.committedChangeId };
  }, [refetchAuthoritativeProject]);

  const resetDemo = useCallback(() => {
    recognitionRef.current?.abort();
    voiceCaptureCancelledRef.current = true;
    if (mediaRecorderRef.current?.state !== "inactive") mediaRecorderRef.current?.stop();
    closeVoiceCapture();
    const resetProject = structuredClone(seedProject);
    projectRef.current = resetProject;
    activeArtifactIdRef.current = resetProject.artifacts[0]!.id;
    selectedIdsRef.current = ["web-supporting-copy"];
    evidencePayloadsRef.current.clear();
    setProject(resetProject);
    setActiveArtifactId(resetProject.artifacts[0]!.id);
    setSelectedIds(["web-supporting-copy"]);
    setScope("artifact");
    setDraft("");
    setInterim("");
    setAgentStatus("idle");
    setAgentNotice("");
    setTranscriptionNotice("");
    setPanel("segments");
    setArtifactGalleryOpen(false);
    setReviewSheetOpen(false);
    setCollapsedNodeIds([]);
    setPendingEvidence([]);
    setEvidenceNotice("");
    setCanvasView({ x: 0, y: 0, scale: 1 });
    setPanelGuide(null);
    setShowBefore(false);
    setSettingsOpen(false);
    setResetConfirmOpen(false);
    seenPanelGuidesRef.current.clear();
    setAppliedNotice("Bobalicious demo restored.");
    window.setTimeout(() => setAppliedNotice(""), 3_500);
  }, [closeVoiceCapture]);

  const requestClarification = useCallback((packetId: string, question: string, options: string[]) => {
    setProject((state) => ({
      ...state,
      expressionPackets: state.expressionPackets.map((packet) =>
        packet.id === packetId
          ? { ...packet, status: "needs_clarification", clarification: { question, options } }
          : packet,
      ),
      provenance: [event("clarification_requested", "Clarification requested", question), ...state.provenance],
    }));
    return { ok: true, packetId, question, options };
  }, []);

  const finishInstantTurn = useCallback((
    packet: ExpressionPacket,
    message: string,
    status: "applied" | "rejected" = "rejected",
  ) => {
    const current = projectRef.current;
    const nextProject: StudioProject = {
      ...current,
      activeChangeSet: undefined,
      expressionPackets: current.expressionPackets.map((item) =>
        item.id === packet.id ? { ...item, status } : item,
      ),
    };
    projectRef.current = nextProject;
    setProject(nextProject);
    setPanelGuide(null);
    setReviewSheetOpen(false);
    setAgentStatus("ready");
    setAgentNotice(message);
    setAppliedNotice(message);
    window.setTimeout(() => setAppliedNotice(""), 4_000);
  }, []);

  const compileExpression = useCallback(async (
    packet: ExpressionPacket,
    evidence = evidencePayloadsRef.current.get(packet.id) ?? [],
  ) => {
    setAgentStatus("interpreting");
    setAgentNotice("Reading the design and your request…");
    let current = projectRef.current;
    let workingPacket = packet;
    const spokenTranscript = packet.voiceEnvelope.correctedTranscript ?? packet.voiceEnvelope.rawTranscript;
    const previousTurn = current.expressionPackets.find((item) => item.id !== packet.id);
    const previousAppliedTranscript = previousTurn?.status === "applied"
      ? previousTurn.contextResolution?.resolvedTranscript ?? previousTurn.voiceEnvelope.correctedTranscript ?? previousTurn.voiceEnvelope.rawTranscript
      : undefined;
    const contextual = resolveContextualFollowUp(spokenTranscript, previousAppliedTranscript);
    if (contextual.kind === "missing_context") {
      finishInstantTurn(packet, "Tell Meant what you want repeated on this layer.");
      return;
    }
    const transcript = contextual.transcript;
    if (contextual.kind === "inherited" && previousTurn) {
      workingPacket = {
        ...packet,
        contextResolution: {
          sourceExpressionPacketId: previousTurn.id,
          sourceTranscript: previousAppliedTranscript!,
          resolvedTranscript: transcript,
        },
      };
      current = {
        ...current,
        expressionPackets: current.expressionPackets.map((item) => item.id === packet.id ? workingPacket : item),
      };
      projectRef.current = current;
      setProject(current);
    }
    const disposition = instantLanguageDisposition(transcript);
    if (disposition === "advice") {
      finishInstantTurn(workingPacket, "That sounds like a design question, so Meant left the work unchanged.");
      return;
    }
    if (disposition === "preserve") {
      finishInstantTurn(workingPacket, "Understood. Meant left that design choice unchanged.");
      return;
    }
    if (disposition === "unsupported") {
      finishInstantTurn(workingPacket, "That control is not available yet. Try size, color, alignment, spacing, contrast, warmth, blur, or shape.");
      return;
    }

    const directTranscript = actionableLanguage(transcript);
    const directPacket: ExpressionPacket = {
      ...workingPacket,
      voiceEnvelope: { ...workingPacket.voiceEnvelope, correctedTranscript: directTranscript },
    };
    const primitiveChange = primitiveChangeForLanguage(directTranscript);
    if (primitiveChange) {
      const primitiveOperations: OperationInput[] = current.artifacts.flatMap((artifact) => {
        if (workingPacket.scope !== "project" && artifact.id !== workingPacket.anchor.artifactId) return [];
        const targetIds = contextualTargetIds(artifact, directTranscript, workingPacket.scope, workingPacket.anchor.artifactId, workingPacket.anchor.targetIds, primitiveChange.primitive)
          .filter((targetId) => executablePropertiesForNode(artifact.nodes.find((node) => node.id === targetId)!).includes(primitiveChange.primitive));
        return targetIds.length ? [{ artifactId: artifact.id, targetIds, property: primitiveChange.primitive, value: primitiveChange.value }] : [];
      });
      if (primitiveOperations.length) {
        const staged = await stageChangeSet({ expressionPacketId: workingPacket.id, summary: directTranscript, rationale: "Exact direct primitive operation.", operations: primitiveOperations, reveal: false });
        if (staged.ok && (await applyDirect()).ok) {
          setAgentStatus("ready"); setAgentNotice("Change applied."); return;
        }
      }
    }
    if (primitiveChange) {
      finishInstantTurn(workingPacket, "Select or name the layer you want to change, then try again.");
      return;
    }
    const fillCommands = fillCommandsForLanguage(directTranscript);
    if (fillCommands.length) {
      const colorOperations: OperationInput[] = current.artifacts.flatMap((artifact) => {
        if (workingPacket.scope !== "project" && artifact.id !== workingPacket.anchor.artifactId) return [];
        return fillCommands.flatMap((command) => {
          const targetIds = contextualTargetIds(artifact, command.transcript, workingPacket.scope, workingPacket.anchor.artifactId, workingPacket.anchor.targetIds, "fill")
            .filter((targetId) => executablePropertiesForNode(artifact.nodes.find((node) => node.id === targetId)!).includes("fill"));
          return targetIds.length ? [{ artifactId: artifact.id, targetIds, property: "fill" as const, value: command.fill }] : [];
        });
      });
      if (colorOperations.length) {
        const staged = await stageChangeSet({ expressionPacketId: workingPacket.id, summary: directTranscript, rationale: "Exact normalized color operation.", operations: colorOperations, reveal: false });
        if (staged.ok && (await applyDirect()).ok) {
          setAgentStatus("ready"); setAgentNotice("Change applied."); return;
        }
      }
    }
    if (fillCommands.length) {
      finishInstantTurn(workingPacket, "Select or name something that supports color, then try again.");
      return;
    }
    if (isReadabilityRequest(directTranscript)) {
      const artifact = current.artifacts.find((item) => item.id === workingPacket.anchor.artifactId);
      const targetIds = artifact ? contextualTargetIds(artifact, directTranscript, workingPacket.scope, workingPacket.anchor.artifactId, workingPacket.anchor.targetIds, "fill") : [];
      if (artifact && targetIds.length) {
        const readabilityOperations: OperationInput[] = targetIds.map((targetId) => ({ artifactId: artifact.id, targetIds: [targetId], property: "fill", value: "#3A241C" }));
        const staged = await stageChangeSet({ expressionPacketId: workingPacket.id, summary: "Improve readability", rationale: "Exact high-contrast foreground color.", operations: readabilityOperations, reveal: false });
        if (staged.ok && (await applyDirect()).ok) { setAgentStatus("ready"); setAgentNotice("Readability fixed."); return; }
      }
    }
    const directControls = suggestedControlForLanguage(directTranscript);
    const asksForExploration = /\b(?:redesign|reimagine|explore|options|directions|editorial system|whole design|entire campaign|across the campaign)\b/i.test(transcript);
    const asksForSemanticInterpretation =
      /\b(?:but|without|while|keep|preserve|still|not|rather than)\b/i.test(transcript) &&
      /\b(?:feel|warm|sterile|playful|friendly|premium|luxur|clean|minimal|bold|loud|organic|earthy|editorial|calm|energy|tactile|intimate|character)\b/i.test(transcript);
    const isDirectControlRequest = directControls.length > 0 && !asksForExploration && !asksForSemanticInterpretation;

    if (isDirectControlRequest) {
      const operations = suggestedOperations(directPacket, current.artifacts);
      if (!operations.length) {
        finishInstantTurn(
          workingPacket,
          hasSemanticTargetLanguage(directTranscript)
            ? "That layer does not support this adjustment. Select a compatible layer and try again."
            : "Select or name what you want to adjust, then try again.",
        );
        return;
      }
      if (!operationsWouldChange(operations, current.artifacts)) {
        finishInstantTurn(workingPacket, "That adjustment is already at its current limit.", "applied");
        return;
      }
      const direct = await stageChangeSet({
        expressionPacketId: workingPacket.id,
        summary: workingPacket.interpretation.desiredOutcome,
        rationale: "Mapped the request directly to the available design controls.",
        assumptions: [],
        operations,
        reveal: false,
      });
      if (direct?.ok && (await applyDirect()).ok) {
        setAgentStatus("ready");
        setAgentNotice("Change applied.");
        return;
      }
      finishInstantTurn(workingPacket, direct?.error ?? "That direct change could not be applied.");
      return;
    }
    const exploringTimer = window.setTimeout(
      () => setAgentNotice("Exploring a few design directions…"),
      1_200,
    );
    const choosingTimer = window.setTimeout(
      () => setAgentNotice("Choosing the strongest direction…"),
      7_500,
    );
    try {
      const beforeSnapshot = captureRenderSnapshot(canvasRef.current, workingPacket.anchor.artifactId);
      const intentRequest = fetchWithTimeout("/api/intent", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          transcript,
          scope: workingPacket.scope,
          anchor: workingPacket.anchor,
          conversation: current.expressionPackets
            .filter((item) => item.id !== workingPacket.id)
            .slice(0, 4)
            .map((item) => ({
              transcript: item.voiceEnvelope.rawTranscript,
              resolvedTranscript: item.contextResolution?.resolvedTranscript,
              status: item.status,
              scope: item.scope,
              anchor: item.anchor,
            })),
          project: {
            name: current.name,
            brief: current.brief,
            accentRule: current.accentRule,
            designIntelligence: current.designIntelligence,
            artifacts: current.artifacts,
          },
          evidencePack: {
            authorityNote: workingPacket.evidencePack?.authorityNote ?? "Evidence governs only the properties explicitly named by the user.",
            items: (workingPacket.evidencePack?.items ?? []).map((item) => ({
              ...item,
              dataUrl: evidence.find((candidate) => candidate.id === item.id)?.dataUrl,
            })),
          },
          renderSnapshot: beforeSnapshot,
        }),
      }, 30_000);
      const response = await intentRequest;
      const body = await response.json() as {
        error?: string;
        model?: string;
        result?: {
          interpretation: ExpressionPacket["interpretation"];
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
        };
      };
      if (!response.ok || !body.result) {
        throw new Error(body.error ?? "Meant could not understand that direction.");
      }

      const latest = projectRef.current;
      const interpretedProject: StudioProject = {
        ...latest,
        expressionPackets: latest.expressionPackets.map((item) =>
          item.id === workingPacket.id
            ? {
                ...item,
                status: body.result!.clarification.required ? "needs_clarification" : "interpreted",
                interpretation: body.result!.interpretation,
              }
            : item,
        ),
      };
      projectRef.current = interpretedProject;
      setProject(interpretedProject);

      if (body.result.clarification.required) {
        setPanel("intent");
        setArtifactGalleryOpen(false);
        setPanelGuide("layers");
        setReviewSheetOpen(true);
        requestClarification(
          workingPacket.id,
          body.result.clarification.question,
          body.result.clarification.options,
        );
        setAgentStatus("ready");
        setAgentNotice("One quick choice will help Meant get this right.");
        return;
      }

      const staged = await stageChangeSet({
        expressionPacketId: workingPacket.id,
        summary: body.result.proposal.summary,
        rationale: body.result.proposal.rationale,
        assumptions: body.result.proposal.assumptions,
        designPlan: body.result.proposal.designPlan,
        operations: body.result.proposal.operations,
        reveal: false,
      });
      if (!staged?.ok) {
        throw new Error(staged?.error ?? "The proposal violated the current capability contract.");
      }
      setPanel("intent");
      setArtifactGalleryOpen(false);
      setPanelGuide(null);
      setReviewSheetOpen(true);
      setAgentStatus("ready");
      setAgentNotice("Change ready for approval.");

    } catch (error) {
      const fallbackOperations = directControls.length && !asksForSemanticInterpretation
        ? suggestedOperations(directPacket, projectRef.current.artifacts)
        : [];
      if (fallbackOperations.length) {
        const fallback = await stageChangeSet({
          expressionPacketId: workingPacket.id,
          summary: workingPacket.interpretation.desiredOutcome,
          rationale: "Mapped the request to the design controls available for this selection.",
          assumptions: [],
          operations: fallbackOperations,
          reveal: false,
        });
        if (fallback?.ok) {
          const applied = await applyDirect();
          if (applied.ok) {
            setAgentStatus("ready");
            setAgentNotice("Change applied.");
            return;
          }
        }
      }
      const message = error instanceof DOMException && error.name === "AbortError"
        ? "That direction took too long. Try one shorter, more direct change."
        : "Meant couldn’t finish that design pass. Try a shorter direction or one direct change.";
      setAgentStatus("error");
      setAgentNotice(message);
      setAppliedNotice(message);
      setPanelGuide(null);
      setReviewSheetOpen(false);
      window.setTimeout(() => setAppliedNotice(""), 5_000);
    } finally {
      window.clearTimeout(exploringTimer);
      window.clearTimeout(choosingTimer);
    }
  }, [applyDirect, finishInstantTurn, requestClarification, stageChangeSet]);
  useEffect(() => {
    compileExpressionRef.current = compileExpression;
    return () => {
      compileExpressionRef.current = null;
    };
  }, [compileExpression]);

  const answerClarification = useCallback((packetId: string, answer: string) => {
    const current = projectRef.current;
    const packet = current.expressionPackets.find((item) => item.id === packetId);
    if (!packet) return;
    const original = packet.voiceEnvelope.correctedTranscript ?? packet.voiceEnvelope.rawTranscript;
    const correctedTranscript = `${original} Clarification: ${answer}.`;
    const nextProject: StudioProject = {
      ...current,
      expressionPackets: current.expressionPackets.map((item) =>
        item.id === packetId
          ? {
              ...item,
              status: "captured",
              clarification: undefined,
              voiceEnvelope: {
                ...item.voiceEnvelope,
                correctedTranscript,
                corrections: [
                  ...item.voiceEnvelope.corrections,
                  { replacedText: "Clarification requested", replacementText: answer },
                ],
              },
            }
          : item,
      ),
      provenance: [
        event("expression_captured", "Clarification added", answer),
        ...current.provenance,
      ],
    };
    projectRef.current = nextProject;
    setProject(nextProject);
    const correctedPacket = nextProject.expressionPackets.find((item) => item.id === packetId);
    if (correctedPacket) queueMicrotask(() => void compileExpressionRef.current?.(
      correctedPacket,
      evidencePayloadsRef.current.get(correctedPacket.id) ?? [],
    ));
  }, []);

  useEffect(() => {
    commandsRef.current = {
      getProjectContext: () => {
        const current = projectRef.current;
        const artifact = current.artifacts.find((item) => item.id === activeArtifactIdRef.current);
        return {
          project: {
            id: current.id,
            name: current.name,
            brief: current.brief,
            accentRule: current.accentRule,
            designIntelligence: current.designIntelligence,
          },
          identity: {
            projectId: current.id,
            workspaceId: workspaceIdRef.current,
            revision: projectRevisionRef.current,
          },
          activeArtifact: artifact,
          selection: selectedIdsRef.current,
          pendingExpressions: current.expressionPackets.filter((packet) => !["applied", "rejected"].includes(packet.status)),
          activeChangeSet: current.activeChangeSet,
          latestVerification: current.latestVerification,
        };
      },
      listPackets: (status?: string) => {
        const packets = projectRef.current.expressionPackets;
        return status ? packets.filter((packet) => packet.status === status) : packets;
      },
      inspectArtifact: (artifactId: string) => {
        const artifact = projectRef.current.artifacts.find((item) => item.id === artifactId);
        if (!artifact) return { ok: false, error: "Artifact not found" };
        return {
          artifact: {
            ...artifact,
            nodes: artifact.nodes.map((node) => ({ ...node, availableOperations: executablePropertiesForNode(node) })),
          },
          capabilityManifest: capabilityManifests[artifact.kind],
        };
      },
      stageChangeSet: (input) => stageChangeSet({ ...input, surface: "webmcp" }),
      reviseChangeSet,
      requestClarification,
      applyStaged: (changeSetId: string, expectedRevision: number, operationDigest: string) => {
        const active = projectRef.current.activeChangeSet;
        if (!active || active.id !== changeSetId) return { ok: false, error: "Active change set not found" };
        if (active.authority.baseRevision !== expectedRevision || active.authority.operationDigest !== operationDigest) {
          return { ok: false, error: "Approved authority does not match the staged change" };
        }
        setReviewSheetOpen(true);
        setAgentNotice("Apply is ready for your confirmation in Meant.");
        return { ok: true, requiresHumanConfirmation: true, action: "apply", changeSetId, expectedRevision, operationDigest };
      },
      undoCommitted: (committedChangeId: string, expectedRevision: number) => {
        const latest = history.find((item) => item.kind === "apply" && item.id.startsWith("commit-") && item.revision === projectRevisionRef.current);
        if (!latest || latest.id !== committedChangeId || expectedRevision !== projectRevisionRef.current) {
          return { ok: false, error: "Undo requires the exact latest committed change and current revision" };
        }
        setPanel("history");
        setReviewSheetOpen(true);
        setAgentNotice("Undo is ready for your confirmation in Meant.");
        return { ok: true, requiresHumanConfirmation: true, action: "undo", committedChangeId, expectedRevision };
      },
    };
  }, [history, requestClarification, reviseChangeSet, stageChangeSet]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") {
      queueMicrotask(() => setWebMcpStatus("unavailable"));
      return;
    }
    const e2eTools = e2eToolsRef.current;
    const injectedContext = e2eMode && !document.modelContext
      ? {
          registerTool: (tool: ReturnType<typeof createWebMcpTools>[number]) => {
            e2eTools.set(tool.name, tool);
          },
        }
      : null;
    if (injectedContext) document.modelContext = injectedContext;
    const context = document.modelContext;
    if (!context?.registerTool) {
      queueMicrotask(() => setWebMcpStatus("unavailable"));
      return;
    }
    const registration = new AbortController();
    const tools = createWebMcpTools(() => commandsRef.current);

    Promise.all(tools.map((tool) => context.registerTool(tool, { signal: registration.signal })))
      .then(() => setWebMcpStatus("ready"))
      .catch(() => setWebMcpStatus("unavailable"));

    return () => {
      registration.abort();
      if (injectedContext && document.modelContext === injectedContext) document.modelContext = undefined;
      if (injectedContext) e2eTools.clear();
    };
  }, [e2eMode]);

  const commitDirectOperation = async (operation: OperationInput, label: string, surface: "direct" | "canvas" = "direct") => {
    const artifact = projectRef.current.artifacts.find((item) => item.id === operation.artifactId);
    if (!artifact) return;
    const packet: ExpressionPacket = {
      id: uid("expression"), createdAt: now(), status: "captured", scope,
      voiceEnvelope: { id: uid("direct"), rawTranscript: label, corrections: [], captureMethod: "typed-fallback", audioRetained: false, createdAt: now() },
      anchor: { artifactId: artifact.id, artifactVersion: artifact.version, targetIds: operation.targetIds, targetNames: operation.targetIds.map((targetId) => artifact.nodes.find((node) => node.id === targetId)?.name ?? artifact.name) },
      interpretation: interpretExpression(label),
    };
    const current = projectRef.current;
    const withPacket = { ...current, expressionPackets: [packet, ...current.expressionPackets] };
    projectRef.current = withPacket;
    setProject(withPacket);
    setPersistenceStatus("saving");
    const staged = await stageChangeSet({ expressionPacketId: packet.id, summary: label, rationale: "Direct Tune control grounded through the canonical registry.", operations: [operation], reveal: false, surface });
    if (!staged.ok) { setAgentNotice(staged.error ?? "That control could not be staged."); return; }
    const applied = await applyDirect();
    if (!applied.ok) setAgentNotice(applied.error ?? "That control could not be committed.");
  };

  const updateInstrument = (control: InstrumentId, value: number, surface: "direct" | "canvas" = "direct") => {
    setShowBefore(false);
    const targets = isLayerScope ? selectedIds : [];
    void commitDirectOperation({ artifactId: activeArtifact.id, targetIds: targets, control, value }, `Set ${humanizeControl(control)} to ${value}`, surface);
  };

  const updatePrimitive = (primitive: keyof NodePrimitives, value: string) => {
    if (!isLayerScope || !selectedNodes[0] || !["content", "fill", "alignment", "direction"].includes(primitive)) return;
    setShowBefore(false);
    void commitDirectOperation({ artifactId: activeArtifact.id, targetIds: [selectedNodes[0].id], property: primitive as CanonicalProperty, value }, `Set ${primitive} exactly`);
  };

  const invokeE2EWebMcpStage = async () => {
    if (!e2eMode) return;
    try {
      const input = JSON.parse(e2eWebMcpInput) as {
        text: string;
        artifactId: string;
        targetIds: string[];
        property: CanonicalProperty;
        value: string | number;
      };
      const artifact = projectRef.current.artifacts.find((item) => item.id === input.artifactId);
      if (!artifact) throw new Error("E2E artifact not found");
      const packet: ExpressionPacket = {
        id: uid("expression"),
        createdAt: now(),
        status: "captured",
        scope: input.targetIds.length ? "element" : "artifact",
        voiceEnvelope: { id: uid("webmcp"), rawTranscript: input.text, corrections: [], captureMethod: "typed-fallback", audioRetained: false, createdAt: now() },
        anchor: {
          artifactId: artifact.id,
          artifactVersion: artifact.version,
          targetIds: input.targetIds,
          targetNames: input.targetIds.map((targetId) => artifact.nodes.find((node) => node.id === targetId)?.name ?? artifact.name),
        },
        interpretation: interpretExpression(input.text),
      };
      const withPacket = { ...projectRef.current, expressionPackets: [packet, ...projectRef.current.expressionPackets] };
      projectRef.current = withPacket;
      setProject(withPacket);
      const tool = e2eToolsRef.current.get("stage_change_set");
      if (!tool) throw new Error("Registered WebMCP stage tool unavailable");
      const result = await tool.execute({
        expressionPacketId: packet.id,
        summary: input.text,
        rationale: "Disposable browser+D1 integration request.",
        operations: [{ artifactId: input.artifactId, targetIds: input.targetIds, property: input.property, value: input.value }],
      });
      setE2eLastResult({ ok: true, action: "webmcp-stage", result });
    } catch (error) {
      setE2eLastResult({ ok: false, action: "webmcp-stage", error: error instanceof Error ? error.message : String(error) });
    }
  };

  const applyE2EWebMcp = async () => {
    const active = projectRef.current.activeChangeSet;
    const tool = e2eToolsRef.current.get("apply_staged_change_set");
    if (!active || !tool) {
      setE2eLastResult({ ok: false, action: "webmcp-apply", error: "Registered WebMCP apply tool unavailable" });
      return;
    }
    const result = await tool.execute({ changeSetId: active.id, expectedRevision: active.authority.baseRevision, operationDigest: active.authority.operationDigest });
    setE2eLastResult({ action: "webmcp-apply", result });
  };

  const undoE2EWebMcp = async () => {
    const tool = e2eToolsRef.current.get("undo_committed_change");
    if (!tool || !e2eUndoChangeId) {
      setE2eLastResult({ ok: false, action: "webmcp-undo", error: "Explicit committed change ID required" });
      return;
    }
    const result = await tool.execute({ committedChangeId: e2eUndoChangeId, expectedRevision: projectRevisionRef.current });
    setE2eLastResult({ action: "webmcp-undo", result });
  };

  const e2eState = e2eMode ? {
    identity: {
      projectId: project.id,
      workspaceId: e2eWorkspaceId,
      revision: projectRevision,
      fingerprint: e2eFingerprint,
    },
    history,
    captures: e2eCaptures,
    activeChangeSet: project.activeChangeSet,
    lastResult: e2eLastResult,
    postApprovalNetworkCalls: e2ePostApprovalCalls,
    artifacts: project.artifacts.map((artifact) => ({
      id: artifact.id,
      version: artifact.version,
      values: artifact.values,
      nodes: artifact.nodes.map((node) => ({ id: node.id, values: node.values, primitives: node.primitives })),
    })),
  } : null;

  const activeInstruments = (() => {
    const allowed = isLayerScope && selectedNodes.length
      ? new Set(selectedNodes.flatMap((node) => node.capabilities))
      : null;
    const controls = manifest.instruments
      .filter((instrument) => !allowed || allowed.has(instrument.id))
      .map((instrument) => instrumentCopy(isLayerScope ? selectedNodes[0] : undefined, instrument));
    if (!activePacket) return controls;
    const priority = suggestedControlForLanguage(
      activePacket.voiceEnvelope.correctedTranscript ?? activePacket.voiceEnvelope.rawTranscript,
    );
    const rank = (control: InstrumentId) => {
      const index = priority.indexOf(control);
      return index === -1 ? Number.MAX_SAFE_INTEGER : index;
    };
    return [...controls].sort((a, b) => rank(a.id) - rank(b.id));
  })();
  const activeDirectPrimitives = isLayerScope ? directPrimitivesForNode(selectedNodes[0]) : [];
  const selectedPrimitiveValues = selectedNodes[0]?.primitives ?? {};

  const generateProposal = () => {
    if (!activePacket) return;
    void compileExpression(activePacket, evidencePayloadsRef.current.get(activePacket.id) ?? []);
  };

  const switchArtifact = (artifact: CreativeArtifact) => {
    setActiveArtifactId(artifact.id);
    const preferredTarget = artifact.kind === "web" ? "web-supporting-copy" : artifact.kind === "graphic" ? "graphic-headline" : "photo-subject";
    setSelectedIds(artifact.nodes.some((node) => node.id === preferredTarget) ? [preferredTarget] : artifact.nodes[0] ? [artifact.nodes[0].id] : []);
    setCollapsedNodeIds([]);
    setScope("artifact");
    setPanel("segments");
    setArtifactGalleryOpen(false);
    setPanelGuide(null);
    resetCanvasView();
  };

  const toggleArtifactGallery = () => {
    const willOpen = !artifactGalleryOpen;
    setArtifactGalleryOpen(willOpen);
    if (willOpen) {
      setReviewSheetOpen(false);
      if (!seenPanelGuidesRef.current.has("artifacts")) {
        seenPanelGuidesRef.current.add("artifacts");
        setPanelGuide("artifacts");
      }
    } else {
      setPanelGuide(null);
    }
  };

  const toggleLayersPanel = () => {
    const willOpen = !(reviewSheetOpen && panel === "segments");
    setPanel("segments");
    setReviewSheetOpen(willOpen);
    if (willOpen) {
      setArtifactGalleryOpen(false);
      if (!seenPanelGuidesRef.current.has("layers")) {
        seenPanelGuidesRef.current.add("layers");
        setPanelGuide("layers");
      }
    } else {
      setPanelGuide(null);
    }
  };

  return (
    <main className={`studio-shell theme-${theme}`}>
      <header className="studio-topbar">
        <div className="topbar-left">
          <div className="brand-lockup">
            <strong className="meant-wordmark">meant<span>.</span></strong>
          </div>
        </div>

        <div className="project-context" aria-label={`${project.name}, ${activeArtifact.name}`}>
          <span>{project.name}</span>
          <i aria-hidden="true">/</i>
          <strong>{activeArtifact.name}</strong>
        </div>
        <div className="topbar-utilities">
          <Button
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
            className="header-utility-button"
            onClick={() => chooseTheme(theme === "dark" ? "light" : "dark")}
            size="icon-sm"
            title={`Use ${theme === "dark" ? "light" : "dark"} mode`}
            variant="ghost"
          >
            {theme === "dark" ? <Sun /> : <Moon />}
          </Button>
          <Button
            aria-label="Open settings"
            className="header-utility-button"
            onClick={() => setSettingsOpen(true)}
            size="icon-sm"
            title="Settings"
            variant="ghost"
          >
            <Settings2 />
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button aria-label="Open profile" className="profile-trigger" size="icon-sm" variant="ghost">
                <span>JL</span>
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className={`profile-menu ${theme === "dark" ? "theme-dark-menu" : ""}`} sideOffset={9}>
              <div className="profile-menu-identity">
                <span className="profile-avatar">JL</span>
                <span><strong>Joshua Lora</strong><small>Meant workspace owner</small></span>
              </div>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setProfileOpen(true)}><UserRound /> Profile</DropdownMenuItem>
              <DropdownMenuItem onSelect={() => setSettingsOpen(true)}><Settings2 /> Settings</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      <Dialog onOpenChange={setSettingsOpen} open={settingsOpen}>
        <DialogContent className={`meant-preferences-dialog ${theme === "dark" ? "theme-dark-dialog" : ""}`}>
          <DialogHeader>
            <DialogTitle>Settings</DialogTitle>
            <DialogDescription>Keep the Studio comfortable without changing the work inside it.</DialogDescription>
          </DialogHeader>
          <section className="appearance-setting" aria-label="Appearance">
            <div><strong>Appearance</strong><span>Bobalicious keeps its own brand colors in either mode.</span></div>
            <div className="theme-choices" role="group" aria-label="Choose appearance">
              <button aria-pressed={theme === "light"} className={theme === "light" ? "is-active" : ""} onClick={() => chooseTheme("light")} type="button"><Sun /> Light</button>
              <button aria-pressed={theme === "dark"} className={theme === "dark" ? "is-active" : ""} onClick={() => chooseTheme("dark")} type="button"><Moon /> Dark</button>
            </div>
          </section>
          <section className="demo-reset-setting" aria-label="Demo setup">
            <div>
              <strong>Demo setup</strong>
              <span>Return all three Bobalicious artifacts to their original state.</span>
            </div>
            <Button onClick={() => setResetConfirmOpen(true)} variant="outline">Reset demo</Button>
          </section>
        </DialogContent>
      </Dialog>

      <AlertDialog onOpenChange={setResetConfirmOpen} open={resetConfirmOpen}>
        <AlertDialogContent className={theme === "dark" ? "theme-dark-dialog" : ""}>
          <AlertDialogHeader>
            <AlertDialogTitle>Reset the Bobalicious demo?</AlertDialogTitle>
            <AlertDialogDescription>
              This restores the original web, graphic, and photo artifacts and clears the current undo history.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep current work</AlertDialogCancel>
            <AlertDialogAction onClick={resetDemo}>Reset demo</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog onOpenChange={setProfileOpen} open={profileOpen}>
        <DialogContent className={`meant-profile-dialog ${theme === "dark" ? "theme-dark-dialog" : ""}`}>
          <DialogHeader>
            <DialogTitle>Profile</DialogTitle>
            <DialogDescription>Your identity and current creative workspace.</DialogDescription>
          </DialogHeader>
          <div className="profile-card">
            <span className="profile-card-avatar">JL</span>
            <div><strong>Joshua Lora</strong><span>Owner</span></div>
          </div>
          <div className="profile-details">
            <span><small>Workspace</small><strong>Meant</strong></span>
            <span><small>Current project</small><strong>{project.name}</strong></span>
          </div>
        </DialogContent>
      </Dialog>

      <section className="studio-body">
        <aside className={`artifact-rail ${artifactGalleryOpen ? "is-open" : ""}`} aria-label="Bobalicious artifacts" aria-hidden={!artifactGalleryOpen} inert={!artifactGalleryOpen}>
          <div className="artifact-rail-header">
            <div>
              <span>Bobalicious</span>
              <h2>Choose an artifact</h2>
            </div>
            <Button aria-label="Close artifacts" onClick={() => { setArtifactGalleryOpen(false); setPanelGuide(null); }} size="icon-sm" variant="ghost"><X /></Button>
          </div>
          <div className="artifact-list">
            {project.artifacts.map((artifact) => {
              const Icon = artifactIcon(artifact.kind);
              const active = artifact.id === activeArtifact.id;
              return (
                <button aria-label={`Open ${artifact.name}`} className={`artifact-button ${active ? "is-active" : ""}`} key={artifact.id} onClick={() => switchArtifact(artifact)} type="button">
                  <span className={`artifact-preview preview-${artifact.kind}`}>
                    {artifact.kind === "web" ? (
                      <><b>BOBALICIOUS</b><em>Joy, with<br />extra pearls.</em><i /></>
                    ) : artifact.kind === "graphic" ? (
                      <><b>MANGO<br />MATCHA<br />MADNESS</b><i /></>
                    ) : (
                      <span style={{ backgroundImage: `url(${PHOTO_URL})` }} />
                    )}
                  </span>
                  <span className="artifact-copy">
                    <strong>{artifact.name}</strong>
                    <small>{artifact.format}</small>
                  </span>
                  <Icon />
                </button>
              );
            })}
          </div>
        </aside>

        <section className="canvas-column">
          <div
            className={`magic-canvas mode-${activeArtifact.kind} ${canvasPulse ? "is-applying" : ""} ${isPanning ? "is-panning" : ""}`}
            onPointerCancel={endCanvasPan}
            onPointerDown={beginCanvasPan}
            onPointerMove={moveCanvasPan}
            onPointerUp={endCanvasPan}
            onWheel={handleCanvasWheel}
            ref={canvasRef}
            style={{
              "--canvas-grid-size": `${34 * canvasView.scale}px`,
              "--canvas-pan-x": `${canvasView.x}px`,
              "--canvas-pan-y": `${canvasView.y}px`,
            } as React.CSSProperties}
          >
            <div className="artifact-stage">
              <div
                className="canvas-artifact"
                style={{ transform: `translate3d(${canvasView.x}px, ${canvasView.y}px, 0) scale(${canvasView.scale})` }}
              >
                {renderedArtifact.kind === "web" ? (
                  <WebComposition
                    artifact={renderedArtifact}
                    selectedIds={canvasSelectedIds}
                    onSelect={selectTarget}
                    onQuickAdjust={(control, delta) => updateInstrument(control, Math.min(100, selectedValues[control] + delta), "canvas")}
                  />
                ) : renderedArtifact.kind === "graphic" ? (
                  <GraphicComposition artifact={renderedArtifact} selectedIds={canvasSelectedIds} onSelect={selectTarget} />
                ) : (
                  <PhotoComposition artifact={renderedArtifact} selectedIds={canvasSelectedIds} onSelect={selectTarget} />
                )}
              </div>
            </div>
            <div className="canvas-controls" role="group" aria-label="Canvas view controls">
              <span className="pan-indicator" title="Drag empty canvas to pan"><Hand /></span>
              <Button aria-label="Zoom out" onClick={() => setCanvasScale(canvasView.scale - 0.15)} size="icon-sm" variant="ghost"><Minus /></Button>
              <span aria-live="polite">{Math.round(canvasView.scale * 100)}%</span>
              <Button aria-label="Zoom in" onClick={() => setCanvasScale(canvasView.scale + 0.15)} size="icon-sm" variant="ghost"><Plus /></Button>
              <Button aria-label="Fit artifact to canvas" onClick={resetCanvasView} size="icon-sm" title="Fit artifact" variant="ghost"><LocateFixed /></Button>
            </div>
            {panelGuide && ((panelGuide === "artifacts" && artifactGalleryOpen) || (panelGuide === "layers" && reviewSheetOpen)) ? (
              <div className={`canvas-panel-guide guide-${panelGuide}`} role="status">
                <Hand />
                <span>Canvas continues behind this panel. Drag empty space to move the work.</span>
                <button aria-label="Dismiss canvas guide" onClick={() => setPanelGuide(null)} type="button"><X /></button>
              </div>
            ) : null}
            {project.activeChangeSet ? (
              <div className="proposal-ribbon">
                <WandSparkles />
                <span>{showBefore ? "Original artifact" : "Revision preview"}</span>
                <small>{project.activeChangeSet.operations.filter((operation) => operation.artifactId === activeArtifact.id).length} planned changes</small>
              </div>
            ) : null}
            {appliedNotice ? (
              <div className="applied-ribbon" role="status"><Check /><span>Applied to the canvas</span><small>{appliedNotice}</small></div>
            ) : null}
          </div>

          <div className={`voice-rail command-dock ${isListening ? "is-listening" : ""}`}>
            <Button
              aria-expanded={artifactGalleryOpen}
              aria-label="Open artifacts"
              className={`toolbar-panel-button artifact-trigger ${artifactGalleryOpen ? "is-active" : ""}`}
              onClick={toggleArtifactGallery}
              size="sm"
              variant="ghost"
            >
              <FileImage /> <span>Artifacts</span>
            </Button>
            <span className="toolbar-divider" aria-hidden="true" />
            <button aria-label={isListening ? "Stop listening" : "Start voice capture"} className="voice-button" disabled={transcriptionState === "connecting" || transcriptionState === "finalizing"} onClick={toggleListening} type="button">
              {isListening ? <MicOff /> : <Mic />}
            </button>
            <div className="voice-input">
              <textarea
                aria-label="Expression"
                onChange={(inputEvent) => { setDraft(inputEvent.target.value); setCaptureMethod("typed-fallback"); setTranscriptionNotice(""); }}
                onKeyDown={(keyEvent) => {
                  if (keyEvent.key === "Enter" && !keyEvent.shiftKey) {
                    keyEvent.preventDefault();
                    if (!isListening && transcriptionState !== "finalizing" && agentStatus !== "interpreting") captureExpression();
                  }
                }}
                placeholder="Describe a change…"
                ref={expressionInputRef}
                rows={1}
                value={`${draft}${interim ? ` ${interim}` : ""}`}
              />
              {transcriptionNotice ? <div className={`voice-notice state-${transcriptionState}`}>{transcriptionNotice}</div> : null}
              <div className="voice-wave" aria-hidden="true">{Array.from({ length: 24 }, (_, index) => <span key={index} />)}</div>
            </div>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  aria-label={`Apply changes to ${scopeCopy.category.toLowerCase()}: ${scopeCopy.target}`}
                  className="editing-menu-trigger toolbar-scope"
                  size="sm"
                  variant="ghost"
                >
                  <MousePointer2 />
                  <span className="scope-trigger-copy">
                    <small>{scopeCopy.category}</small>
                    <strong>{scopeCopy.target}</strong>
                  </span>
                  <ChevronDown />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className={`editing-menu ${theme === "dark" ? "theme-dark-menu" : ""}`} sideOffset={12}>
                <DropdownMenuLabel>Apply to</DropdownMenuLabel>
                <DropdownMenuRadioGroup onValueChange={(value) => setScope(value as IntentScope)} value={scope}>
                  <DropdownMenuRadioItem className="scope-option" value="artifact">
                    <span className="scope-option-copy">
                      <strong>Whole design</strong>
                    </span>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem className="scope-option" value="element">
                    <span className="scope-option-copy">
                      <strong>Selected layer · {selectedNodes[0]?.name ?? "Choose a layer"}</strong>
                    </span>
                  </DropdownMenuRadioItem>
                  <DropdownMenuRadioItem className="scope-option" value="project">
                    <span className="scope-option-copy">
                      <strong>All artifacts</strong>
                    </span>
                  </DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="voice-actions">
              <Button className="evidence-toggle" onClick={() => setEvidenceOpen((current) => !current)} variant="ghost">
                <FileImage /> Reference{pendingEvidence.length ? ` · ${pendingEvidence.length}` : ""}
              </Button>
              <Button aria-label="Apply described change" className="toolbar-review" disabled={!`${draft}${interim}`.trim() || isListening || transcriptionState === "finalizing" || agentStatus === "interpreting"} onClick={() => captureExpression()}>
                <Check /> {agentStatus === "interpreting" ? "Applying…" : "Apply"}
              </Button>
            </div>
            <span className="toolbar-divider" aria-hidden="true" />
            <Button
              aria-expanded={reviewSheetOpen}
              aria-label="Open layers"
              className={`toolbar-panel-button layers-trigger ${reviewSheetOpen ? "is-active" : ""}`}
              onClick={toggleLayersPanel}
              size="sm"
              variant="ghost"
            >
              <ListTree /> <span>Layers</span>
            </Button>
            {evidenceOpen ? (
              <div className="evidence-tray">
                <div className="evidence-heading">
                  <div><strong>Add a reference</strong><span>Optional guidance for this change only.</span></div>
                </div>
                <div className="evidence-composer">
                  <label>
                    <span>Reference type</span>
                    <select aria-label="Reference type" onChange={(event) => setEvidenceKind(event.target.value as EvidenceKind)} value={evidenceKind}>
                      {Object.entries(evidenceLabels).map(([kind, label]) => <option key={kind} value={kind}>{label}</option>)}
                    </select>
                  </label>
                  <label className="evidence-governs">
                    <span>How should Meant use it?</span>
                    <input
                      aria-label="Instructions"
                      onChange={(event) => setEvidenceGovernance(event.target.value)}
                      placeholder="Geometry only; preserve palette and copy"
                      value={evidenceGovernance}
                    />
                  </label>
                  <input
                    accept="image/*"
                    aria-label="Choose evidence image"
                    hidden
                    onChange={(event) => addEvidenceFile(event.target.files?.[0])}
                    ref={evidenceInputRef}
                    type="file"
                  />
                  <Button
                    onClick={() => evidenceKind === "written_note" ? addWrittenEvidence() : evidenceInputRef.current?.click()}
                    variant="outline"
                  >
                    {evidenceKind === "written_note" ? <Braces /> : <FileImage />}
                    {evidenceKind === "written_note" ? "Add note" : "Attach image"}
                  </Button>
                </div>
                {pendingEvidence.length ? (
                  <div className="evidence-items">
                    {pendingEvidence.map((item) => (
                      <div key={item.id}>
                        <span><strong>{evidenceLabels[item.kind]}</strong><small>{item.governs}</small></span>
                        <button aria-label={`Remove ${item.label}`} onClick={() => setPendingEvidence((current) => current.filter((candidate) => candidate.id !== item.id))} type="button"><X /></button>
                      </div>
                    ))}
                  </div>
                ) : null}
                {evidenceNotice ? <p className="evidence-notice">{evidenceNotice}</p> : null}
              </div>
            ) : null}
          </div>
        </section>

        <aside className={`instrument-dock ${reviewSheetOpen ? "is-open" : ""}`} aria-label="Meant design panel" aria-hidden={!reviewSheetOpen} inert={!reviewSheetOpen} ref={layerPanelRef}>
          <div className="dock-shell-header">
            <div className="intelligence-mark" aria-hidden="true">↳</div>
            <div>
              <span>{panel === "intent" ? activePacket?.clarification ? "Input needed" : project.activeChangeSet ? "Change ready" : "Last change" : panel === "segments" ? "Layers" : panel === "instruments" ? "Controls" : "History"}</span>
              <h2>{panel === "intent" ? activePacket?.clarification ? "One quick choice" : project.activeChangeSet ? "Review and apply" : activeChangeUndone ? "Change undone" : "What Meant changed" : panel === "segments" ? "Choose what to edit" : panel === "instruments" ? "Fine-tune" : "Your changes"}</h2>
            </div>
            <Button aria-label="Close right panel" onClick={() => { setReviewSheetOpen(false); setPanelGuide(null); }} size="icon-sm" variant="ghost"><X /></Button>
          </div>
          <Tabs onValueChange={setPanel} value={panel}>
            <TabsList className="dock-tabs" variant="line">
              <TabsTrigger value="intent"><Sparkles /> Last change</TabsTrigger>
              <TabsTrigger value="segments"><ListTree /> Layers</TabsTrigger>
              <TabsTrigger value="instruments"><SlidersHorizontal /> Tune</TabsTrigger>
              <TabsTrigger value="history"><History /> History</TabsTrigger>
            </TabsList>

            <TabsContent className="dock-content review-content" value="intent">
              {!activePacket ? (
                <div className="dock-empty">
                  <div className="empty-symbol"><Mic /></div>
                  <h2>Begin with expression.</h2>
                  <p>Select something on the canvas and describe the outcome in your own language. This sheet returns only when Meant has something useful to show you.</p>
                </div>
              ) : (
                <div className="intent-stack">
                  <div className="review-flow" aria-label="Change review">
                    <section className="review-flow-step">
                      <span className="review-step-number">1</span>
                      <div>
                        <span className="review-step-label">You asked</span>
                        <p className="understood-copy">{activePacket.interpretation.desiredOutcome}</p>
                      </div>
                    </section>
                    <section className="review-flow-step">
                      <span className="review-step-number">2</span>
                      <div>
                        <span className="review-step-label">Editing</span>
                        <strong className="review-target">{activePacket.anchor.targetNames.join(", ")}</strong>
                      </div>
                    </section>
                  </div>
                  {agentStatus !== "idle" && agentNotice ? <div className={`agent-status status-${agentStatus}`}><Sparkles /><span>{agentNotice}</span></div> : null}

                  {activePacket.clarification ? (
                    <section className="clarification-card">
                      <span>One decision needed</span>
                      <h3>{activePacket.clarification.question}</h3>
                      <div>{activePacket.clarification.options.map((option) => <button key={option} onClick={() => answerClarification(activePacket.id, option)} type="button">{option}</button>)}</div>
                    </section>
                  ) : null}

                  <section className="review-section change-review-section">
                    <div className="section-kicker"><span className="review-step-number">3</span> Meant changed</div>
                    <div className="proposed-moves">
                      {activeChangeUndone ? (
                        <div className="requested-change"><RotateCcw /><span>This change was undone. The prior canvas state is restored.</span></div>
                      ) : reviewOperations.slice(0, 6).map((operation, index) => {
                        const artifact = project.artifacts.find((item) => item.id === operation.artifactId);
                        const target = artifact?.nodes.find((node) => operation.targetIds.includes(node.id));
                        const baseline = "beforeValues" in operation
                          ? operation.beforeValues.find((value) => value.targetId === (target?.id ?? artifact?.id))?.value
                          : undefined;
                        const change = reviewOperation(operation, artifact, target, baseline);
                        return (
                          <div key={"id" in operation ? operation.id : `${operation.artifactId}-${"property" in operation ? operation.property : operation.control}-${index}`}>
                            <Check />
                            <span className="change-copy"><small>{target?.name ?? artifact?.name}</small><strong>{change.label}</strong></span>
                            <span className="change-result"><strong>{change.direction}</strong><small>{change.value}</small></span>
                          </div>
                        );
                      })}
                      {!activeChangeUndone && !reviewOperations.length ? activePacket.interpretation.requestedChanges.map((change) => <div className="requested-change" key={change}><Check /><span>{change}</span></div>) : null}
                    </div>
                  </section>

                  {activePlan?.semanticTrace?.constraints.some((constraint) =>
                    constraint.kind === "explicit_preserve" || constraint.kind === "brand"
                  ) ? (
                    <section className="review-section protected-review-section">
                      <div className="section-kicker"><ShieldCheck /> Meant kept</div>
                      <div className="protected-chips">
                        {activePlan.semanticTrace.constraints
                          .filter((constraint) => constraint.kind === "explicit_preserve" || constraint.kind === "brand")
                          .slice(0, 4)
                          .map((constraint) => <span key={`${constraint.kind}-${constraint.label}`}>{constraint.label}</span>)}
                      </div>
                    </section>
                  ) : null}

                  {project.activeChangeSet ? (
                    <div className="review-actions">
                      {showBefore ? (
                        <Button onClick={() => setShowBefore(false)}><Sparkles /> Show revision</Button>
                      ) : (
                        <Button data-testid="human-apply-change" onClick={() => applyDirect()}><span className="review-step-number">4</span> Apply change</Button>
                      )}
                      <Button onClick={generateProposal} variant="ghost"><RotateCcw /> Try another approach</Button>
                      <small>You can undo this after applying.</small>
                    </div>
                  ) : null}

                  <details className="review-details">
                    <summary>Why this works</summary>
                    <div className="review-details-body">
                      {activePlan?.semanticTrace?.paths.length ? (
                        <section className="meaning-map">
                          <div className="section-kicker"><Network /> How Meant connected it</div>
                          <p className="meaning-reading">{activePlan.semanticTrace.reading}</p>
                          <div className="meaning-paths">
                            {balancedMeaningPaths(activePlan.semanticTrace.paths).map((path) => (
                              <div className={`meaning-path role-${path.operator}`} key={`${path.id}-${path.operator}`}>
                                <div>
                                  <span className={`meaning-artifact kind-${path.artifactKind}`}>{artifactKindLabel[path.artifactKind]}</span>
                                  <span className="meaning-phrase">“{path.phrase}”</span>
                                  <i aria-hidden="true">→</i>
                                  <span>{path.sourceLabel}</span>
                                  <i aria-hidden="true">→</i>
                                  <strong>{path.targetLabel}</strong>
                                </div>
                                <small>{path.rationale}</small>
                              </div>
                            ))}
                          </div>
                          {activePlan.semanticTrace.constraints.some((constraint) =>
                            constraint.kind === "explicit_avoid" || constraint.kind === "taste"
                          ) ? (
                            <div className="meaning-exclusions">
                              <span>Kept out</span>
                              <div>{activePlan.semanticTrace.constraints
                                .filter((constraint) => constraint.kind === "explicit_avoid" || constraint.kind === "taste")
                                .slice(0, 4)
                                .map((constraint) => <strong key={`${constraint.kind}-${constraint.label}`}>{constraint.label}</strong>)}</div>
                            </div>
                          ) : null}
                        </section>
                      ) : null}
                      {activePlan ? (
                        <section className="design-plan-card">
                          <span>Design guidance</span>
                          <h3>{activePlan.strategy}</h3>
                          <p>{activePlan.diagnosis}</p>
                        </section>
                      ) : null}
                      {activePacket.evidencePack?.items.length ? (
                        <section className="review-section">
                          <div className="section-kicker"><FileImage /> References</div>
                          <div className="review-evidence-list">
                            {activePacket.evidencePack.items.map((item) => (
                              <div key={item.id} className={activePlan?.evidenceUsed.includes(item.id) ? "is-used" : ""}>
                                <span>{evidenceLabels[item.kind]}</span>
                                <strong>{item.governs}</strong>
                              </div>
                            ))}
                          </div>
                        </section>
                      ) : null}
                      {activePlan?.craftSkills.length ? (
                        <section className="review-section">
                          <div className="section-kicker"><SlidersHorizontal /> Design checks</div>
                          <div className="craft-skill-list">
                            {activePlan.craftSkills.map((skill) => <div key={skill.id}><strong>{skill.label}</strong><span>{skill.reason}</span></div>)}
                          </div>
                        </section>
                      ) : null}
                      {activePlan?.successCriteria.length ? (
                        <section className="review-section quality-bar">
                          <div className="section-kicker"><ShieldCheck /> What good looks like</div>
                          {activePlan.successCriteria.map((criterion) => <div key={criterion}><Check /><span>{criterion}</span></div>)}
                        </section>
                      ) : null}
                    </div>
                  </details>
                </div>
              )}
            </TabsContent>

            <TabsContent className="dock-content segment-dock" value="segments">
              <div className="segment-tree" role="tree" aria-label={`${activeArtifact.name} layers`}>
                {visibleNodes.map((node) => {
                  const hasChildren = activeArtifact.nodes.some((candidate) => candidate.parentId === node.id);
                  const isCollapsed = collapsedNodeIds.includes(node.id);
                  let depth = 0;
                  let parentId = node.parentId;
                  while (parentId) { depth += 1; parentId = activeArtifact.nodes.find((candidate) => candidate.id === parentId)?.parentId; }
                  const selected = isLayerScope && selectedIds.includes(node.id);
                  return (
                    <div className={`segment-row ${selected ? "is-selected" : ""}`} data-layer-id={node.id} key={node.id} role="treeitem" aria-selected={selected} style={{ "--segment-depth": depth } as React.CSSProperties}>
                      <button aria-label={hasChildren ? `${isCollapsed ? "Expand" : "Collapse"} ${node.name}` : undefined} className="segment-caret" disabled={!hasChildren} onClick={() => setCollapsedNodeIds((current) => current.includes(node.id) ? current.filter((id) => id !== node.id) : [...current, node.id])} type="button">
                        {hasChildren ? isCollapsed ? <ChevronRight /> : <ChevronDown /> : <span />}
                      </button>
                      <button className="segment-main" onClick={() => selectTarget(node.id, false)} type="button">
                        <span className="segment-thumbnail">{semanticIcon(node.kind)}</span>
                        <span className="segment-copy"><strong>{node.name}</strong><small>{semanticKindLabels[node.kind]}</small></span>
                      </button>
                    </div>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent className="dock-content" value="instruments">
              {isLayerScope && selectedNodes[0] ? (
                <div className="primitive-selection">
                  <span>{semanticKindLabels[selectedNodes[0].kind]}</span>
                  <strong>{selectedNodes[0].name}</strong>
                  <p>{selectedNodes[0].purpose}</p>
                  <small>{activeDirectPrimitives.length + activeInstruments.length} controls available for this layer</small>
                </div>
              ) : (
                <div className="primitive-selection design-guidance">
                  <span>{scope === "project" ? "Campaign guidance" : "Design guidance"}</span>
                  <strong>{scopeCopy.target}</strong>
                  <p>{scope === "project"
                    ? "Shape a shared visual decision across the full Bobalicious campaign."
                    : "Tune the composition as a whole. Meant coordinates hierarchy, rhythm, color, and atmosphere together."}</p>
                  <small>{activeInstruments.length} coordinated controls available</small>
                </div>
              )}
              {activeDirectPrimitives.length ? (
                <section className="direct-primitives" aria-label="Basic layer controls">
                  <h3>Basics</h3>
                  {activeDirectPrimitives.includes("content") ? (
                    <label className="direct-field">
                      <span>Text</span>
                      <textarea
                        aria-label={`Text for ${selectedNodes[0]?.name ?? "selected layer"}`}
                        defaultValue={selectedPrimitiveValues.content ?? contentFor(activeArtifact, selectedNodes[0]!.id)}
                        key={`${selectedNodes[0]!.id}-content-${projectRevision}`}
                        onBlur={(blurEvent) => {
                          const currentValue = selectedPrimitiveValues.content ?? contentFor(activeArtifact, selectedNodes[0]!.id);
                          if (blurEvent.currentTarget.value !== currentValue) updatePrimitive("content", blurEvent.currentTarget.value);
                        }}
                        rows={selectedNodes[0]?.role === "headline" ? 3 : 2}
                      />
                    </label>
                  ) : null}
                  {activeDirectPrimitives.includes("fill") ? (
                    <div className="direct-field">
                      <span>Color</span>
                      <div className="color-controls">
                        {brandSwatches.map((color) => (
                          <button
                            aria-label={`Use ${color}`}
                            className={(selectedPrimitiveValues.fill ?? "").toLowerCase() === color.toLowerCase() ? "is-active" : ""}
                            key={color}
                            onClick={() => updatePrimitive("fill", color)}
                            style={{ background: color }}
                            type="button"
                          />
                        ))}
                        <label className="custom-color" title="Choose any color">
                          <input
                            aria-label="Choose any color"
                            onChange={(changeEvent) => updatePrimitive("fill", changeEvent.target.value)}
                            type="color"
                            value={selectedPrimitiveValues.fill ?? "#3a241c"}
                          />
                          <span>+</span>
                        </label>
                      </div>
                    </div>
                  ) : null}
                  {activeDirectPrimitives.includes("direction") ? (
                    <div className="direct-field">
                      <span>Direction</span>
                      <div className="choice-row">
                        {(["row", "column"] as const).map((direction) => (
                          <button aria-label={`Set direction ${direction}`} className={(selectedPrimitiveValues.direction ?? "row") === direction ? "is-active" : ""} key={direction} onClick={() => updatePrimitive("direction", direction)} type="button">
                            {direction === "row" ? "Across" : "Stacked"}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                  {activeDirectPrimitives.includes("alignment") ? (
                    <div className="direct-field">
                      <span>Alignment</span>
                      <div className="choice-row three">
                        {(["start", "center", "end"] as const).map((alignment) => (
                          <button aria-label={`Set alignment ${alignment}`} className={(selectedPrimitiveValues.alignment ?? "start") === alignment ? "is-active" : ""} key={alignment} onClick={() => updatePrimitive("alignment", alignment)} type="button">
                            {alignment === "start" ? "Start" : alignment === "center" ? "Center" : "End"}
                          </button>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>
              ) : null}
              <div className="primitive-groups">
                {primitiveGroups.map((group) => {
                  const instruments = activeInstruments.filter((instrument) => primitiveGroupForInstrument(instrument.id) === group);
                  if (!instruments.length) return null;
                  return (
                    <section className="primitive-group" key={group}>
                      <h3>{group}</h3>
                      <div className="instrument-list">
                        {instruments.map((instrument) => {
                          const [low, high] = instrumentEndpoints(instrument.id);
                          if (instrument.id === "focalStrength") {
                            const choices = emphasisChoices(isLayerScope ? selectedNodes[0] : undefined);
                            const activeChoice = nearestEmphasis(selectedValues.focalStrength, choices);
                            return (
                              <div className="instrument-row emphasis-row" key={instrument.id}>
                                <div><label>{instrument.label}</label><span>{activeChoice.label}</span></div>
                                <div className="choice-row three emphasis-choices" role="group" aria-label={instrument.label}>
                                  {choices.map((choice) => (
                                    <button
                                      aria-pressed={activeChoice.value === choice.value}
                                      className={activeChoice.value === choice.value ? "is-active" : ""}
                                      key={choice.value}
                                      onClick={() => {
                                        updateInstrument(instrument.id, choice.value);
                                      }}
                                      type="button"
                                    >
                                      {choice.label}
                                    </button>
                                  ))}
                                </div>
                              </div>
                            );
                          }
                          return (
                            <div className="instrument-row" key={instrument.id}>
                              <div><label id={`instrument-${instrument.id}-label`} htmlFor={`instrument-${instrument.id}`}>{instrument.label}</label><span>{formatControlValue(instrument.id, selectedValues[instrument.id])}</span></div>
                              <Slider aria-labelledby={`instrument-${instrument.id}-label`} aria-valuetext={formatControlValue(instrument.id, selectedValues[instrument.id])} defaultValue={[selectedValues[instrument.id]]} id={`instrument-${instrument.id}`} key={`${instrument.id}-${projectRevision}`} max={instrument.max} min={instrument.min} onValueCommit={(next) => updateInstrument(instrument.id, next[0] ?? selectedValues[instrument.id])} />
                              <div className="instrument-endpoints"><small>{low}</small><small>{high}</small></div>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  );
                })}
              </div>
            </TabsContent>

            <TabsContent className="dock-content" value="history">
              {history[0]?.kind === "apply" && history[0].id.startsWith("commit-") && history[0].revision === projectRevision ? (
                <Button className="history-undo" data-testid="human-undo-change" onClick={() => void undoCommittedChange(history[0]!.id, projectRevision)} variant="outline"><RotateCcw /> Undo this committed change</Button>
              ) : null}
              <div className="history-list">
                {project.provenance.filter((item) => ["change_applied", "change_undone", "instrument_adjusted"].includes(item.type)).length ? project.provenance.filter((item) => ["change_applied", "change_undone", "instrument_adjusted"].includes(item.type)).map((item) => <div className="history-item" key={item.id}><span className="history-dot" /><div><strong>{item.type === "change_applied" ? "Change applied" : item.type === "change_undone" ? "Change undone" : item.label}</strong><p>{item.detail}</p><small>{timeLabel(item.createdAt)}</small></div></div>) : <div className="dock-empty compact"><History /><p>Your applied changes will appear here.</p></div>}
              </div>
            </TabsContent>
          </Tabs>
        </aside>
      </section>
      {e2eMode ? (
        <aside className="e2e-test-panel" data-testid="e2e-panel">
          <label>
            Voice-normalized request
            <input
              data-testid="e2e-voice-input"
              onChange={(event) => setE2eVoiceText(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") captureExpression({ text: e2eVoiceText, captureMethod: "gpt-transcribe" });
              }}
              value={e2eVoiceText}
            />
          </label>
          <Button data-testid="e2e-voice-submit" onClick={() => captureExpression({ text: e2eVoiceText, captureMethod: "gpt-transcribe" })}>Route normalized voice</Button>
          <label>
            Registered WebMCP request
            <textarea
              data-testid="e2e-webmcp-input"
              onChange={(event) => setE2eWebMcpInput(event.target.value)}
              onKeyDown={(event) => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                if (event.ctrlKey || event.metaKey) void applyE2EWebMcp();
                else void invokeE2EWebMcpStage();
              }}
              value={e2eWebMcpInput}
            />
          </label>
          <Button data-testid="e2e-webmcp-stage" onClick={() => void invokeE2EWebMcpStage()}>Stage through registered WebMCP</Button>
          <Button data-testid="e2e-webmcp-apply" onClick={() => void applyE2EWebMcp()}>Apply through registered WebMCP</Button>
          <label>
            Explicit committed change ID
            <input
              data-testid="e2e-undo-id"
              onChange={(event) => setE2eUndoChangeId(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") void undoE2EWebMcp();
              }}
              value={e2eUndoChangeId}
            />
          </label>
          <Button data-testid="e2e-webmcp-undo" onClick={() => void undoE2EWebMcp()}>Undo explicit change through registered WebMCP</Button>
          <label>
            Disposable failure
            <select data-testid="e2e-fault" onChange={(event) => setE2eFault(event.target.value as E2EFault)} value={e2eFault}>
              <option value="none">None</option>
              <option value="persistence">Persistence</option>
              <option value="postcondition">Postcondition</option>
            </select>
          </label>
          <Button data-testid="e2e-refetch" onClick={() => void refetchAuthoritativeProject()}>Refetch authoritative project</Button>
          <Button data-testid="e2e-undo" disabled={!history[0] || history[0].kind !== "apply" || !history[0].id.startsWith("commit-")} onClick={() => history[0]?.id.startsWith("commit-") && void undoCommittedChange(history[0].id, projectRevision)}>Undo latest committed change</Button>
          <output data-testid="e2e-state">{JSON.stringify(e2eState)}</output>
        </aside>
      ) : null}
    </main>
  );
}
