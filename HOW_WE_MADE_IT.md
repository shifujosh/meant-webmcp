# How we made Meant

Meant began with a simple observation: people describe creative outcomes fluently, but creative software makes them translate those outcomes into mechanics before they can see whether an idea works.

We built Meant around the opposite sequence. The person states intent. The product renders a real structured artifact. The person and agent shape that artifact together. The person decides what becomes durable.

## 1. We made meaning addressable

The editor stores decks, posters, and infographics as composition documents with stable frames, semantic nodes, bounded style primitives, layout modes, and artifact-specific design contracts.

That structure lets the system understand that “this title” is a specific selected object, that “quieter” is a bounded direction, and that “keep everything else unchanged” is a preservation constraint—not decorative prompt text.

## 2. We gave every surface one command path

Text, touch, WebMCP, and the optional Realtime voice integration converge on the same operation registry. Surface-specific requests normalize into deterministic operations with stable identities and exact before/after values.

This matters because an agent should not get a private shortcut around the product. The page tools can inspect context and create or refine an Exploring draft, but the same schema, capability, revision, and persistence rules apply everywhere.

## 3. We separated exploration from consequence

Conversation should feel fluid. Durable work must remain exact.

Meant solves that tension with an explicit Exploring branch:

- preview operations apply immutably to the temporary branch;
- the kept document remains available for Compare and Discard;
- Keep rebinds the proposed operations to the authoritative document and revalidates them sequentially;
- D1 commits the project and History atomically with compare-and-swap protection; and
- Undo creates a newer revert revision instead of erasing the original event.

Agent-side Keep, Discard, and Undo tools request confirmation. Only the visible controls perform those consequential actions.

## 4. We tested truth, not just the happy path

The verification suite covers malformed operations, unsupported targets, stale drafts, same-value changes, interrupted responses, first-use bootstrap races, simultaneous Keeps, bounded tool receipts, identity isolation, responsive behavior, and exact recovery.

The final application snapshot passes 152 automated cases and a zero-advisory dependency audit. A separate real-browser/D1 run exercises the complete Exploring → Compare → Keep → reload → Undo → History loop, including two actual concurrency races.

## 5. We designed the submission as evidence

The film uses a hybrid visual system:

- static editorial slides explain the problem and product model clearly;
- real product captures prove every functioning state;
- Remotion supplies deterministic pacing, framing, captions, and transitions; and
- a continuous Google Cloud Text-to-Speech narration delivers the story with a coherent tempo.

Generated product imagery never stands in for working functionality. The deck, film, contact sheets, thumbnail, captions, and short product clips in this repository all trace back to the verified application or the locked Meant visual system.

## The result

Meant is not a chatbot wrapped around a canvas. It is a creative editor whose canvas and tools are legible to both people and agents.

The outcome is less translation, faster exploration, safer experimentation, and a clear boundary between what an agent proposes and what a person chooses to keep.
