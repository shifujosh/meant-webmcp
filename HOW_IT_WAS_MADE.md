# How Meant Was Made

Meant began as a product question: could a creative editor allow people to direct outcomes in ordinary language without surrendering control of the canvas, layers, or revisions to an unconstrained agent?

Conventional creative software forces people to translate high-level intent into layers, coordinates, panels, and property names before they can evaluate the result. Standard AI wrappers attempt to solve this by turning the workspace into a chatbot that replaces the canvas with opaque generated images.

We built Meant around a third model: the canvas remains central, language directs it, agents inspect and propose bounded operations, and every consequential change stays visible, reversible, and human-controlled.

## From idea to prototype

Early exploration focused on making meaning addressable. Creative direction operates on concepts like “make the title quieter,” “give the page more room,” or “make the story feel more grounded.”

To support that vocabulary, Meant models compositions as structured documents with stable frames, semantic nodes, layout modes, bounded style primitives, and artifact-specific design contracts. That structure enables both people and models to reference specific semantic objects—knowing that “this title” is an active target, “quieter” maps to bounded typographic and weight adjustments, and existing hierarchy constraints must be preserved.

## The production system

The production stack was selected to guarantee deterministic latency, edge resilience, and strict transaction safety:

- **Cloudflare Workers** hosts the edge application and transactional API;
- **Cloudflare D1** provides compare-and-swap SQL persistence for project state and an append-only revision history;
- **React 19**, **Vite**, and **Tailwind CSS** power the responsive canvas and design studio;
- **TypeScript** and **Zod** enforce strict closed schemas on all operations, tool receipts, and model envelopes;
- **SQLite** serves as a local persistence engine for fully offline development.

The system separates exploration from consequence. Proposed edits apply immutably to a temporary Exploring branch. The authoritative document advances only when the user explicitly triggers Keep, which executes an atomic D1 compare-and-swap transaction. Undo creates a newer revert revision rather than erasing history, ensuring that both the original change and its recovery remain inspectable.

## The WebMCP integration

WebMCP is most powerful when an application exposes semantic state and authority rather than raw UI clicks. A screenshot cannot tell an agent which object is selected, what operations are permitted by the current design contract, which draft is temporary, or which revision is safe to revert.

Meant registers seven bounded tools on `document.modelContext`:

1. `get_composition_context`: Reads the active composition, selection, current revision, Exploring draft, and recent history.
2. `create_composition_draft`: Starts a deck, poster, or infographic as a reversible Exploring proposal.
3. `preview_composition_turn`: Compiles natural language directions into bounded semantic operations.
4. `preview_composition_change`: Previews strictly validated operations without committing history.
5. `keep_composition_draft`: Requests visible human confirmation to commit the draft.
6. `discard_composition_draft`: Requests visible human confirmation before dropping the Exploring branch.
7. `undo_composition_change`: Requests visible human confirmation for an exact revision-bound revert.

Every surface—typed language, direct touch controls, and WebMCP—convergences on a single shared operation registry. An agent cannot bypass selection, schema validation, revision checks, or human confirmation. Consequential operations (`keep`, `discard`, `undo`) return confirmation requests; only visible person-owned controls perform the action.

## Voice and visual production

The visual identity and presentation were developed through a deterministic media pipeline:

- The editorial interface uses **Instrument Sans** and **Lora** for a restrained, typographic atmosphere that avoids generic AI aesthetic clichés.
- **Remotion** supplied deterministic pacing, framing, captions, and layout transitions for the product film.
- **Google Cloud Text-to-Speech** synthesized clean, continuous narration.
- Product demonstrations were captured directly from the verified application, ensuring that functioning product behavior is accurately represented.

## What the process revealed

The most significant insight from building Meant is that agents do not need special backdoors into application state. When an application provides a well-typed semantic document model and a bounded operation registry, the same primitives that serve direct human manipulation serve browser agents equally well.

Furthermore, making authority explicit improves both usability and safety. When an agent proposes an Exploring draft and asks the person to confirm Keep, the creative loop stays fast and fluid without risking accidental data loss or silent divergence.

## Authorship and tools

Meant was directed and designed by Joshua Lora. OpenAI Codex and Google Antigravity assisted across architecture, implementation, test suites, and documentation. HyperFrames and Remotion supported deterministic composition and media delivery.

For technical details on the component model and security posture, see [ARCHITECTURE.md](ARCHITECTURE.md). For setup and execution, see [README.md](README.md).

