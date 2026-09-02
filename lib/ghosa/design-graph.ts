import type {
  AppliedOperation,
  ArtifactKind,
  CreativeArtifact,
  DesignConceptKind,
  DesignIntelligenceProfile,
  DesignOperation,
  DesignRelationKind,
  InstrumentId,
  InterpretationConstraint,
  InterpretationGraph,
  InterpretationPath,
  InterpretationSignal,
  LinguisticOperator,
  OperationEvidence,
} from "./contracts";
import { resolveNodeValues } from "./intent";

export interface DesignConceptNode {
  id: string;
  label: string;
  kind: DesignConceptKind;
  definition: string;
  aliases: string[];
  controls?: InstrumentId[];
  realization?: string;
  mediums?: ArtifactKind[];
  sourceIds: string[];
  curationStatus: "curated";
}

export interface DesignRelationEdge {
  from: string;
  to: string;
  relation: DesignRelationKind;
  strength: number;
  rationale: string;
  mediums?: ArtifactKind[];
  sourceIds: string[];
  curationStatus: "curated";
}

export interface DesignKnowledgeSource {
  id: string;
  title: string;
  url: string;
  authority: "internal_synthesis" | "official" | "community";
  license: string;
  retrievedAt: string;
}

export interface BuildInterpretationGraphInput {
  transcript: string;
  artifact: CreativeArtifact;
  targetIds: string[];
  targetNames: string[];
  profile?: DesignIntelligenceProfile;
  semanticScores?: Record<string, number>;
}

const allMediums: ArtifactKind[] = ["web", "graphic", "photo"];

export const designKnowledgeSources: DesignKnowledgeSource[] = [
  {
    id: "meant-curation",
    title: "Meant hackathon design-intelligence synthesis",
    url: "README.md",
    authority: "internal_synthesis",
    license: "Project-authored",
    retrievedAt: "2026-08-28",
  },
  {
    id: "design-md",
    title: "Google DESIGN.md",
    url: "https://github.com/google-labs-code/design.md",
    authority: "official",
    license: "Apache-2.0",
    retrievedAt: "2026-08-28",
  },
  {
    id: "awesome-design-md",
    title: "VoltAgent awesome-design-md",
    url: "https://github.com/VoltAgent/awesome-design-md",
    authority: "community",
    license: "MIT repository; referenced brands remain third-party",
    retrievedAt: "2026-08-28",
  },
];

type DesignConceptSeed = Omit<DesignConceptNode, "sourceIds" | "curationStatus"> & Partial<Pick<DesignConceptNode, "sourceIds">>;
type DesignRelationSeed = Omit<DesignRelationEdge, "sourceIds" | "curationStatus"> & Partial<Pick<DesignRelationEdge, "sourceIds">>;

const designConceptSeeds: DesignConceptSeed[] = [
  {
    id: "warmth",
    label: "Human warmth",
    kind: "perception",
    definition: "A sense of human presence, welcome, and emotional closeness rather than literal heat alone.",
    aliases: ["warm", "warmer", "inviting", "welcoming", "human", "cozy"],
  },
  {
    id: "playfulness",
    label: "Playfulness",
    kind: "perception",
    definition: "Lightness, surprise, buoyancy, and permission for visual wit without childishness.",
    aliases: ["playful", "fun", "whimsical", "cheerful"],
  },
  {
    id: "bubbliness",
    label: "Visual bubbliness",
    kind: "perception",
    definition: "An overtly pillowy, effervescent character carried by repeated round forms; distinct from playfulness itself.",
    aliases: ["bubbly", "bubble-like", "pillowy", "effervescent", "bubble shapes"],
  },
  {
    id: "friendliness",
    label: "Friendliness",
    kind: "perception",
    definition: "An approachable, generous, and legible character that lowers social distance.",
    aliases: ["friendly", "approachable", "open", "generous", "neighborly"],
  },
  {
    id: "premium",
    label: "Perceived quality",
    kind: "perception",
    definition: "Care, confidence, material quality, and deliberate execution without relying on status clichés.",
    aliases: ["premium", "expensive", "higher end", "high end", "elevated", "polished"],
  },
  {
    id: "luxury",
    label: "Luxury signaling",
    kind: "perception",
    definition: "Exclusivity and status signaling, often expressed through scarcity, ornament, or visual distance.",
    aliases: ["luxury", "luxurious", "exclusive", "opulent", "posh"],
  },
  {
    id: "restraint",
    label: "Restraint",
    kind: "principle",
    definition: "Deliberate limitation of competing signals so important choices appear intentional.",
    aliases: ["restrained", "subtle", "quiet", "understated", "less busy"],
  },
  {
    id: "boldness",
    label: "Boldness",
    kind: "perception",
    definition: "Clear conviction and decisive hierarchy without requiring visual noise.",
    aliases: ["bold", "bolder", "confident", "stronger", "decisive"],
  },
  {
    id: "loudness",
    label: "Visual loudness",
    kind: "perception",
    definition: "High simultaneous intensity across color, scale, density, or motion.",
    aliases: ["loud", "louder", "shouty", "overwhelming", "too much"],
  },
  {
    id: "minimalism",
    label: "Purposeful minimalism",
    kind: "principle",
    definition: "Reduction to what carries meaning while preserving hierarchy, affordance, and character.",
    aliases: ["minimal", "minimalist", "simpler", "pared back", "reduced"],
  },
  {
    id: "sparseness",
    label: "Sparseness",
    kind: "constraint",
    definition: "Low information or low visual density that may become empty rather than intentional.",
    aliases: ["sparse", "empty", "bare", "too little"],
  },
  {
    id: "organic",
    label: "Organic character",
    kind: "perception",
    definition: "Natural variation, asymmetry, tactile imperfection, and forms that do not feel mechanically imposed.",
    aliases: ["organic", "natural", "fluid", "alive", "handmade"],
  },
  {
    id: "earthy",
    label: "Earthiness",
    kind: "perception",
    definition: "Grounded natural color, raw material, and soil-derived associations.",
    aliases: ["earthy", "rustic", "grounded", "soil", "raw"],
  },
  {
    id: "cleanliness",
    label: "Visual clarity",
    kind: "principle",
    definition: "Legible organization, crisp relationships, and freedom from accidental clutter.",
    aliases: ["clean", "cleaner", "clear", "organized", "crisp"],
  },
  {
    id: "sterility",
    label: "Sterility",
    kind: "constraint",
    definition: "Over-controlled neutrality that removes human, tactile, or emotional signals.",
    aliases: ["sterile", "clinical", "cold", "soulless", "generic"],
  },
  {
    id: "editorial",
    label: "Editorial authority",
    kind: "pattern",
    definition: "A composed point of view expressed through hierarchy, pacing, cropping, and type-image tension.",
    aliases: ["editorial", "magazine", "art directed", "story driven"],
  },
  {
    id: "energy",
    label: "Energy",
    kind: "perception",
    definition: "Forward movement, contrast, rhythm, and a sense of active momentum.",
    aliases: ["energetic", "energy", "dynamic", "lively", "punchy"],
  },
  {
    id: "calm",
    label: "Calm",
    kind: "perception",
    definition: "Low cognitive pressure, stable rhythm, and sufficient room to understand what matters.",
    aliases: ["calm", "calmer", "serene", "quiet confidence", "peaceful"],
  },
  {
    id: "tactility",
    label: "Tactility",
    kind: "perception",
    definition: "A felt sense of surface, material, and touch rather than frictionless digital abstraction.",
    aliases: ["tactile", "textured", "material", "touchable", "physical"],
  },
  {
    id: "intimacy",
    label: "Intimacy",
    kind: "perception",
    definition: "Close framing, human scale, and emotional proximity to the subject.",
    aliases: ["intimate", "personal", "close", "human scale"],
  },
  {
    id: "palette-warmth",
    label: "Warm color relationships",
    kind: "property",
    definition: "A relative shift toward warm neutrals or warm-cool balance without indiscriminately adding orange.",
    aliases: ["warm palette", "color temperature", "warmer color"],
    controls: ["warmth"],
    realization: "rebalance color temperature while preserving the established palette",
    mediums: allMediums,
  },
  {
    id: "material-texture",
    label: "Material texture",
    kind: "property",
    definition: "Surface variation and edge behavior that make a design feel tactile and materially specific.",
    aliases: ["texture", "grain", "surface", "materiality"],
    controls: ["softness", "surfaceDepth"],
    realization: "introduce measured surface depth and tactile edge variation",
    mediums: allMediums,
  },
  {
    id: "humanist-type",
    label: "Humanist typography",
    kind: "property",
    definition: "Readable type with visible warmth, rhythm, and human character.",
    aliases: ["human type", "warm typography", "friendly type"],
    controls: ["typeScale", "spacing"],
    realization: "give typography a more generous, human rhythm",
    mediums: ["web", "graphic"],
  },
  {
    id: "rounded-geometry",
    label: "Softened geometry",
    kind: "property",
    definition: "Curvature that lowers sharpness and social distance; too much can become juvenile or bubbly.",
    aliases: ["rounded", "roundness", "soft corners", "bubble shapes"],
    controls: ["cornerRadius", "softness"],
    realization: "adjust curvature without turning every surface into a pill",
    mediums: ["web", "graphic"],
  },
  {
    id: "disciplined-type",
    label: "Typographic discipline",
    kind: "principle",
    definition: "Deliberate scale, spacing, and role contrast that signal care and authority.",
    aliases: ["type discipline", "typographic hierarchy", "refined type"],
    controls: ["typeScale", "spacing", "contrast"],
    realization: "strengthen typographic hierarchy and rhythm",
    mediums: ["web", "graphic"],
  },
  {
    id: "intentional-whitespace",
    label: "Intentional whitespace",
    kind: "principle",
    definition: "Space used to create hierarchy and pacing rather than emptiness for its own sake.",
    aliases: ["white space", "negative space", "breathing room", "space"],
    controls: ["spacing"],
    realization: "use spacing to clarify hierarchy rather than simply spreading elements apart",
    mediums: ["web", "graphic"],
  },
  {
    id: "controlled-contrast",
    label: "Controlled contrast",
    kind: "principle",
    definition: "Enough tonal or scale separation to direct attention without making every element compete.",
    aliases: ["contrast", "separation", "legibility", "clarity"],
    controls: ["contrast", "focalStrength"],
    realization: "increase the separation of important elements while protecting supporting roles",
    mediums: allMediums,
  },
  {
    id: "scale-contrast",
    label: "Scale contrast",
    kind: "principle",
    definition: "A meaningful difference between primary and supporting elements that creates decisive hierarchy.",
    aliases: ["scale contrast", "bigger headline", "hierarchy"],
    controls: ["typeScale", "focalStrength"],
    realization: "make the first read more decisive without enlarging everything",
    mediums: ["web", "graphic"],
  },
  {
    id: "asymmetric-balance",
    label: "Asymmetric balance",
    kind: "pattern",
    definition: "Unequal visual weights held in deliberate tension rather than mirrored symmetry.",
    aliases: ["asymmetry", "off center", "unexpected composition"],
    controls: ["spacing", "focalStrength"],
    realization: "create controlled tension through hierarchy and spacing",
    mediums: ["web", "graphic"],
  },
  {
    id: "image-intimacy",
    label: "Intimate image framing",
    kind: "property",
    definition: "A crop and focal relationship that brings the subject closer without losing material context.",
    aliases: ["close crop", "intimate crop", "closer image"],
    controls: ["cropScale", "focalStrength", "warmth"],
    realization: "bring the subject closer while preserving its material believability",
    mediums: ["graphic", "photo"],
  },
  {
    id: "depth-layering",
    label: "Layered depth",
    kind: "property",
    definition: "Separation created through overlap, focus, and elevation rather than ornamental shadow accumulation.",
    aliases: ["depth", "layered", "dimension", "foreground"],
    controls: ["surfaceDepth", "softness", "focalStrength"],
    realization: "separate foreground and background with restrained depth cues",
    mediums: allMediums,
  },
  {
    id: "color-intensity",
    label: "Color intensity",
    kind: "property",
    definition: "The combined saturation and accent strength carried by the palette.",
    aliases: ["saturation", "vivid", "colorful", "bright color"],
    controls: ["saturation", "accentStrength"],
    realization: "rebalance saturation and accent strength without leaving the brand system",
    mediums: allMediums,
  },
  {
    id: "buoyant-motion",
    label: "Buoyant motion",
    kind: "operation",
    definition: "Elastic, light temporal movement that supports emergence or celebration.",
    aliases: ["bounce", "buoyant motion", "lively motion"],
    realization: "use motion only where it clarifies state or supports the brand gesture",
    mediums: ["web"],
  },
  {
    id: "structured-rhythm",
    label: "Structured rhythm",
    kind: "principle",
    definition: "A repeated spacing and hierarchy cadence that makes complexity feel intentional.",
    aliases: ["rhythm", "cadence", "organized flow", "structure"],
    controls: ["spacing", "focalStrength"],
    realization: "establish a clearer cadence between primary and supporting regions",
    mediums: ["web", "graphic"],
  },
  {
    id: "material-honesty",
    label: "Material honesty",
    kind: "principle",
    definition: "Rendering that protects believable surfaces, light, and product character instead of over-polishing them.",
    aliases: ["material honesty", "believable", "authentic", "not plastic"],
    controls: ["contrast", "softness", "saturation"],
    realization: "preserve believable light and texture while refining the treatment",
    mediums: ["graphic", "photo"],
  },
];

export const designConcepts: DesignConceptNode[] = designConceptSeeds.map((concept) => ({
  ...concept,
  sourceIds: concept.sourceIds ?? ["meant-curation"],
  curationStatus: "curated",
}));

const designRelationSeeds: DesignRelationSeed[] = [
  { from: "warmth", to: "palette-warmth", relation: "manifests_as", strength: .94, rationale: "Color temperature is one available expression of warmth, but not its entire meaning." },
  { from: "warmth", to: "material-texture", relation: "manifests_as", strength: .86, rationale: "Tactile surface cues add human presence without relying only on hue." },
  { from: "warmth", to: "humanist-type", relation: "manifests_as", strength: .8, rationale: "A generous typographic rhythm can make warmth structural rather than decorative.", mediums: ["web", "graphic"] },
  { from: "warmth", to: "image-intimacy", relation: "supports", strength: .77, rationale: "Closer, materially believable imagery can create emotional proximity.", mediums: ["graphic", "photo"] },
  { from: "playfulness", to: "rounded-geometry", relation: "manifests_as", strength: .86, rationale: "Soft forms can feel playful, but excessive curvature can become childish." },
  { from: "playfulness", to: "color-intensity", relation: "supports", strength: .78, rationale: "Selective color energy supports play without requiring every color to shout." },
  { from: "playfulness", to: "buoyant-motion", relation: "supports", strength: .7, rationale: "Buoyant motion can add delight when it has a clear state or story purpose.", mediums: ["web"] },
  { from: "bubbliness", to: "rounded-geometry", relation: "manifests_as", strength: .94, rationale: "Repeated pillowy curvature is a direct carrier of visual bubbliness." },
  { from: "bubbliness", to: "color-intensity", relation: "supports", strength: .7, rationale: "Selective bright accents can reinforce effervescence without defining playfulness as a whole." },
  { from: "friendliness", to: "humanist-type", relation: "manifests_as", strength: .88, rationale: "Readable humanist rhythm lowers social distance." },
  { from: "friendliness", to: "rounded-geometry", relation: "supports", strength: .72, rationale: "Measured softness makes interaction feel approachable without becoming bubbly." },
  { from: "friendliness", to: "palette-warmth", relation: "supports", strength: .7, rationale: "Warm relationships can support approachability when the palette remains disciplined." },
  { from: "premium", to: "disciplined-type", relation: "manifests_as", strength: .93, rationale: "Typographic discipline signals care more reliably than luxury ornament." },
  { from: "premium", to: "intentional-whitespace", relation: "supports", strength: .87, rationale: "Deliberate space gives important material room to carry value." },
  { from: "premium", to: "material-honesty", relation: "requires", strength: .9, rationale: "Perceived quality depends on believable material and image treatment." },
  { from: "premium", to: "controlled-contrast", relation: "supports", strength: .79, rationale: "Confident separation adds finish without increasing spectacle." },
  { from: "premium", to: "luxury", relation: "conflicts_with", strength: .62, rationale: "Quality can be expressed without exclusivity or luxury clichés." },
  { from: "restraint", to: "intentional-whitespace", relation: "manifests_as", strength: .87, rationale: "Restraint uses space to reduce competition rather than emptying the design." },
  { from: "restraint", to: "structured-rhythm", relation: "supports", strength: .82, rationale: "A controlled cadence makes reduction feel deliberate." },
  { from: "restraint", to: "color-intensity", relation: "softens", strength: .78, rationale: "Restraint often lowers simultaneous color intensity while preserving one clear accent." },
  { from: "boldness", to: "scale-contrast", relation: "manifests_as", strength: .92, rationale: "Decisive scale contrast creates conviction without making everything louder." },
  { from: "boldness", to: "controlled-contrast", relation: "supports", strength: .84, rationale: "Clear tonal separation strengthens a focal claim." },
  { from: "loudness", to: "color-intensity", relation: "intensifies", strength: .9, rationale: "High saturation and accent strength can increase visual loudness." },
  { from: "loudness", to: "scale-contrast", relation: "intensifies", strength: .72, rationale: "Extreme scale can become loud when supporting roles also compete." },
  { from: "minimalism", to: "intentional-whitespace", relation: "requires", strength: .9, rationale: "Useful minimalism needs hierarchy-bearing space, not mere emptiness." },
  { from: "minimalism", to: "structured-rhythm", relation: "requires", strength: .88, rationale: "Structure keeps reduction legible and purposeful." },
  { from: "minimalism", to: "sparseness", relation: "conflicts_with", strength: .66, rationale: "Minimalism removes noise; sparseness can remove necessary meaning." },
  { from: "organic", to: "asymmetric-balance", relation: "manifests_as", strength: .86, rationale: "Controlled asymmetry creates natural variation without disorder." },
  { from: "organic", to: "material-texture", relation: "supports", strength: .84, rationale: "Tactile variation helps organic character feel material rather than symbolic." },
  { from: "earthy", to: "palette-warmth", relation: "manifests_as", strength: .78, rationale: "Earthiness often uses grounded warm relationships, though warmth need not be earthy." },
  { from: "earthy", to: "material-texture", relation: "supports", strength: .82, rationale: "Raw surface variation reinforces grounded natural character." },
  { from: "cleanliness", to: "structured-rhythm", relation: "manifests_as", strength: .91, rationale: "Clean design comes from legible relationships and cadence rather than blankness." },
  { from: "cleanliness", to: "controlled-contrast", relation: "supports", strength: .86, rationale: "Clear separation makes organization visible." },
  { from: "cleanliness", to: "sterility", relation: "degrades_in", strength: .65, rationale: "Cleanliness becomes sterile when human and tactile signals are removed." },
  { from: "sterility", to: "material-texture", relation: "conflicts_with", strength: .88, rationale: "Tactile specificity counterbalances frictionless sterility." },
  { from: "sterility", to: "palette-warmth", relation: "conflicts_with", strength: .78, rationale: "Warm relationships can counter clinical neutrality." },
  { from: "sterility", to: "image-intimacy", relation: "conflicts_with", strength: .72, rationale: "Human-scale framing can reduce emotional distance." },
  { from: "editorial", to: "scale-contrast", relation: "requires", strength: .92, rationale: "Editorial authority depends on an unmistakable reading order." },
  { from: "editorial", to: "asymmetric-balance", relation: "supports", strength: .84, rationale: "Type-image tension often benefits from deliberate asymmetry." },
  { from: "editorial", to: "disciplined-type", relation: "requires", strength: .91, rationale: "Typography carries editorial pacing and authority." },
  { from: "energy", to: "color-intensity", relation: "supports", strength: .82, rationale: "Selective intensity adds energy when hierarchy remains controlled." },
  { from: "energy", to: "scale-contrast", relation: "supports", strength: .78, rationale: "Scale shifts create forward momentum and a decisive first read." },
  { from: "energy", to: "buoyant-motion", relation: "manifests_as", strength: .68, rationale: "Motion can express energy when temporal behavior is available and purposeful.", mediums: ["web"] },
  { from: "calm", to: "intentional-whitespace", relation: "manifests_as", strength: .9, rationale: "Purposeful space lowers cognitive pressure while maintaining hierarchy." },
  { from: "calm", to: "structured-rhythm", relation: "supports", strength: .86, rationale: "Stable cadence helps a composition feel calm rather than inert." },
  { from: "calm", to: "color-intensity", relation: "softens", strength: .72, rationale: "Reducing simultaneous color intensity can create calm while protecting one accent." },
  { from: "tactility", to: "material-texture", relation: "manifests_as", strength: .95, rationale: "Surface and edge variation are direct carriers of tactility." },
  { from: "tactility", to: "depth-layering", relation: "supports", strength: .81, rationale: "Measured overlap and focus can make materials feel dimensional." },
  { from: "intimacy", to: "image-intimacy", relation: "manifests_as", strength: .94, rationale: "Close framing makes the subject feel emotionally and spatially nearer." },
  { from: "intimacy", to: "palette-warmth", relation: "supports", strength: .68, rationale: "Warm relationships can reinforce closeness without defining it." },
];

export const designRelations: DesignRelationEdge[] = designRelationSeeds.map((relation) => ({
  ...relation,
  sourceIds: relation.sourceIds ?? ["meant-curation"],
  curationStatus: "curated",
}));

const conceptById = new Map(designConcepts.map((concept) => [concept.id, concept]));

const normalized = (value: string) => value.toLowerCase().replace(/[’]/g, "'").replace(/[^a-z0-9\s'-]/g, " ").replace(/\s+/g, " ").trim();

const retrievalStopwords = new Set([
  "and", "are", "but", "design", "feel", "for", "from", "into", "make", "more",
  "that", "the", "their", "this", "through", "too", "visual", "when", "while", "with",
  "without", "work",
]);

function tokens(value: string) {
  return new Set(normalized(value).split(" ").filter((token) => token.length > 2 && !retrievalStopwords.has(token)));
}

function lexicalScore(transcript: string, concept: DesignConceptNode) {
  const text = normalized(transcript);
  const textTokens = tokens(text);
  let score = 0;
  for (const alias of [concept.label, ...concept.aliases]) {
    const cleanAlias = normalized(alias);
    if (cleanAlias && text.includes(cleanAlias)) score = Math.max(score, cleanAlias.includes(" ") ? .96 : .9);
    const aliasTokens = tokens(cleanAlias);
    if (!aliasTokens.size) continue;
    const overlap = [...aliasTokens].filter((token) => textTokens.has(token)).length / aliasTokens.size;
    score = Math.max(score, overlap * .68);
  }
  return score;
}

function operatorForOccurrence(text: string, occurrenceIndex: number): LinguisticOperator {
  const rawPrefix = text.slice(Math.max(0, occurrenceIndex - 64), occurrenceIndex).toLowerCase();
  const coordinatedPrefix = normalized(rawPrefix);
  if (/(?:\bwithout\b)(?:\s+(?:changing|altering|losing|touching|affecting))(?:\s+\w+){0,3}\s*$/.test(coordinatedPrefix)) return "preserve";
  if (/(?:\bdo not\b|\bdon't\b)(?:\s+(?:change|alter|touch|affect))(?:\s+\w+){0,3}\s*$/.test(coordinatedPrefix)) return "preserve";
  if (/(?:\bnot\b|\bwithout\b|\bavoid\b|\bdon't\b|\bdo not\b)(?:\s+\w+){0,6}\s+(?:or|and)(?:\s+(?:more|less|slightly|much))*\s*$/.test(coordinatedPrefix)) return "exclude";
  if (/(?:\bkeep\b|\bkeeping\b|\bpreserve\b|\bpreserving\b|\bretain\b|\bretaining\b)(?:\s+\w+){0,6}\s+(?:or|and)(?:\s+(?:more|less|slightly|much))*\s*$/.test(coordinatedPrefix)) return "preserve";
  if (/(?:\brather than\b|\binstead of\b)\s*$/.test(coordinatedPrefix)) return "exclude";
  const boundaries = [
    rawPrefix.lastIndexOf("."),
    rawPrefix.lastIndexOf(","),
    rawPrefix.lastIndexOf(";"),
    rawPrefix.lastIndexOf(" but "),
    rawPrefix.lastIndexOf(" and "),
    rawPrefix.lastIndexOf(" while "),
  ];
  const prefix = normalized(rawPrefix.slice(Math.max(...boundaries) + 1));
  if (/(?:\bnot\b|\bwithout\b|\bavoid\b|\bdon't\b|\bdo not\b)(?:\s+\w+){0,3}\s*$/.test(prefix)) return "exclude";
  if (/(?:\bkeep\b|\bkeeping\b|\bpreserve\b|\bpreserving\b|\bretain\b|\bretaining\b|\bstill\b)(?:\s+\w+){0,3}\s*$/.test(prefix)) return "preserve";
  if (/(?:\bless\b|\breduce\b|\bdecrease\b|\bdial back\b)(?:\s+\w+){0,3}\s*$/.test(prefix)) return "decrease";
  if (/(?:\bmore\b|\bincrease\b|\bmake it more\b|\bmake this more\b)(?:\s+\w+){0,3}\s*$/.test(prefix)) return "increase";
  return "request";
}

function matchingPhrases(transcript: string, concept: DesignConceptNode) {
  const text = normalized(transcript);
  const aliases = [concept.label, ...concept.aliases]
    .map(normalized)
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  const matches: Array<{ phrase: string; index: number }> = [];
  for (const alias of aliases) {
    let fromIndex = 0;
    while (fromIndex < text.length) {
      const index = text.indexOf(alias, fromIndex);
      if (index < 0) break;
      const end = index + alias.length;
      const overlaps = matches.some((match) => index < match.index + match.phrase.length && end > match.index);
      if (!overlaps) matches.push({ phrase: alias, index });
      fromIndex = Math.max(end, index + 1);
    }
  }
  return matches.sort((left, right) => left.index - right.index);
}

function matchingPhrase(transcript: string, concept: DesignConceptNode) {
  return matchingPhrases(transcript, concept)[0];
}

function availableControls(artifact: CreativeArtifact, targetIds: string[]) {
  if (!targetIds.length) return [...new Set(artifact.nodes.flatMap((node) => node.capabilities))];
  return [...new Set(
    artifact.nodes
      .filter((node) => targetIds.includes(node.id))
      .flatMap((node) => node.capabilities),
  )];
}

function extractSignals(
  transcript: string,
  semanticScores: Record<string, number>,
): InterpretationSignal[] {
  type SignalCandidate = {
    concept: DesignConceptNode;
    score: number;
    match?: { phrase: string; index: number };
  };
  const candidates: SignalCandidate[] = designConcepts
    .filter((concept) => ["perception", "principle", "pattern", "constraint"].includes(concept.kind))
    .flatMap((concept): SignalCandidate[] => {
      const lexical = lexicalScore(transcript, concept);
      const semantic = Math.max(0, semanticScores[concept.id] ?? 0);
      const score = Math.max(lexical, lexical > 0 ? lexical * .82 + semantic * .18 : semantic * .88);
      const matches = matchingPhrases(transcript, concept);
      return matches.length
        ? matches.map((match) => ({ concept, score, match }))
        : [{ concept, score, match: undefined }];
    })
    .filter((candidate) => candidate.score >= (candidate.match ? .5 : .58))
    .sort((a, b) => Number(Boolean(b.match)) - Number(Boolean(a.match)) || b.score - a.score || (a.match?.index ?? 0) - (b.match?.index ?? 0))
    .slice(0, 10);

  return candidates.map(({ concept, score, match }) => ({
    phrase: match?.phrase ?? concept.label.toLowerCase(),
    operator: match ? operatorForOccurrence(transcript, match.index) : "request",
    conceptId: concept.id,
    conceptLabel: concept.label,
    confidence: Math.min(.98, Math.max(.5, score)),
    grounded: Boolean(match),
  }));
}

function pathEffect(operator: LinguisticOperator, relation: DesignRelationKind): InterpretationPath["effect"] {
  if (operator === "preserve") return "hold";
  if (operator === "exclude") return "exclude";
  if (relation === "degrades_in") return "guard";
  const sourceDirection = operator === "decrease" ? "decrease" : "increase";
  if (relation === "conflicts_with" || relation === "softens") {
    return sourceDirection === "increase" ? "decrease" : "increase";
  }
  return sourceDirection;
}

export function protectedControlsForText(value: string): InstrumentId[] {
  const text = normalized(value);
  const controls: InstrumentId[] = [];
  if (/\b(?:color|colors|colour|colours|palette|hue|saturation)\b/.test(text)) {
    controls.push("warmth", "saturation", "accentStrength");
  }
  if (/\b(?:typography|type|font|fonts|lettering)\b/.test(text)) {
    controls.push("typeScale", "spacing");
  }
  if (/\b(?:spacing|space|gaps|rhythm)\b/.test(text)) controls.push("spacing");
  if (/\b(?:layout|composition|structure|bones)\b/.test(text)) {
    controls.push("spacing", "typeScale", "focalStrength", "cropScale");
  }
  if (/\b(?:hierarchy|reading order)\b/.test(text)) {
    controls.push("typeScale", "focalStrength", "contrast", "spacing");
  }
  if (/\b(?:crop|cropping|framing)\b/.test(text)) controls.push("cropScale", "focalStrength");
  if (/\b(?:contrast|legibility|readability)\b/.test(text)) controls.push("contrast");
  if (/\b(?:corners|curvature|roundness|shape|shapes)\b/.test(text)) controls.push("cornerRadius", "softness");
  if (/\b(?:depth|elevation|shadow|shadows)\b/.test(text)) controls.push("surfaceDepth", "softness");
  return [...new Set(controls)];
}

export function protectedControlsForGraph(graph: InterpretationGraph) {
  return new Set(graph.constraints.flatMap((constraint) => constraint.protectedControls ?? []));
}

export function operationConflictsWithGraphConstraints(graph: InterpretationGraph, operation: DesignOperation) {
  return protectedControlsForGraph(graph).has(operation.control);
}

function constraintsFor(
  transcript: string,
  signals: InterpretationSignal[],
  profile?: DesignIntelligenceProfile,
): InterpretationConstraint[] {
  const constraints: InterpretationConstraint[] = [];
  for (const signal of signals) {
    if (signal.operator === "preserve") {
      const protectedControls = protectedControlsForText(signal.phrase);
      constraints.push({
        kind: "explicit_preserve",
        label: signal.conceptLabel,
        source: `“${signal.phrase}”`,
        ...(protectedControls.length ? { protectedControls } : {}),
      });
    }
    if (signal.operator === "exclude") {
      constraints.push({ kind: "explicit_avoid", label: signal.conceptLabel, source: `“${signal.phrase}”` });
    }
  }
  const preserveClause = transcript.match(/(?:preserve|keep|retain)\s+(.+?)(?:,|\bbut\b|\bwhile\b|\band\s+(?:make|change|reduce|increase|decrease|add|remove|give|turn)\b|$)/i)?.[1]?.trim().replace(/[.]+$/, "").replace(/^(?:it|this|that)\s+/i, "");
  const withoutChangeClause = transcript.match(/\bwithout\s+(?:changing|altering|losing|touching|affecting)\s+(.+?)(?:,|\bbut\b|$)/i)?.[1]?.trim().replace(/[.]+$/, "");
  const negatedChangeClause = transcript.match(/\b(?:do not|don't)\s+(?:change|alter|touch|affect)\s+(.+?)(?:,|\bbut\b|$)/i)?.[1]?.trim().replace(/[.]+$/, "");
  const avoidClause = withoutChangeClause || negatedChangeClause
    ? undefined
    : transcript.match(/(?:without|avoid|do not|don't)\s+(.+?)(?:,|\bbut\b|$)/i)?.[1]?.trim();
  if (preserveClause && !signals.some((signal) => signal.operator === "preserve") && !constraints.some((item) => normalized(item.label) === normalized(preserveClause))) {
    const protectedControls = protectedControlsForText(preserveClause);
    constraints.push({
      kind: "explicit_preserve",
      label: preserveClause,
      source: "direct instruction",
      ...(protectedControls.length ? { protectedControls } : {}),
    });
  }
  if (withoutChangeClause && !constraints.some((item) => normalized(item.label) === normalized(withoutChangeClause))) {
    const protectedControls = protectedControlsForText(withoutChangeClause);
    constraints.push({
      kind: "explicit_preserve",
      label: withoutChangeClause,
      source: "without changing",
      ...(protectedControls.length ? { protectedControls } : {}),
    });
  }
  if (negatedChangeClause && !constraints.some((item) => normalized(item.label) === normalized(negatedChangeClause))) {
    const protectedControls = protectedControlsForText(negatedChangeClause);
    constraints.push({
      kind: "explicit_preserve",
      label: negatedChangeClause,
      source: "do not change",
      ...(protectedControls.length ? { protectedControls } : {}),
    });
  }
  if (avoidClause && !signals.some((signal) => signal.operator === "exclude") && !constraints.some((item) => normalized(item.label) === normalized(avoidClause))) {
    constraints.push({ kind: "explicit_avoid", label: avoidClause, source: "direct instruction" });
  }
  for (const invariant of profile?.brandGrammar.invariants.slice(0, 3) ?? []) {
    constraints.push({ kind: "brand", label: invariant, source: "Bobalicious brand grammar" });
  }
  const matchedConceptIds = new Set(signals.map((signal) => signal.conceptId));
  for (const pattern of profile?.tasteProfile.rejectedPatterns ?? []) {
    const patternTokens = tokens(pattern);
    const relevant = designConcepts.some((concept) =>
      matchedConceptIds.has(concept.id) &&
      [...tokens(`${concept.label} ${concept.definition} ${concept.aliases.join(" ")}`)].some((token) => patternTokens.has(token)),
    );
    if (relevant) constraints.push({ kind: "taste", label: pattern, source: "workspace preference" });
  }
  return constraints
    .filter((constraint, index, all) => all.findIndex((candidate) => candidate.kind === constraint.kind && candidate.label === constraint.label) === index)
    .slice(0, 8);
}

function buildPaths(
  signals: InterpretationSignal[],
  artifact: CreativeArtifact,
  controls: InstrumentId[],
): InterpretationPath[] {
  const controlSet = new Set(controls);
  const paths: InterpretationPath[] = [];
  for (const signal of signals) {
    const edges = designRelations
      .filter((edge) => edge.from === signal.conceptId)
      .filter((edge) => !edge.mediums || edge.mediums.includes(artifact.kind))
      .sort((a, b) => b.strength - a.strength);
    for (const edge of edges) {
      const target = conceptById.get(edge.to);
      if (!target) continue;
      if (target.mediums && !target.mediums.includes(artifact.kind)) continue;
      const targetControls = (target.controls ?? []).filter((control) => controlSet.has(control));
      const isConceptualConstraint = signal.operator === "exclude" || signal.operator === "preserve" || edge.relation === "conflicts_with" || edge.relation === "degrades_in";
      if (!targetControls.length && !isConceptualConstraint) continue;
      paths.push({
        id: `${artifact.id}:${signal.conceptId}-${edge.relation}-${edge.to}`,
        phrase: signal.phrase,
        operator: signal.operator,
        effect: pathEffect(signal.operator, edge.relation),
        sourceConceptId: signal.conceptId,
        sourceLabel: signal.conceptLabel,
        relation: edge.relation,
        targetConceptId: target.id,
        targetLabel: target.label,
        realization: target.realization ?? target.definition,
        controls: targetControls,
        confidence: Math.min(.98, signal.confidence * .6 + edge.strength * .4),
        rationale: edge.rationale,
        artifactId: artifact.id,
        artifactKind: artifact.kind,
        grounded: signal.grounded,
        sourceIds: [...new Set([
          ...(conceptById.get(signal.conceptId)?.sourceIds ?? []),
          ...target.sourceIds,
          ...edge.sourceIds,
        ])],
      });
    }
  }
  return paths
    .sort((a, b) => {
      const roleA = a.operator === "exclude" || a.operator === "preserve" ? 1 : 0;
      const roleB = b.operator === "exclude" || b.operator === "preserve" ? 1 : 0;
      return roleB - roleA || b.confidence - a.confidence;
    })
    .filter((path, index, all) => all.findIndex((candidate) => candidate.id === path.id && candidate.operator === path.operator) === index)
    .slice(0, 10);
}

function readingFor(signals: InterpretationSignal[], targetNames: string[]) {
  if (!signals.length) return `Translate the request into a measured change to ${targetNames.join(", ") || "the selected design"}.`;
  const goals = signals.filter((signal) => signal.operator === "request" || signal.operator === "increase");
  const reductions = signals.filter((signal) => signal.operator === "decrease");
  const preserves = signals.filter((signal) => signal.operator === "preserve");
  const excludes = signals.filter((signal) => signal.operator === "exclude");
  const parts = [
    goals.length ? `Move toward ${goals.map((signal) => signal.conceptLabel.toLowerCase()).join(" and ")}` : "Refine the selected design",
    reductions.length ? `reduce ${reductions.map((signal) => signal.conceptLabel.toLowerCase()).join(" and ")}` : "",
    preserves.length ? `keep ${preserves.map((signal) => signal.conceptLabel.toLowerCase()).join(" and ")}` : "",
    excludes.length ? `avoid ${excludes.map((signal) => signal.conceptLabel.toLowerCase()).join(" and ")}` : "",
  ].filter(Boolean);
  return `${parts.join("; ")}.`;
}

export function buildInterpretationGraph(input: BuildInterpretationGraphInput): InterpretationGraph {
  const semanticScores = input.semanticScores ?? {};
  const controls = availableControls(input.artifact, input.targetIds);
  const signals = extractSignals(input.transcript, semanticScores);
  const paths = buildPaths(signals, input.artifact, controls);
  const unresolved: string[] = [];
  const warmth = signals.find((signal) => signal.conceptId === "warmth");
  if (warmth && !matchingPhrase(input.transcript, conceptById.get("palette-warmth")!)) {
    const warmthPaths = paths.filter((path) => path.sourceConceptId === "warmth" && path.operator !== "exclude");
    if (warmthPaths.length > 2 && warmth.confidence < .78) {
      unresolved.push("Warmth could refer to color, material, typography, or image proximity; artifact context will determine the least destructive expression.");
    }
  }
  return {
    version: "2026.08-hackathon-1",
    retrievalMode: Object.keys(semanticScores).length ? "hybrid" : "graph",
    reading: readingFor(signals, input.targetNames),
    signals,
    paths,
    constraints: constraintsFor(input.transcript, signals, input.profile),
    groundings: [{
      artifactId: input.artifact.id,
      artifactKind: input.artifact.kind,
      targetIds: input.targetIds,
      targetNames: input.targetNames,
      availableControls: controls,
    }],
    unresolved,
  };
}

export function mergeInterpretationGraphs(graphs: InterpretationGraph[]): InterpretationGraph {
  const first = graphs[0];
  if (!first) throw new Error("At least one interpretation graph is required");
  return {
    ...first,
    retrievalMode: graphs.some((graph) => graph.retrievalMode === "hybrid") ? "hybrid" : "graph",
    signals: first.signals,
    paths: graphs.flatMap((graph) => graph.paths),
    constraints: graphs
      .flatMap((graph) => graph.constraints)
      .filter((constraint, index, all) => all.findIndex((candidate) => candidate.kind === constraint.kind && candidate.label === constraint.label) === index),
    groundings: graphs.flatMap((graph) => graph.groundings),
    unresolved: [...new Set(graphs.flatMap((graph) => graph.unresolved))],
  };
}

export function interpretationNeedsSemanticRecall(graph: InterpretationGraph) {
  const actionableSignalIds = new Set(
    graph.signals
      .filter((signal) => signal.grounded && ["request", "increase", "decrease"].includes(signal.operator))
      .map((signal) => signal.conceptId),
  );
  return !graph.paths.some((path) =>
    path.grounded &&
    actionableSignalIds.has(path.sourceConceptId) &&
    path.controls.length > 0 &&
    (path.effect === "increase" || path.effect === "decrease"),
  );
}

export function operationIdFor(operation: DesignOperation, operationIndex: number) {
  const targetKey = operation.targetIds.length ? [...operation.targetIds].sort().join("+") : "artifact";
  return `${operation.artifactId}:${targetKey}:${operation.control}:${operationIndex + 1}`;
}

export function normalizeDesignOperations(operations: DesignOperation[]) {
  const seen = new Set<string>();
  return [...operations]
    .reverse()
    .filter((operation) => {
      const key = `${operation.artifactId}:${[...operation.targetIds].sort().join("+")}:${operation.control}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .reverse();
}

function valuesForOperation(artifacts: CreativeArtifact[], operation: DesignOperation) {
  const artifact = artifacts.find((candidate) => candidate.id === operation.artifactId);
  if (!artifact) return [];
  const targetIds = operation.targetIds.length ? operation.targetIds : [artifact.id];
  return targetIds.map((targetId) => ({
    targetId,
    value: targetId === artifact.id
      ? artifact.values[operation.control]
      : resolveNodeValues(artifact, targetId)[operation.control],
  }));
}

export function appliedOperationsForChange(
  beforeArtifacts: CreativeArtifact[],
  afterArtifacts: CreativeArtifact[],
  operations: DesignOperation[],
): AppliedOperation[] {
  return normalizeDesignOperations(operations).map((operation, operationIndex) => ({
    ...operation,
    id: operationIdFor(operation, operationIndex),
    beforeValues: valuesForOperation(beforeArtifacts, operation),
    afterValues: valuesForOperation(afterArtifacts, operation),
  }));
}

function operationEffect(operation: DesignOperation, artifact: CreativeArtifact) {
  const baselines = operation.targetIds.length
    ? operation.targetIds.map((targetId) => resolveNodeValues(artifact, targetId)[operation.control])
    : [artifact.values[operation.control]];
  const directions = new Set(
    baselines
      .map((baseline) => operation.value === baseline ? "hold" : operation.value > baseline ? "increase" : "decrease")
      .filter((direction) => direction !== "hold"),
  );
  if (directions.size !== 1) return undefined;
  return [...directions][0] as "increase" | "decrease";
}

export function operationEvidenceForGraph(
  graph: InterpretationGraph,
  operations: DesignOperation[],
  artifacts: CreativeArtifact[],
) {
  const protectedControls = protectedControlsForGraph(graph);
  const operationEvidence: OperationEvidence[] = operations.flatMap((operation, operationIndex) => {
    const artifact = artifacts.find((candidate) => candidate.id === operation.artifactId);
    if (!artifact || protectedControls.has(operation.control)) return [];
    const effect = operationEffect(operation, artifact);
    if (!effect) return [];
    const path = graph.paths
      .filter((candidate) =>
        candidate.grounded &&
        candidate.artifactId === operation.artifactId &&
        candidate.effect === effect &&
        candidate.controls.includes(operation.control),
      )
      .sort((left, right) => right.confidence - left.confidence)[0];
    if (!path) return [];
    return [{
      operationId: operationIdFor(operation, operationIndex),
      pathId: path.id,
      explanation: `${path.sourceLabel} ${path.relation.replaceAll("_", " ")} ${path.targetLabel.toLowerCase()}.`,
    }];
  });
  return {
    operationEvidence,
    selectedPathIds: [...new Set(operationEvidence.map((evidence) => evidence.pathId))],
  };
}

export function conceptEmbeddingDocuments() {
  return designConcepts.map((concept) => ({
    id: concept.id,
    text: [
      concept.label,
      concept.definition,
      `Related language: ${concept.aliases.join(", ")}`,
      concept.realization ? `Visual realization: ${concept.realization}` : "",
    ].filter(Boolean).join(". "),
  }));
}

export function graphPromptSlice(graph: InterpretationGraph) {
  return {
    reading: graph.reading,
    retrievalMode: graph.retrievalMode,
    linguisticSignals: graph.signals,
    designPaths: graph.paths.map((path) => ({
      id: path.id,
      phrase: path.phrase,
      operator: path.operator,
      effect: path.effect,
      source: path.sourceLabel,
      relation: path.relation,
      target: path.targetLabel,
      realization: path.realization,
      controls: path.controls,
      rationale: path.rationale,
      artifactId: path.artifactId,
      artifactKind: path.artifactKind,
      grounded: path.grounded,
      sourceIds: path.sourceIds,
    })),
    constraints: graph.constraints,
    groundings: graph.groundings,
    unresolved: graph.unresolved,
    knowledgeSources: designKnowledgeSources,
  };
}
