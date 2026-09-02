# Meant — WebMCP Challenge submission

**Tagline:** A conversational creative editor where agents propose, people decide, and consequence stays inspectable.

## Inspiration

Creative direction begins as meaning: make the title quieter, give the page more room, or make the story feel more grounded. Conventional design software asks people to translate that intention into layers, coordinates, panels, and property names before they can judge the result.

An agent can remove some of that translation burden, but only if it understands more than pixels. It needs to know which semantic object is selected, what operations are valid, whether a direction is temporary, which revision is authoritative, and what exact change can be undone.

We built Meant to make that relationship legible. The person directs the work in ordinary language. The agent inspects the composition and proposes a bounded change. The kept artifact changes only through an explicit, visible human decision.

## What it does

Meant turns an ordinary-language brief into a structured deck, poster, or infographic that remains visible, selectable, and editable inside the application.

Every proposal begins as **Exploring**, leaving the kept document and durable revision unchanged. **Compare** names the kept and Exploring versions. **Discard** removes only the temporary direction. A visible human **Keep** creates the next durable revision. **Undo** restores the earlier artifact as a newer revert revision, preserving both events in **History**.

Text and direct controls provide a complete working path. The code also contains an OpenAI Realtime WebRTC integration that maps voice conversation to the same bounded tools when an entitled session is configured. The live audio round trip remains unverified and is not presented as submission evidence.

## Why WebMCP is a strong fit

The most important state in a creative workspace is not visible in a screenshot. It includes the document structure, active selection, allowed operations, design contract, current Exploring draft, authoritative revision, and exact change eligible for recovery.

Meant exposes that state through seven WebMCP tools registered on the page:

1. `get_composition_context` reads a compact, revision-aware summary of the active composition.
2. `create_composition_draft` starts a deck, poster, or infographic as an Exploring proposal.
3. `preview_composition_turn` interprets one ordinary-language direction through the bounded operation registry.
4. `preview_composition_change` previews strictly validated semantic operations without committing history.
5. `keep_composition_draft` requests that the person confirm the exact draft with the visible Keep control.
6. `discard_composition_draft` requests visible human confirmation before removing the Exploring draft.
7. `undo_composition_change` requests visible human confirmation for an exact, revision-bound revert.

WebMCP lets the agent collaborate through meaning and explicit authority instead of guessing through screenshots or receiving a private shortcut around the product’s rules.

## What people and agents can do together now

Before WebMCP, an external browser agent could see approximate interface pixels and simulate clicks, but it could not reliably know whether a title was the selected semantic object, whether a preview was temporary, whether another view had advanced the revision, or which historical change was safe to undo.

With Meant, the agent can inspect the current semantic context, create or refine an Exploring direction, and hand the consequential choice back to the person. The person can compare the proposal with the kept artifact, then Keep, Discard, or Undo through visible controls.

## How we built it

Meant stores each artifact as a composition document with stable frames, semantic nodes, layout modes, bounded style primitives, and an artifact-specific design contract.

Strict WebMCP schemas reject unknown fields and constrain text, geometry, style values, operation counts, and output size. Every edit compiles into the same operation registry used by the visible product. Preview operations apply immutably to an Exploring branch. Keep rebinds the proposed operations to the authoritative server document and commits the updated project plus History through a D1 compare-and-swap transaction. Undo targets one exact eligible commit and creates a newer revert revision rather than deleting history.

## Challenges

The hardest engineering problem was preserving creative flow without weakening state guarantees. Conversation feels fluid; durable work must be exact. We solved that tension with a visible Exploring branch, deterministic operations, explicit human confirmation, revision-bound persistence, and undo-as-history.

The second challenge was making agent authority honest. A tool named Keep can imply that an agent committed work. In the final contract, agent-side Keep, Discard, and Undo are requests for visible human confirmation.

The third challenge was concurrency and ambiguous network outcomes. Meant uses compare-and-swap, conflict states, authoritative History reconciliation, and exact operation identities so it can recover without duplicating a change or claiming success prematurely.

## Accomplishments

- Seven bounded WebMCP tools registered and exercised through a native browser-agent capability.
- A real structured artifact that changes inside the application.
- An explicit Exploring branch with legible Compare, Keep, and Discard states.
- Agent-side consequence requests that preserve the person’s final authority.
- Revision-bound D1 persistence with conflict protection and response-loss reconciliation.
- Undo that creates a newer revert revision and retains the original change in History.
- Desktop and mobile flows that keep the canvas, revision, and draft status visible.
- A final evidence chain built from real product stills and clips.

## What we learned

WebMCP is most useful when a page exposes meaning and authority—not simply more buttons. The important primitive is not “let the agent click Keep.” It is “let the agent understand the document, propose a bounded change, and return the consequential decision to the person.”

## What is next

We want to deepen the composition system with reusable brand contracts, richer visual primitives, multi-artifact campaigns, collaborative review, export paths, and team-authored templates. The contract stays the same: the work remains visible, proposals remain reversible, and authorship stays with the person directing it.

## Links

- Live project: `https://meant.protoperfect.io/`
- Public source: `https://github.com/shifujosh/meant-webmcp`
- Public demo video: `https://youtu.be/gMgNfCyZ7oE`
- Devpost entry: `https://devpost.com/software/meant`
- Protoperfect Labs case study: `https://protoperfect.io/research/meant-intention-made-editable`
- Launch thread: `https://x.com/protoperfect/status/2095284116031742293`
