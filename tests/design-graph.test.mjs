import assert from "node:assert/strict";
import test, { after } from "node:test";
import { fileURLToPath } from "node:url";

import { createServer } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));
const vite = await createServer({
  appType: "custom",
  configFile: false,
  root,
  resolve: { alias: { "@": root } },
  server: { middlewareMode: true, hmr: false },
});

after(async () => vite.close());

const {
  appliedOperationsForChange,
  buildInterpretationGraph,
  designConcepts,
  designRelations,
  interpretationNeedsSemanticRecall,
  mergeInterpretationGraphs,
  normalizeDesignOperations,
  operationConflictsWithGraphConstraints,
  operationEvidenceForGraph,
  protectedControlsForGraph,
} = await vite.ssrLoadModule(
  "/lib/ghosa/design-graph.ts",
);
const { projectAfterUndo } = await vite.ssrLoadModule("/lib/ghosa/project-state.ts");
const { seedProject } = await vite.ssrLoadModule("/lib/ghosa/seed.ts");

const web = seedProject.artifacts.find((artifact) => artifact.kind === "web");
const photo = seedProject.artifacts.find((artifact) => artifact.kind === "photo");

test("the design graph has typed concepts and relational depth", () => {
  assert.ok(designConcepts.length >= 30);
  assert.ok(designRelations.length >= 40);
  assert.ok(designRelations.some((edge) => edge.from === "warmth" && edge.to === "material-texture"));
  assert.ok(designRelations.some((edge) => edge.relation === "conflicts_with"));
});

test("language operators remain explicit when design meanings are retrieved", () => {
  const graph = buildInterpretationGraph({
    transcript: "Make it feel warmer but not more playful. Keep the layout and brand palette intact.",
    artifact: web,
    targetIds: [],
    targetNames: [web.name],
    profile: seedProject.designIntelligence,
  });

  assert.equal(graph.retrievalMode, "graph");
  assert.ok(graph.signals.some((signal) => signal.conceptId === "warmth"));
  assert.ok(graph.signals.some((signal) => signal.conceptId === "playfulness" && signal.operator === "exclude"));
  assert.ok(graph.paths.some((path) => path.sourceConceptId === "warmth" && path.targetConceptId === "palette-warmth"));
  assert.ok(graph.constraints.some((constraint) => constraint.kind === "explicit_preserve" && /layout/i.test(constraint.label)));
  assert.ok(graph.constraints.some((constraint) => constraint.kind === "brand"));
});

test("premium, luxury, friendliness, and bubbly remain distinct concepts", () => {
  const graph = buildInterpretationGraph({
    transcript: "Make it more premium but not luxury. Keep it friendly and make it less bubbly.",
    artifact: web,
    targetIds: [],
    targetNames: [web.name],
    profile: seedProject.designIntelligence,
  });

  assert.ok(graph.signals.some((signal) => signal.conceptId === "premium" && signal.operator === "increase"));
  assert.ok(graph.signals.some((signal) => signal.conceptId === "luxury" && signal.operator === "exclude"));
  assert.ok(graph.signals.some((signal) => signal.conceptId === "friendliness" && signal.operator === "preserve"));
  assert.ok(graph.signals.some((signal) => signal.conceptId === "bubbliness" && signal.operator === "decrease"));
  assert.ok(graph.paths.some((path) => path.sourceConceptId === "premium" && path.targetConceptId === "disciplined-type"));
});

test("artifact grounding filters out unavailable visual realizations", () => {
  const graph = buildInterpretationGraph({
    transcript: "Make the photograph warmer and more intimate.",
    artifact: photo,
    targetIds: ["photo-image"],
    targetNames: ["Milk tea photograph"],
    profile: seedProject.designIntelligence,
  });

  assert.deepEqual(graph.groundings[0].targetIds, ["photo-image"]);
  assert.ok(graph.paths.some((path) => path.targetConceptId === "image-intimacy"));
  assert.equal(graph.paths.some((path) => path.targetConceptId === "humanist-type"), false);
  assert.ok(graph.paths.every((path) => path.controls.every((control) => graph.groundings[0].availableControls.includes(control))));
});

test("semantic similarity can recall a concept without becoming authority", () => {
  const graph = buildInterpretationGraph({
    transcript: "Give this a more publication-led point of view.",
    artifact: web,
    targetIds: [],
    targetNames: [web.name],
    profile: seedProject.designIntelligence,
    semanticScores: { editorial: .91, luxury: .22 },
  });

  assert.equal(graph.retrievalMode, "hybrid");
  assert.ok(graph.signals.some((signal) => signal.conceptId === "editorial"));
  assert.ok(graph.paths.some((path) => path.sourceConceptId === "editorial" && path.targetConceptId === "disciplined-type"));
  assert.ok(graph.signals.filter((signal) => signal.conceptId === "editorial").every((signal) => signal.grounded === false));
  assert.ok(graph.paths.filter((path) => path.sourceConceptId === "editorial").every((path) => path.grounded === false));
});

test("coordinated exclusions and preservation keep their clause polarity", () => {
  const cases = [
    {
      transcript: "Make the campaign cleaner without making it sparse or sterile.",
      expected: [["cleanliness", "request"], ["sparseness", "exclude"], ["sterility", "exclude"]],
    },
    {
      transcript: "Make it premium rather than luxury.",
      expected: [["premium", "request"], ["luxury", "exclude"]],
    },
    {
      transcript: "Less bubbly while keeping it friendly.",
      expected: [["bubbliness", "decrease"], ["friendliness", "preserve"]],
    },
    {
      transcript: "Don't make it warmer or more playful.",
      expected: [["warmth", "exclude"], ["playfulness", "exclude"]],
    },
    {
      transcript: "Keep it warm and clean.",
      expected: [["warmth", "preserve"], ["cleanliness", "preserve"]],
    },
  ];

  for (const item of cases) {
    const graph = buildInterpretationGraph({
      transcript: item.transcript,
      artifact: web,
      targetIds: [],
      targetNames: [web.name],
      profile: seedProject.designIntelligence,
    });
    for (const [conceptId, operator] of item.expected) {
      assert.ok(
        graph.signals.some((signal) => signal.conceptId === conceptId && signal.operator === operator),
        `${item.transcript} should map ${conceptId} to ${operator}`,
      );
    }
    assert.doesNotMatch(graph.reading.split(";")[0], /sterility/i);
  }
});

test("inverse relations compile an explicit effect direction", () => {
  const graph = buildInterpretationGraph({
    transcript: "Make it less sterile.",
    artifact: web,
    targetIds: [],
    targetNames: [web.name],
    profile: seedProject.designIntelligence,
  });
  assert.ok(graph.paths.some((path) =>
    path.sourceConceptId === "sterility" &&
    path.targetConceptId === "material-texture" &&
    path.relation === "conflicts_with" &&
    path.effect === "increase"
  ));
  assert.match(graph.reading, /reduce sterility/i);
});

test("project scope can preserve one reading with medium-specific groundings", () => {
  const graphs = seedProject.artifacts.map((artifact) => buildInterpretationGraph({
    transcript: "Make the campaign warmer and more editorial.",
    artifact,
    targetIds: [],
    targetNames: [artifact.name],
    profile: seedProject.designIntelligence,
  }));
  const merged = mergeInterpretationGraphs(graphs);
  assert.equal(merged.groundings.length, 3);
  assert.deepEqual(new Set(merged.groundings.map((grounding) => grounding.artifactKind)), new Set(["web", "graphic", "photo"]));
  assert.ok(merged.paths.some((path) => path.artifactKind === "web"));
  assert.ok(merged.paths.some((path) => path.artifactKind === "photo"));
  assert.equal(merged.paths.some((path) => path.artifactKind === "photo" && path.targetConceptId === "disciplined-type"), false);
});

test("only grounded paths compatible with applied operation direction become visible evidence", () => {
  const graph = buildInterpretationGraph({
    transcript: "Make it warmer but not more playful.",
    artifact: web,
    targetIds: [],
    targetNames: [web.name],
    profile: seedProject.designIntelligence,
  });
  const result = operationEvidenceForGraph(graph, [{
    artifactId: web.id,
    targetIds: [],
    control: "warmth",
    value: Math.min(100, web.values.warmth + 12),
  }], seedProject.artifacts);

  assert.equal(result.operationEvidence.length, 1);
  const selected = graph.paths.find((path) => path.id === result.selectedPathIds[0]);
  assert.equal(selected.sourceConceptId, "warmth");
  assert.equal(selected.targetConceptId, "palette-warmth");
  assert.equal(selected.effect, "increase");
  assert.equal(result.selectedPathIds.some((id) => id.includes("playfulness")), false);
});

test("semantic-only hypotheses cannot become displayed operation evidence", () => {
  const graph = buildInterpretationGraph({
    transcript: "Give this a more publication-led point of view.",
    artifact: web,
    targetIds: [],
    targetNames: [web.name],
    profile: seedProject.designIntelligence,
    semanticScores: { editorial: .91 },
  });
  const result = operationEvidenceForGraph(graph, [{
    artifactId: web.id,
    targetIds: [],
    control: "typeScale",
    value: Math.min(100, web.values.typeScale + 10),
  }], seedProject.artifacts);
  assert.deepEqual(result.operationEvidence, []);
  assert.deepEqual(result.selectedPathIds, []);
});

test("concrete preservation constraints block conflicting operations and evidence", () => {
  const cases = [
    { transcript: "Make it warmer without changing the colors.", control: "warmth" },
    { transcript: "Make it more premium without changing typography.", control: "typeScale" },
    { transcript: "Make it cleaner without changing spacing.", control: "spacing" },
  ];

  for (const [index, item] of cases.entries()) {
    const graph = buildInterpretationGraph({
      transcript: item.transcript,
      artifact: web,
      targetIds: [],
      targetNames: [web.name],
      profile: seedProject.designIntelligence,
    });
    const operation = {
      artifactId: web.id,
      targetIds: [],
      control: item.control,
      value: Math.min(100, web.values[item.control] + 10 + index),
    };
    assert.ok(protectedControlsForGraph(graph).has(item.control), `${item.transcript} should protect ${item.control}`);
    assert.equal(operationConflictsWithGraphConstraints(graph, operation), true);
    assert.deepEqual(operationEvidenceForGraph(graph, [operation], seedProject.artifacts).operationEvidence, []);
  }
});

test("preservation idioms and bubbly language retain distinct intent", () => {
  const graph = buildInterpretationGraph({
    transcript: "Keep it playful but make it less bubbly without losing friendliness.",
    artifact: web,
    targetIds: [],
    targetNames: [web.name],
    profile: seedProject.designIntelligence,
  });
  assert.ok(graph.signals.some((signal) => signal.conceptId === "playfulness" && signal.operator === "preserve"));
  assert.ok(graph.signals.some((signal) => signal.conceptId === "bubbliness" && signal.operator === "decrease"));
  assert.ok(graph.signals.some((signal) => signal.conceptId === "friendliness" && signal.operator === "preserve"));
});

test("a preserved secondary concept does not suppress recall for an unmatched primary goal", () => {
  const graph = buildInterpretationGraph({
    transcript: "Make it publication-led while preserving friendliness.",
    artifact: web,
    targetIds: [],
    targetNames: [web.name],
    profile: seedProject.designIntelligence,
  });
  assert.equal(interpretationNeedsSemanticRecall(graph), true);
});

test("applied change records retain stable operation IDs and exact before/after values", () => {
  const operation = {
    artifactId: web.id,
    targetIds: ["web-headline"],
    control: "typeScale",
    value: 84,
  };
  const after = seedProject.artifacts.map((artifact) => artifact.id === web.id
    ? {
        ...artifact,
        nodes: artifact.nodes.map((node) => node.id === "web-headline"
          ? { ...node, values: { ...(node.values ?? {}), typeScale: 84 } }
          : node),
      }
    : artifact);
  const [record] = appliedOperationsForChange(seedProject.artifacts, after, [operation]);
  assert.match(record.id, /web-headline:typeScale:1$/);
  assert.notEqual(record.beforeValues[0].value, record.afterValues[0].value);
  assert.equal(record.afterValues[0].value, 84);

  const evidenceGraph = buildInterpretationGraph({
    transcript: "Make it more premium.",
    artifact: web,
    targetIds: ["web-headline"],
    targetNames: ["Campaign headline"],
    profile: seedProject.designIntelligence,
  });
  const evidence = operationEvidenceForGraph(evidenceGraph, [operation], seedProject.artifacts);
  assert.equal(evidence.operationEvidence[0]?.operationId, record.id);
});

test("mixed multi-target direction cannot be certified by one semantic path", () => {
  const mixedWeb = {
    ...web,
    nodes: web.nodes.map((node) => node.id === "web-headline"
      ? { ...node, values: { ...(node.values ?? {}), typeScale: 20 } }
      : node.id === "web-supporting-copy"
        ? { ...node, values: { ...(node.values ?? {}), typeScale: 80 } }
        : node),
  };
  const graph = buildInterpretationGraph({
    transcript: "Make it more premium.",
    artifact: mixedWeb,
    targetIds: ["web-headline", "web-supporting-copy"],
    targetNames: ["Campaign headline", "Supporting copy"],
    profile: seedProject.designIntelligence,
  });
  const result = operationEvidenceForGraph(graph, [{
    artifactId: mixedWeb.id,
    targetIds: ["web-headline", "web-supporting-copy"],
    control: "typeScale",
    value: 50,
  }], [mixedWeb]);
  assert.deepEqual(result.operationEvidence, []);
});

test("structural preservation protects layout, composition, structure, and hierarchy controls", () => {
  const cases = [
    {
      transcript: "Make it feel warmer but not more playful. Keep the layout and brand palette intact.",
      controls: ["spacing", "typeScale", "focalStrength", "cropScale", "warmth", "saturation", "accentStrength"],
    },
    { transcript: "Keep the composition unchanged.", controls: ["spacing", "typeScale", "focalStrength", "cropScale"] },
    { transcript: "Without changing the structure.", controls: ["spacing", "typeScale", "focalStrength", "cropScale"] },
    { transcript: "Preserving the hierarchy.", controls: ["typeScale", "focalStrength", "contrast", "spacing"] },
    { transcript: "Do not change the layout.", controls: ["spacing", "typeScale", "focalStrength", "cropScale"] },
    { transcript: "Don't change the composition.", controls: ["spacing", "typeScale", "focalStrength", "cropScale"] },
    { transcript: "Do not change the reading order.", controls: ["typeScale", "focalStrength", "contrast", "spacing"] },
  ];
  for (const item of cases) {
    const graph = buildInterpretationGraph({
      transcript: item.transcript,
      artifact: web,
      targetIds: [],
      targetNames: [web.name],
      profile: seedProject.designIntelligence,
    });
    const protectedControls = protectedControlsForGraph(graph);
    for (const control of item.controls) {
      assert.ok(protectedControls.has(control), `${item.transcript} should protect ${control}`);
    }
  }

  const exclusion = buildInterpretationGraph({
    transcript: "Don't make it playful.",
    artifact: web,
    targetIds: [],
    targetNames: [web.name],
    profile: seedProject.designIntelligence,
  });
  assert.ok(exclusion.signals.some((signal) => signal.conceptId === "playfulness" && signal.operator === "exclude"));
  assert.equal(exclusion.constraints.some((constraint) => constraint.kind === "explicit_preserve"), false);
});

test("duplicate operations normalize to the final exact value", () => {
  const operations = [60, 80].map((value) => ({
    artifactId: web.id,
    targetIds: ["web-headline"],
    control: "typeScale",
    value,
  }));
  const normalized = normalizeDesignOperations(operations);
  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].value, 80);
});

test("undo restores artifacts and invalidates the applied semantic record atomically", () => {
  const expressionPacketId = "expression-undo-proof";
  const appliedChangeId = "change-undo-proof";
  const changedArtifacts = seedProject.artifacts.map((artifact) => artifact.id === web.id
    ? { ...artifact, values: { ...artifact.values, warmth: artifact.values.warmth + 10 } }
    : artifact);
  const current = {
    ...seedProject,
    artifacts: changedArtifacts,
    expressionPackets: [{ id: expressionPacketId, status: "applied" }],
    latestAppliedChange: {
      id: appliedChangeId,
      expressionPacketId,
      summary: "Warmer treatment",
      appliedAt: new Date().toISOString(),
      operations: [],
    },
    latestDesignPlan: {},
    latestDesignPlanExpressionPacketId: expressionPacketId,
    latestVerification: {},
  };
  const reverted = projectAfterUndo(current, {
    artifacts: seedProject.artifacts,
    expressionPacketId,
    appliedChangeId,
  });
  assert.equal(reverted.artifacts[0].values.warmth, seedProject.artifacts[0].values.warmth);
  assert.equal(reverted.expressionPackets[0].status, "undone");
  assert.equal(reverted.latestAppliedChange, undefined);
  assert.equal(reverted.latestDesignPlan, undefined);
  assert.equal(reverted.latestDesignPlanExpressionPacketId, undefined);
  assert.equal(reverted.latestVerification, undefined);
  assert.equal(reverted.provenance[0].type, "change_undone");
});
