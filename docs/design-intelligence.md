# Design Intelligence

Meant treats design intelligence as three related but distinct systems:

- **Craft** is the quality floor: composition, typography, interaction, accessibility, motion, edit locality, and production integrity.
- **Context** determines which craft matters most for the medium and job. A landing page, social graphic, and photo treatment should not receive the same literal edit.
- **Taste** is the project's character: preferences, protected qualities, rejected patterns, and brand invariants that make a technically correct result feel specific.

The operating loop is:

`expression → context classification → smallest relevant craft skills → character move → editable execution → quality bar → visual verification`

## Semantic grounding

Design intelligence is only as precise as the object model underneath it. Meant therefore treats every meaningful visible object—small text, actions, images, shapes, masks, effects, and brand decorations—as a first-class semantic node with a type, purpose, parent, editable fields, and capability boundary.

The canvas, layer tree, expression scope, and contextual controls must always resolve to the same node. Selection prefers the most specific object under the pointer; it never silently routes unmapped content to a misleading frame or hero parent. Parent groups preserve compositional reasoning, while child nodes preserve edit locality.

Floating panels do not alter artifact coordinates. They define a temporary safe viewport: the camera may move just enough to reveal the selected node, and closing the panel preserves that camera position.

## Control truth

Controls are part of the ontology, not a generic toolbar. A control is shown only when the selected semantic node declares that capability, the artifact manifest names it in human terms, and the renderer binds it to a visible property. Text exposes type, hierarchy, spacing, contrast, and brand color; images expose crop, focus, temperature, contrast, saturation, and softness; actions expose shape, padding, type, contrast, color, and prominence; effects expose only the properties the effect can actually render.

Every retained control must work in both directions and keep its edit local to the selected node. Meant verifies the low and high ends of every declared layer/control pair against the real renderer so an inert or misrouted control fails the control contract before deployment.

## Core design principles

### Sketches should become programmable design evidence

Alex Semochkin's [sketch-to-graphic workflow](https://x.com/semochkin_alex/status/2091815761044029800) demonstrates the value of using a rough spatial reference to drive a custom graphic. Meant treats a sketch as property-scoped evidence for geometry or composition. It does not silently inherit unrelated color, copy, or brand decisions, and it prefers an editable programmable result over a flattened imitation.

### Motion is a grammar, not decoration

SubhanHQ's [Motion Anime collection](https://x.com/SubhanHQ/status/2091159458693194045) and the shared-token approach documented by [Motion UI](https://motion.dev/ui) point to a reusable motion language. Meant routes temporal work through five semantic tempos—`snap`, `ui`, `gentle`, `lively`, and `ambient`—plus tight/base/relaxed stagger and a calm reduced-motion equivalent. A proposal must name the purpose, states, token, and fallback.

### Route the smallest useful design skill

Tran Mau Tri Tam's [UI Skills recommendation](https://x.com/tranmautritam/status/2091087584781095273), [UI Skills](https://www.ui-skills.com/), and [UI Craft](https://github.com/educlopez/ui-craft) reinforce that agents benefit from explicit craft knowledge and an acceptance bar rather than a single aesthetic super-prompt. Meant selects one to three craft lenses appropriate to the diagnosis and turns their checks into concrete success criteria.

### Let the agent absorb complexity while the person directs

The [GrowAIHub workflow reference](https://x.com/GrowAIHub/status/2092234390332194995) emphasizes an agent handling complicated production steps so the creator can stay with the idea. Meant keeps planning, capability routing, validation, and provenance behind one direct Apply action while keeping the proposed change and protected constraints inspectable.

### Design systems should travel with the work

Tuture's [Open Design reference](https://x.com/tuturetom/status/2051203959142895896) and [agent-readable design systems](https://open-design.ai/plugins/systems/) show the value of a portable, versioned design grammar. Meant's project profile carries its brand grammar, taste profile, craft library, medium contexts, motion vocabulary, representation policy, and quality bar together.

## Representation policy

Meant prefers execution in this order:

1. **Structured** — semantic layers, components, tokens, vectors, and layout operations.
2. **Programmable** — editable coded graphics when a custom visual system is needed.
3. **Generative** — bounded raster, photographic, illustrative, or temporal assets.

Generative output belongs inside replaceable, masked, provenance-linked layers. It should not flatten structured work merely because a model can imitate the appearance.

## Acceptance bar

A proposal is not design-ready merely because it is valid JSON or successfully applied. It should:

- solve the expressed problem with the smallest coherent change;
- preserve stated constraints and neighboring layers;
- work at the artifact's real output size;
- remain specific to the client brand and medium;
- preserve editable structure and accessible interaction;
- expose anything that still requires rendered visual or temporal judgment.

Meant must never mark an unrendered visual condition as passed. The current executor can plan those checks; a screenshot-aware critic remains the next step required to close the loop.
