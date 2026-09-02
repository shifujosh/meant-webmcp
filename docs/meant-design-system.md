# Meant — The Working Proof

This document is an implementation reference for Meant's public visual and verbal design system. The workspace-root `Design.md` is the locked source of truth. GHOSA remains private expression and intent infrastructure and must not appear as a public product identity.

## Brand promise

**Make what you mean.**

Meant is an opinionated design environment where a person's intent becomes precise, editable visual form. It should feel decisive, warm, legible, accessible, tactile, modern, and slightly irreverent.

## Core palette

| Token | Value | Use |
| --- | --- | --- |
| Paper | `#F3EFE5` | Primary workspace |
| Chalk | `#FFFCF5` | Elevated sheets and controls |
| Carbon | `#191816` | Primary type and dark surfaces |
| Graphite | `#666158` | Supporting type |
| Proof | `#F04B32` | Selection, action, and applied changes |
| Marker | `#F1D64B` | Sparse emphasis and guidance |

Client artifacts retain their own brand grammar. Meant's palette belongs only to the operating environment.

## Typography

- **Instrument Sans:** interface, controls, labels, and body copy.
- **Lora, roman styles:** supporting editorial statements, proof-sheet headings, and design guidance.
- UI body copy should normally be at least 15–16px.
- Use sentence case. Avoid tiny status labels and technical all-caps pills.

## Identity

- Use the supplied custom m-dot asset; do not substitute a typeset `m`.
- On light surfaces use `meant-mdot-master.svg`; on dark surfaces use `meant-mdot-reversed.svg`.
- The proof dot remains Proof coral. It is not a notification badge.
- The final app icon is the Carbon square with Chalk `m` and the Proof-coral dot.
- Archived folded-plane, aperture-letter, cell-grid, voice-notch, and hidden-letter studies are not secondary logos.

## Geometry and materials

- Warm paper surfaces, crisp one-pixel rules, and restrained print-like shadows.
- Corner radii: 0–4px for controls; 6–9px for floating sheets.
- Use editorial sheets and paper tabs, not glass panels or pill-heavy cards.
- Selected objects use exactly two Proof crop brackets—top-left and bottom-right—never a glow.
- Surface or composition framing uses the same diagonal aperture: one top-left corner and one bottom-right corner.
- The toolbar exposes the smallest useful decision while the artifact remains visible.

## Motion

- Fast and tactile: 120–200ms for controls and 240–320ms for sheets.
- Panels move like paper entering the work surface.
- A durable Keep may briefly draw a Proof outline around the canvas.
- Do not use shimmer, ambient glow, radial pulses, or ornamental AI animation.

## Voice

Meant speaks like a confident design partner.

- “What do you want to change?”
- “Exploring a reversible direction.”
- “Kept. Revision 2.”
- “Try another direction.”

Do not expose internal terms such as Expression Packet, Authority Envelope, WebMCP, capability, confidence, or model reasoning.

## State language

- **Exploring** is temporary and uses Marker yellow.
- **Compare** names both the kept and Exploring versions.
- **Keep** requires explicit human acceptance and durable shared persistence.
- **Discard** removes only the temporary direction and is neutral, not destructive.
- **Undo** adds a revert revision. It never erases history.
- **History** preserves every kept direction and revert.

## Explicit exclusions

- No blue-violet intelligence palette.
- No waveform, glowing orb, or concentric-circle identity motifs.
- No glassmorphism, gradients, chrome, cyber HUDs, or oversized rounded SaaS cards.
- No visible GHOSA branding in Meant's public interface.
- No silent restyling of Bobalicious or other client brands.

## Architecture boundary

- Public UI, metadata, client persistence, component classes, and visual tokens use Meant naming.
- GHOSA naming is reserved for private modules under `lib/ghosa`, internal model instructions, compatibility migrations, and diagnostic logging.
- The production build runs `scripts/check-brand-boundary.mjs` and fails when a GHOSA token, public-facing GHOSA string, or legacy cool/violet palette value re-enters a Meant surface.
