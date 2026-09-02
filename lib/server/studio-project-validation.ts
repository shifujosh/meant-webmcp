import type { StudioProject } from "@/lib/ghosa/contracts";
import { validateCompositionDocument } from "@/lib/meant/composition-core";
import { validCreativeArtifact } from "@/lib/server/model-request-validation";
import { validPublicId } from "@/lib/server/request-security";

export function isStudioProject(value: unknown): value is StudioProject {
  if (!value || typeof value !== "object") return false;
  const project = value as Partial<StudioProject>;
  const structurallyValid = (
    validPublicId(project.id) &&
    typeof project.name === "string" && project.name.trim().length > 0 && project.name.length <= 160 &&
    typeof project.brief === "string" && project.brief.length <= 8_000 &&
    typeof project.accentRule === "string" && project.accentRule.length <= 4_000 &&
    Array.isArray(project.artifacts) &&
    project.artifacts.length <= 100 &&
    project.artifacts.every(validCreativeArtifact) &&
    new Set(project.artifacts.map((artifact) => artifact.id)).size === project.artifacts.length &&
    Array.isArray(project.expressionPackets) &&
    project.expressionPackets.length <= 200 &&
    Array.isArray(project.provenance) &&
    project.provenance.length <= 500
  );
  if (!structurallyValid) return false;
  try {
    if (project.composition !== undefined) validateCompositionDocument(project.composition);
    return true;
  } catch {
    return false;
  }
}
