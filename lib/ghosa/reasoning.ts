import type { IntentScope } from "./contracts";

export type DesignReasoningEffort = "low" | "medium" | "high";

const STRATEGIC_DESIGN_LANGUAGE = /\b(?:across|all artifacts|whole|entire|redesign|reimagine|rework|explore|options|directions|system|campaign|design direction)\b/i;
const NUANCED_DESIGN_LANGUAGE = /\b(?:but|without|while|keep|preserve|rather than|editorial|composition|hierarchy|balance|brand|polish|refine|cohesive|make it feel)\b/i;

/**
 * Use the slower design-director pass only when the request actually benefits
 * from comparing strategies. Ordinary scoped edits should stay responsive.
 */
export function selectDesignReasoningEffort(
  transcript: string,
  scope?: IntentScope,
): DesignReasoningEffort {
  const text = transcript.trim();
  const clauses = text.split(/[,;]|\b(?:but|while|without|and then)\b/i).filter((part) => part.trim()).length;
  if (scope === "project" || STRATEGIC_DESIGN_LANGUAGE.test(text) || text.length > 220 || clauses >= 4) return "high";
  if (NUANCED_DESIGN_LANGUAGE.test(text) || text.length > 120 || clauses >= 2) return "medium";
  return "low";
}
