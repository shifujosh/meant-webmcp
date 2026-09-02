import type { ArtifactValues, InstrumentId, SemanticNodeKind } from "./contracts";
import type { CSSProperties } from "react";

export type VisualStyle = CSSProperties;

export const controlsByNodeKind: Record<SemanticNodeKind, InstrumentId[]> = {
  composition: ["warmth", "contrast", "spacing", "focalStrength", "softness", "surfaceDepth", "cornerRadius", "typeScale", "accentStrength", "saturation", "cropScale"],
  group: ["warmth", "contrast", "spacing", "focalStrength", "softness", "surfaceDepth", "cornerRadius", "typeScale", "accentStrength", "saturation", "cropScale"],
  text: ["contrast", "spacing", "focalStrength", "typeScale", "accentStrength"],
  action: ["contrast", "spacing", "focalStrength", "cornerRadius", "typeScale", "accentStrength"],
  image: ["warmth", "contrast", "focalStrength", "softness", "saturation", "cropScale"],
  shape: ["warmth", "contrast", "spacing", "focalStrength", "softness", "cornerRadius", "accentStrength", "saturation"],
  background: ["warmth", "contrast", "softness", "accentStrength", "saturation"],
  effect: ["contrast", "focalStrength", "softness", "surfaceDepth", "accentStrength"],
  decoration: ["warmth", "contrast", "spacing", "focalStrength", "softness", "cornerRadius", "accentStrength", "saturation"],
};

export interface ControlMetrics {
  warmth: number;
  contrast: number;
  spacing: number;
  focalScale: number;
  blur: number;
  depth: number;
  radius: number;
  typeScale: number;
  accent: number;
  saturation: number;
  cropScale: number;
}

export function controlMetrics(values: ArtifactValues): ControlMetrics {
  return {
    warmth: (values.warmth - 50) / 50,
    contrast: 0.72 + values.contrast * 0.0056,
    spacing: 0.7 + values.spacing * 0.0118,
    // Hierarchy must change the reading order, not merely nudge a layer.
    // The wider range is intentional: supporting layers visibly recede while
    // leading layers gain enough scale to become the first read.
    focalScale: 0.78 + values.focalStrength * 0.0046,
    blur: values.softness / 18,
    depth: 4 + values.surfaceDepth * 0.36,
    radius: 2 + values.cornerRadius * 0.32,
    typeScale: 0.72 + values.typeScale * 0.0076,
    accent: 0.35 + values.accentStrength * 0.0065,
    saturation: 0.55 + values.saturation * 0.012,
    cropScale: 0.82 + values.cropScale * 0.0058,
  };
}

export function metricForControl(values: ArtifactValues, control: InstrumentId): number {
  const metrics = controlMetrics(values);
  const map: Record<InstrumentId, number> = {
    warmth: metrics.warmth,
    contrast: metrics.contrast,
    spacing: metrics.spacing,
    focalStrength: metrics.focalScale,
    softness: metrics.blur,
    surfaceDepth: metrics.depth,
    cornerRadius: metrics.radius,
    typeScale: metrics.typeScale,
    accentStrength: metrics.accent,
    saturation: metrics.saturation,
    cropScale: metrics.cropScale,
  };
  return map[control];
}

export function formatControlValue(control: InstrumentId, value: number): string {
  const normalized = Math.max(0, Math.min(100, value));
  if (control === "warmth") {
    const temperature = Math.round(normalized - 50);
    return temperature === 0 ? "Neutral" : `${temperature > 0 ? "Warm" : "Cool"} ${Math.abs(temperature)}`;
  }
  const metrics = controlMetrics({
    warmth: normalized,
    contrast: normalized,
    spacing: normalized,
    focalStrength: normalized,
    softness: normalized,
    surfaceDepth: normalized,
    cornerRadius: normalized,
    typeScale: normalized,
    accentStrength: normalized,
    saturation: normalized,
    cropScale: normalized,
  });
  if (control === "softness" || control === "surfaceDepth" || control === "accentStrength" || control === "saturation") return `${Math.round(normalized)}%`;
  if (control === "cornerRadius") return `${Math.round(metrics.radius)} px`;
  if (control === "contrast" || control === "spacing" || control === "focalStrength") return `${Math.round(normalized)}%`;
  if (control === "typeScale") return `${Math.round(metrics.typeScale * 100)}%`;
  return `${Math.round(metrics.cropScale * 100)}%`;
}

export function mediaFilter(values: ArtifactValues, softnessMultiplier = 0.35): string {
  const metrics = controlMetrics(values);
  const warmSepia = Math.max(0, metrics.warmth) * 0.24;
  const coolShift = Math.max(0, -metrics.warmth) * -9;
  return [
    `contrast(${metrics.contrast})`,
    `saturate(${metrics.saturation})`,
    `sepia(${warmSepia})`,
    `hue-rotate(${coolShift}deg)`,
    `blur(${metrics.blur * softnessMultiplier}px)`,
  ].join(" ");
}

export function textStyle(values: ArtifactValues, baseSize: number, options: { compact?: boolean } = {}): VisualStyle {
  const metrics = controlMetrics(values);
  const compact = options.compact ?? false;
  const prominence = values.focalStrength / 100;
  return {
    fontSize: `${baseSize * metrics.typeScale * (0.94 + prominence * 0.12)}px`,
    lineHeight: compact ? 0.92 + metrics.spacing * 0.09 : 1.08 + metrics.spacing * 0.2,
    letterSpacing: `${(metrics.spacing - 1) * (compact ? 0.045 : 0.025)}em`,
    opacity: 0.62 + values.contrast * 0.0038,
    fontWeight: Math.round(400 + prominence * 500),
  };
}

export function actionStyle(values: ArtifactValues, emphasis: "primary" | "secondary"): VisualStyle {
  const metrics = controlMetrics(values);
  const prominence = values.focalStrength / 100;
  return {
    borderRadius: `${metrics.radius}px`,
    fontSize: `${12 * metrics.typeScale}px`,
    fontWeight: Math.round(520 + prominence * 280),
    padding: `${7 + metrics.spacing * 4}px ${10 + metrics.spacing * 7}px`,
    opacity: 0.72 + values.contrast * 0.0028,
    transform: `scale(${0.9 + prominence * 0.2})`,
    boxShadow: emphasis === "primary" ? `0 ${2 + prominence * 9}px ${8 + prominence * 24}px rgba(244,102,102,${0.06 + prominence * 0.2 + metrics.accent * 0.08})` : "none",
  };
}
