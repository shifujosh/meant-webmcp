export type Rgb = [number, number, number];

export interface ReadableInkChoice {
  fill: string;
  contrast: number;
  passes: boolean;
}

const brandInks = ["#3A241C", "#FFF1D6"];
const emergencyInks = ["#111111", "#FFFFFF"];

function hexToRgb(hex: string): Rgb {
  const value = hex.replace("#", "");
  const expanded = value.length === 3 ? value.split("").map((part) => `${part}${part}`).join("") : value;
  return [0, 2, 4].map((offset) => Number.parseInt(expanded.slice(offset, offset + 2), 16)) as Rgb;
}

function channelLuminance(channel: number) {
  const normalized = channel / 255;
  return normalized <= 0.04045 ? normalized / 12.92 : ((normalized + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance([red, green, blue]: Rgb) {
  return 0.2126 * channelLuminance(red) + 0.7152 * channelLuminance(green) + 0.0722 * channelLuminance(blue);
}

export function contrastRatio(foreground: Rgb, background: Rgb) {
  const lighter = Math.max(relativeLuminance(foreground), relativeLuminance(background));
  const darker = Math.min(relativeLuminance(foreground), relativeLuminance(background));
  return (lighter + 0.05) / (darker + 0.05);
}

function resilientContrast(fill: string, samples: Rgb[]) {
  if (!samples.length) return 0;
  const foreground = hexToRgb(fill);
  const ratios = samples.map((sample) => contrastRatio(foreground, sample)).sort((a, b) => a - b);
  return ratios[Math.floor((ratios.length - 1) * 0.2)] ?? 0;
}

/**
 * Choose ink against the actual rendered pixels beneath a text layer. Brand
 * inks win whenever they clear WCAG AA; neutral black/white are a safety net.
 */
export function chooseReadableInk(samples: Rgb[]): ReadableInkChoice {
  const rankedBrand = brandInks
    .map((fill) => ({ fill, contrast: resilientContrast(fill, samples) }))
    .sort((a, b) => b.contrast - a.contrast);
  const brandChoice = rankedBrand[0] ?? { fill: brandInks[0], contrast: 0 };
  if (brandChoice.contrast >= 4.5) return { ...brandChoice, passes: true };

  const neutralChoice = emergencyInks
    .map((fill) => ({ fill, contrast: resilientContrast(fill, samples) }))
    .sort((a, b) => b.contrast - a.contrast)[0] ?? brandChoice;
  const choice = neutralChoice.contrast > brandChoice.contrast ? neutralChoice : brandChoice;
  return { ...choice, passes: choice.contrast >= 4.5 };
}
