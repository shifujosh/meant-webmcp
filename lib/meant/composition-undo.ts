import type { StudioProject } from "../ghosa/contracts";

/**
 * Restore the exact earlier project snapshot without making document authority
 * move backwards. Receipts remain as evidence that the original Keep occurred;
 * the durable revert row explains the later reversal.
 */
export function restoreProjectForUndo(
  before: StudioProject,
  current: StudioProject,
  committedAt: string,
): StudioProject {
  const restored = structuredClone(before);
  if (restored.composition && current.composition) {
    restored.composition = {
      ...restored.composition,
      version: current.composition.version + 1,
      updatedAt: committedAt,
    };
  }
  restored.compositionReceipts = structuredClone(current.compositionReceipts ?? []);
  restored.activeChangeSet = undefined;
  return restored;
}
