import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true, hmr: false },
});

after(async () => {
  await vite.close();
});

const { actionStyle, controlMetrics, controlsByNodeKind, metricForControl, textStyle } = await vite.ssrLoadModule(
  "/lib/ghosa/control-effects.ts",
);
const { chooseReadableInk, contrastRatio } = await vite.ssrLoadModule(
  "/lib/ghosa/legibility.ts",
);
const { isContextualFollowUp, resolveContextualFollowUp } = await vite.ssrLoadModule(
  "/lib/ghosa/conversation.ts",
);
const { applyOperations, resolveNodeValues, setControlValueOnArtifact } = await vite.ssrLoadModule(
  "/lib/ghosa/intent.ts",
);
const { capabilityManifests, seedArtifacts } = await vite.ssrLoadModule(
  "/lib/ghosa/seed.ts",
);
const {
  directPrimitivesForNode,
  contextualTargetIds,
  actionableLanguage,
  fillCommandsForLanguage,
  fillIntent,
  fillTargetsForLanguage,
  instantLanguageDisposition,
  isReadabilityRequest,
  operationsWouldChange,
  primitiveChangeForLanguage,
  refersToSelectedLayer,
  semanticTargetsForLanguage,
  suggestedOperations,
  GraphicComposition,
  PhotoComposition,
  WebComposition,
} = await vite.ssrLoadModule(
  "/app/studio.tsx",
);

test("plain-language color edits resolve without a model round trip", () => {
  const web = seedArtifacts.find((artifact) => artifact.kind === "web");
  assert.equal(fillIntent("Make the headline blue"), "#2563EB");
  assert.deepEqual(
    fillTargetsForLanguage(web, "Make the headline blue", ["web-copy"]),
    ["web-headline"],
  );
});

test("successive color follow-ups keep the selected text as their referent", () => {
  const web = seedArtifacts.find((artifact) => artifact.kind === "web");
  assert.equal(refersToSelectedLayer("Now make it green"), true);
  assert.equal(refersToSelectedLayer("Change the font color to purple"), true);
  assert.deepEqual(
    contextualTargetIds(web, "Now make it green", "artifact", web.id, ["web-headline"], "fill"),
    ["web-headline"],
  );
  assert.deepEqual(
    contextualTargetIds(web, "Change the font color to purple", "artifact", web.id, ["web-headline"], "fill"),
    ["web-headline"],
  );
});

test("instant language guards prevent accidental edits", () => {
  assert.equal(instantLanguageDisposition("Would blue work better?"), "advice");
  assert.equal(instantLanguageDisposition("Don't make the headline blue"), "preserve");
  assert.equal(instantLanguageDisposition("Keep the current blue unchanged"), "preserve");
  assert.equal(instantLanguageDisposition("Increase the letter spacing"), "unsupported");
  assert.equal(instantLanguageDisposition("Could you make the headline blue?"), "execute");
  assert.equal(instantLanguageDisposition("Would you tell me if blue works better?"), "advice");
  assert.equal(instantLanguageDisposition("Could you keep the current color unchanged?"), "preserve");
  assert.equal(
    instantLanguageDisposition("I can't really read the text against this background. Can you change it?"),
    "execute",
  );
  assert.equal(instantLanguageDisposition("The caption is hard to read. Could you fix it?"), "execute");
  assert.equal(
    actionableLanguage("Make the headline larger but keep the color unchanged"),
    "Make the headline larger",
  );
  assert.equal(
    actionableLanguage("Make the headline warmer without making it louder"),
    "Make the headline warmer",
  );
  assert.equal(
    actionableLanguage("Make the headline larger, but don't change its color"),
    "Make the headline larger",
  );
});

test("readability complaints remain actionable", () => {
  assert.equal(isReadabilityRequest("I can't really read the text against this background. Can you change it?"), true);
  assert.equal(chooseReadableInk([[12, 44, 24], [18, 55, 31]]).fill, "#FFF1D6");
  assert.equal(chooseReadableInk([[248, 183, 71], [255, 205, 92]]).fill, "#3A241C");
  assert.ok(contrastRatio([255, 255, 255], [0, 0, 0]) >= 21);
});

test("short conversational follow-ups inherit the last applied intent but use the new selection", () => {
  const prior = "I can't read this text against the background. Can you change it?";
  assert.equal(isContextualFollowUp("This one too."), true);
  assert.deepEqual(resolveContextualFollowUp("This one too.", prior), {
    kind: "inherited",
    transcript: prior.replace(/\?$/, ""),
  });
  assert.equal(resolveContextualFollowUp("This one too.").kind, "missing_context");
  assert.equal(resolveContextualFollowUp("Make this one blue", prior).kind, "new_instruction");
  assert.deepEqual(resolveContextualFollowUp("Same for the headline", "Make the caption larger."), {
    kind: "inherited",
    transcript: "Make the headline larger",
  });
  assert.equal(
    resolveContextualFollowUp("This one too", "Make the headline blue.").transcript,
    "Make this layer blue",
  );
  assert.deepEqual(primitiveChangeForLanguage(
    resolveContextualFollowUp("This one too", "Change the caption text to Sold out.").transcript,
  ), { primitive: "content", value: "Sold out" });
  assert.equal(
    resolveContextualFollowUp("Same treatment on the headline", "Make the caption larger.").transcript,
    "Make the headline larger",
  );
  assert.equal(
    resolveContextualFollowUp("Do that to the supporting copy", "Make the headline warmer.").transcript,
    "Make the supporting copy warmer",
  );
  assert.equal(
    resolveContextualFollowUp("A little more", "Make the headline larger.").transcript,
    "Make this layer larger",
  );
  assert.match(
    resolveContextualFollowUp("Much more", "Make the headline larger.").transcript,
    /much more pronounced/i,
  );
  assert.equal(
    resolveContextualFollowUp("Dial it back", "Make the headline much larger.").transcript,
    "Make this layer smaller",
  );
  assert.equal(
    resolveContextualFollowUp("Not that much", "Make the background warmer.").transcript,
    "Make this layer cooler",
  );
});

test("specific color names and compound colors remain deterministic", () => {
  assert.equal(fillIntent("Make the headline navy blue"), "#1E3A5F");
  assert.deepEqual(fillCommandsForLanguage("Make the headline blue and the button green"), [
    { transcript: "Make the headline blue", fill: "#2563EB" },
    { transcript: "the button green", fill: "#2F7D4A" },
  ]);
});

test("a selected matching object wins over its siblings", () => {
  const web = seedArtifacts.find((artifact) => artifact.kind === "web");
  assert.deepEqual(
    contextualTargetIds(web, "Make the button blue", "artifact", web.id, ["web-primary-action"], "fill"),
    ["web-primary-action"],
  );
  assert.deepEqual(
    contextualTargetIds(web, "Make the headline and button blue", "artifact", web.id, ["web-primary-action"], "fill"),
    ["web-headline", "web-primary-action", "web-secondary-action"],
  );
  assert.deepEqual(
    contextualTargetIds(web, "Make the button blue", "artifact", web.id, ["web-headline"], "fill"),
    [],
  );
});

test("plain-language content and layout edits resolve to first-class primitives", () => {
  const web = seedArtifacts.find((artifact) => artifact.kind === "web");
  assert.deepEqual(
    primitiveChangeForLanguage('Make the headline say "Fresh joy, shaken daily."'),
    { primitive: "content", value: "Fresh joy, shaken daily." },
  );
  assert.deepEqual(
    primitiveChangeForLanguage("Center the headline"),
    { primitive: "alignment", value: "center" },
  );
  assert.deepEqual(
    primitiveChangeForLanguage("Stack the buttons vertically"),
    { primitive: "direction", value: "column" },
  );
  assert.deepEqual(
    semanticTargetsForLanguage(web, "Stack the buttons vertically", [], "direction"),
    ["web-actions"],
  );
});

test("artifact-level instructions target named layers while project edits stay medium-aware", () => {
  const web = seedArtifacts.find((artifact) => artifact.kind === "web");
  const packet = {
    scope: "artifact",
    anchor: { artifactId: web.id, targetIds: [] },
    voiceEnvelope: { rawTranscript: "Make the headline larger" },
  };
  const artifactOperations = suggestedOperations(packet, seedArtifacts);
  assert.ok(artifactOperations.some((operation) => operation.control === "typeScale"));
  assert.ok(artifactOperations.every((operation) => operation.artifactId === web.id));
  assert.ok(artifactOperations.every((operation) => operation.targetIds.includes("web-headline")));

  const projectOperations = suggestedOperations({ ...packet, scope: "project" }, seedArtifacts);
  assert.ok(projectOperations.some((operation) => operation.artifactId !== web.id));
  assert.equal(projectOperations.some((operation) => operation.artifactId.includes("photo")), false);
});

test("conversational edits resolve through the ontology on every artifact surface", () => {
  const web = seedArtifacts.find((artifact) => artifact.kind === "web");
  const graphic = seedArtifacts.find((artifact) => artifact.kind === "graphic");
  const photo = seedArtifacts.find((artifact) => artifact.kind === "photo");

  assert.deepEqual(
    semanticTargetsForLanguage(web, "Make the location note larger", [], undefined),
    ["web-footer-location"],
  );
  assert.deepEqual(
    semanticTargetsForLanguage(graphic, "Make the availability note easier to read", [], "fill"),
    ["graphic-footer-availability"],
  );
  assert.deepEqual(
    semanticTargetsForLanguage(photo, "Make the photo credit larger", [], undefined),
    ["photo-attribution"],
  );
  assert.deepEqual(
    semanticTargetsForLanguage(photo, "Make the edge vignette softer", [], undefined),
    ["photo-vignette"],
  );
  assert.deepEqual(
    primitiveChangeForLanguage('Change the photo credit text to "Photo: Bobalicious."'),
    { primitive: "content", value: "Photo: Bobalicious." },
  );

  const transferred = resolveContextualFollowUp("Same treatment on the photo credit", "Make the headline larger.");
  const photoOperations = suggestedOperations({
    scope: "artifact",
    anchor: { artifactId: photo.id, targetIds: [] },
    voiceEnvelope: { rawTranscript: "Same treatment on the photo credit", correctedTranscript: transferred.transcript },
  }, seedArtifacts);
  assert.deepEqual(photoOperations.map((operation) => [operation.targetIds, operation.control]), [
    [["photo-attribution"], "typeScale"],
  ]);

  const softened = resolveContextualFollowUp("Dial it back", "Make the subject softer.");
  const subjectOperations = suggestedOperations({
    scope: "artifact",
    anchor: { artifactId: photo.id, targetIds: ["photo-subject"] },
    voiceEnvelope: { rawTranscript: "Dial it back", correctedTranscript: softened.transcript },
  }, seedArtifacts);
  assert.equal(subjectOperations[0].control, "softness");
  assert.ok(subjectOperations[0].value < resolveNodeValues(photo, "photo-subject").softness);
});

test("directional language moves every instant control the intended way", () => {
  const web = seedArtifacts.find((artifact) => artifact.kind === "web");
  const cases = [
    ["Make the design less warm", "warmth"],
    ["Lower the design contrast", "contrast"],
    ["Decrease the design spacing", "spacing"],
    ["Make the design less soft", "softness"],
    ["Make the design less saturated", "saturation"],
  ];
  for (const [transcript, control] of cases) {
    const packet = {
      scope: "artifact",
      anchor: { artifactId: web.id, targetIds: [] },
      voiceEnvelope: { rawTranscript: transcript },
    };
    const operations = suggestedOperations(packet, seedArtifacts);
    assert.equal(operations.length, 1, `${transcript} should map to one adjustment`);
    assert.equal(operations[0].control, control);
    assert.ok(
      operations[0].value < web.values[control],
      `${transcript} should reduce ${control}`,
    );
  }
});

test("plain size language changes size only and boundary no-ops stay terminal", () => {
  const web = seedArtifacts.find((artifact) => artifact.kind === "web");
  const packet = {
    scope: "artifact",
    anchor: { artifactId: web.id, targetIds: ["web-headline"] },
    voiceEnvelope: { rawTranscript: "Make the headline larger" },
  };
  const operations = suggestedOperations(packet, seedArtifacts);
  assert.deepEqual(operations.map((operation) => operation.control), ["typeScale"]);
  assert.equal(operationsWouldChange(operations, seedArtifacts), true);

  const atLimit = artifactWithNodeValue(web, "web-headline", "typeScale", 100);
  const limitOperations = suggestedOperations(packet, [atLimit]);
  assert.equal(operationsWouldChange(limitOperations, [atLimit]), false);
});

const renderers = {
  web: WebComposition,
  graphic: GraphicComposition,
  photo: PhotoComposition,
};

function artifactWithNodeValue(artifact, nodeId, control, value) {
  return {
    ...artifact,
    nodes: artifact.nodes.map((node) =>
      node.id === nodeId
        ? { ...node, values: { ...(node.values ?? {}), [control]: value } }
        : node,
    ),
  };
}

function artifactWithPrimitive(artifact, nodeId, primitive, value) {
  return {
    ...artifact,
    nodes: artifact.nodes.map((node) =>
      node.id === nodeId
        ? { ...node, primitives: { ...(node.primitives ?? {}), [primitive]: value } }
        : node,
    ),
  };
}

function renderArtifact(artifact) {
  const Component = renderers[artifact.kind];
  return renderToStaticMarkup(
    React.createElement(Component, {
      artifact,
      selectedIds: [],
      onSelect: () => {},
      onQuickAdjust: () => {},
    }),
  );
}

test("every layer capability is ontologically relevant and available in its artifact catalog", () => {
  for (const artifact of seedArtifacts) {
    const catalog = new Set(capabilityManifests[artifact.kind].instruments.map((item) => item.id));
    for (const node of artifact.nodes) {
      for (const control of node.capabilities) {
        assert.ok(
          controlsByNodeKind[node.kind].includes(control),
          `${node.id} exposes ${control}, which is not relevant to ${node.kind}`,
        );
        assert.ok(catalog.has(control), `${artifact.kind} catalog hides ${node.id}.${control}`);
      }
    }
  }
});

test("every advertised layer control changes the real rendered artifact in both directions", () => {
  for (const artifact of seedArtifacts) {
    for (const node of artifact.nodes) {
      for (const control of node.capabilities) {
        const lowArtifact = artifactWithNodeValue(artifact, node.id, control, 0);
        const highArtifact = artifactWithNodeValue(artifact, node.id, control, 100);
        const lowValues = resolveNodeValues(lowArtifact, node.id);
        const highValues = resolveNodeValues(highArtifact, node.id);

        assert.notEqual(
          metricForControl(lowValues, control),
          metricForControl(highValues, control),
          `${node.id}.${control} has no bidirectional metric`,
        );
        assert.notEqual(
          renderArtifact(lowArtifact),
          renderArtifact(highArtifact),
          `${node.id}.${control} does not alter the renderer`,
        );
      }
    }
  }
});

test("layer operations remain local and reject unsupported controls", () => {
  const artifact = seedArtifacts.find((item) => item.kind === "web");
  const targetId = "web-headline";
  const beforeTarget = resolveNodeValues(artifact, targetId);
  const beforeSibling = resolveNodeValues(artifact, "web-supporting-copy");
  const changed = applyOperations([artifact], [{
    artifactId: artifact.id,
    targetIds: [targetId],
    control: "typeScale",
    value: beforeTarget.typeScale >= 50 ? 0 : 100,
  }])[0];

  assert.notEqual(resolveNodeValues(changed, targetId).typeScale, beforeTarget.typeScale);
  assert.equal(resolveNodeValues(changed, "web-supporting-copy").typeScale, beforeSibling.typeScale);

  const rejected = applyOperations([artifact], [{
    artifactId: artifact.id,
    targetIds: [targetId],
    control: "cropScale",
    value: 100,
  }])[0];
  assert.equal(resolveNodeValues(rejected, targetId).cropScale, beforeTarget.cropScale);
  assert.equal(rejected.version, artifact.version);
});

test("parent and artifact controls clear only conflicting descendant overrides", () => {
  const web = seedArtifacts.find((item) => item.kind === "web");
  const withChildOverrides = {
    ...web,
    nodes: web.nodes.map((node) =>
      ["web-headline", "web-supporting-copy"].includes(node.id)
        ? { ...node, values: { ...(node.values ?? {}), typeScale: 100, contrast: 10 } }
        : node,
    ),
  };

  const groupAdjusted = setControlValueOnArtifact(withChildOverrides, ["web-copy"], "typeScale", 20);
  assert.equal(resolveNodeValues(groupAdjusted, "web-headline").typeScale, 20);
  assert.equal(resolveNodeValues(groupAdjusted, "web-supporting-copy").typeScale, 20);
  assert.equal(resolveNodeValues(groupAdjusted, "web-headline").contrast, 10);
  assert.equal(groupAdjusted.nodes.find((node) => node.id === "web-headline").values.typeScale, undefined);

  const artifactAdjusted = setControlValueOnArtifact(withChildOverrides, [], "contrast", 80);
  assert.equal(resolveNodeValues(artifactAdjusted, "web-headline").contrast, 80);
  assert.equal(resolveNodeValues(artifactAdjusted, "web-supporting-copy").contrast, 80);
  assert.equal(artifactAdjusted.nodes.find((node) => node.id === "web-headline").values.typeScale, 100);
});

test("hierarchy presets create an unmistakable visual range", () => {
  const lowValues = { ...seedArtifacts[0].values, focalStrength: 20 };
  const balancedValues = { ...seedArtifacts[0].values, focalStrength: 50 };
  const highValues = { ...seedArtifacts[0].values, focalStrength: 85 };

  assert.ok(controlMetrics(highValues).focalScale - controlMetrics(lowValues).focalScale >= 0.29);
  assert.ok(Number(textStyle(highValues, 20).fontWeight) - Number(textStyle(lowValues, 20).fontWeight) >= 300);
  assert.notEqual(textStyle(lowValues, 20).fontSize, textStyle(balancedValues, 20).fontSize);
  assert.notEqual(textStyle(balancedValues, 20).fontSize, textStyle(highValues, 20).fontSize);
  assert.notEqual(actionStyle(lowValues, "primary").transform, actionStyle(highValues, "primary").transform);
});

test("every exposed direct primitive changes its real renderer", () => {
  const endpoints = {
    content: ["First version", "Second version"],
    fill: ["#123456", "#fedcba"],
    direction: ["row", "column"],
    alignment: ["start", "end"],
  };
  for (const artifact of seedArtifacts) {
    for (const node of artifact.nodes) {
      for (const primitive of directPrimitivesForNode(node)) {
        const [low, high] = endpoints[primitive];
        assert.notEqual(
          renderArtifact(artifactWithPrimitive(artifact, node.id, primitive, low)),
          renderArtifact(artifactWithPrimitive(artifact, node.id, primitive, high)),
          `${node.id}.${primitive} does not alter the renderer`,
        );
      }
    }
  }
});
