# Meant agent tool roadmap

The 1.1.0 hosted baseline intentionally keeps nine tools while establishing evidence for discovery, recovery, authorization, rendering, and human decisions. New tools should be added only when usage shows that agents cannot express an important job safely through the existing semantic operation surface.

## Candidate order

1. **Selection management** — read and set the active frame and semantic node selection so agents can coordinate precisely with the person's canvas focus.
2. **Asset placement with provenance** — attach or place a user-provided asset while preserving source, license, alt text, crop, and revision history.
3. **Accessible export** — export a kept revision to bounded formats with an accessibility report and no silent external publication.
4. **Comments and annotations** — attach review notes to stable frame or node IDs without mutating the composition.
5. **Named version restore** — preview a historical revision as Exploring, then require an explicit Keep to restore it as a new revision.
6. **Design-system tokens** — inspect and preview controlled typography, color, and spacing token changes across a composition.
7. **Batch variants** — create a bounded set of named Exploring alternatives for Compare without multiplying durable state.

## Admission gate

A candidate enters the hosted catalog only when it has:

- at least five positive and three negative eval prompts;
- a narrow typed schema and a clear “Use this when / Do not use this when” description;
- revision, scope, and workspace isolation tests;
- deterministic or explicitly user-funded execution;
- a recoverable error contract and machine-readable next actions;
- an explicit human decision gate for durable or externally visible effects;
- proof that it does not duplicate an existing tool plus bounded operations.

Keep the invariant: agents may Explore and inspect autonomously, while people own Keep, Undo, export, publication, and other consequential actions.
