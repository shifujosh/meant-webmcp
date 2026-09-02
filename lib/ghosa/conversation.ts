export type ContextualFollowUpResolution =
  | { kind: "new_instruction"; transcript: string }
  | { kind: "missing_context"; transcript: string }
  | { kind: "inherited"; transcript: string };

function normalized(text: string) {
  return text.trim().replace(/[.!?]+$/g, "").replace(/\s+/g, " ");
}

function rebindToCurrentSelection(text: string) {
  return text
    .replace(
      /\b(against|on|over|into)\s+((?:the\s+)?)background\b/gi,
      (_match, relation: string, article: string) => `${relation} ${article}__ghosa_surface__`,
    )
    .replace(
      /\b(?:the\s+)?(?:photo credit|editorial label|availability note|flavor note|location note|flavor list|menu link|locations link|our story link|campaign label|flavor kicker|edge vignette|milk tea field|signature drink|mango field|cream halo|pearl cluster|matcha wave|supporting copy|body copy|body text|subhead|headline|heading|title|caption|eyebrow|kicker|label|wordmark|logo|buttons?|actions?|button group|call to action|cta|navigation|nav|header|footer|background|photo|image|visual|subject|shape)\b/gi,
      "this layer",
    )
    .replace(/__ghosa_surface__/g, "background")
    .replace(/\bthis layer(?:\s+(?:and|or)\s+this layer)+\b/gi, "this layer")
    .replace(/\s+/g, " ")
    .trim();
}

const repeatOnTarget = /^(?:same|same thing|same change|same treatment|same edit|same adjustment|same look)(?:\s+(?:here|again|for this|for this one|for that|for that one))?$/i;
const namedRepeat = /^(?:same(?:\s+(?:thing|change|treatment|edit|adjustment|look))?|(?:do|apply|make)\s+that)\s+(?:for|to|on)\s+(.+)$/i;
const continueFurther = /^(?:again|(?:a\s+)?(?:little|bit)\s+more|more(?:\s+than\s+that)?|push\s+(?:it|that)\s+(?:a\s+)?(?:little\s+)?further|take\s+(?:it|that)\s+(?:a\s+)?(?:little\s+)?further)$/i;
const continueMuchFurther = /^(?:much|way|far)\s+more|^(?:push|take)\s+(?:it|that)\s+(?:much|way|far)\s+further$/i;
const softenPrevious = /^(?:a\s+)?(?:little|bit)\s+less$|^(?:too much|not that much|dial (?:it|that) back|back (?:it|that) off)$/i;

function intensify(text: string) {
  const rebound = rebindToCurrentSelection(text).replace(/[.!?]+$/g, "");
  return /\b(?:much|significantly|substantially|dramatically|noticeably|far)\b/i.test(rebound)
    ? rebound
    : `${rebound}. Make the same adjustment much more pronounced.`;
}

function invert(text: string) {
  const rebound = rebindToCurrentSelection(text)
    .replace(/\b(?:much|significantly|substantially|dramatically|noticeably|far)\b/gi, "")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/[.!?]+$/g, "");
  const opposites: Record<string, string> = {
    larger: "smaller",
    bigger: "smaller",
    smaller: "larger",
    warmer: "cooler",
    warm: "cooler",
    cooler: "warmer",
    darker: "lighter",
    lighter: "darker",
    softer: "crisper",
    soft: "crisper",
    crisper: "softer",
    sharper: "softer",
    tighter: "more open",
    closer: "farther",
    farther: "closer",
    rounder: "sharper",
    rounded: "sharper",
    vivid: "muted",
    muted: "more vivid",
    flatter: "more layered",
    layered: "flatter",
    louder: "quieter",
    quieter: "more prominent",
  };
  let changed = false;
  const inverted = rebound.replace(
    /\b(?:larger|bigger|smaller|warmer|warm|cooler|darker|lighter|softer|soft|crisper|sharper|tighter|closer|farther|rounder|rounded|vivid|muted|flatter|layered|louder|quieter)\b/gi,
    (match) => {
      changed = true;
      return opposites[match.toLowerCase()] ?? match;
    },
  );
  return changed ? inverted : undefined;
}

export function isContextualFollowUp(text: string) {
  const value = normalized(text);
  return /^(?:and\s+)?(?:this|that|it)(?:\s+one)?\s+(?:too|also|as well)$/i.test(value) ||
    repeatOnTarget.test(value) ||
    /^(?:do|apply|make)\s+(?:the\s+)?same(?:\s+(?:thing|change))?(?:\s+(?:here|to this|to this one|to that|to that one))?$/i.test(value) ||
    /^(?:do|apply)\s+that\s+(?:here|too|to this|to this one)$/i.test(value) ||
    /^(?:ditto)$/i.test(value) ||
    namedRepeat.test(value) ||
    continueFurther.test(value) ||
    continueMuchFurther.test(value) ||
    softenPrevious.test(value);
}

/** Resolve conversational shorthand while keeping the newly selected layer as the target. */
export function resolveContextualFollowUp(
  text: string,
  previousAppliedTranscript?: string,
): ContextualFollowUpResolution {
  const value = normalized(text);
  if (!isContextualFollowUp(value)) return { kind: "new_instruction", transcript: text.trim() };
  if (!previousAppliedTranscript?.trim()) return { kind: "missing_context", transcript: text.trim() };

  const namedTarget = value.match(namedRepeat)?.[1];
  const previous = rebindToCurrentSelection(previousAppliedTranscript.trim()).replace(/[.!?]+$/g, "");
  if (namedTarget && !/^(?:this|this one|that|that one|it|here)$/i.test(namedTarget)) {
    const targetLabel = namedTarget.replace(/^the\s+/i, "");
    return {
      kind: "inherited",
      transcript: /\bthis layer\b/i.test(previous)
        ? previous.replace(/\bthis layer\b/gi, `the ${targetLabel}`)
        : `${previous}. Apply the same intent to ${targetLabel}.`,
    };
  }
  if (continueMuchFurther.test(value)) {
    return { kind: "inherited", transcript: intensify(previous) };
  }
  if (continueFurther.test(value)) {
    return { kind: "inherited", transcript: previous };
  }
  if (softenPrevious.test(value)) {
    const inverted = invert(previous);
    return inverted
      ? { kind: "inherited", transcript: inverted }
      : { kind: "missing_context", transcript: text.trim() };
  }
  return { kind: "inherited", transcript: previous };
}
