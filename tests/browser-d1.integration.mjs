import assert from "node:assert/strict";

const DEFAULT_BASE_URL = "http://terminal.local:4173";

const cases = [
  { name: "coral button", target: "Order a favorite", targetId: "web-primary-action", property: "fill", value: "#F46666", typed: "make this button coral", direct: { kind: "color", label: "Use #F46666" } },
  { name: "exact button text", target: "Order a favorite", targetId: "web-primary-action", property: "content", value: "Pearls, precisely.", typed: 'make the button say "Pearls, precisely."', direct: { kind: "content", label: "Text for Order a favorite" } },
  { name: "headline alignment", target: "Hero headline", targetId: "web-headline", property: "alignment", value: "center", typed: "center the headline", direct: { kind: "choice", label: "Set alignment center" } },
  { name: "action direction", target: "Order actions", targetId: "web-actions", property: "direction", value: "column", typed: "stack the buttons vertically", direct: { kind: "choice", label: "Set direction column" } },
  { name: "supporting copy size", target: "Supporting copy", targetId: "web-supporting-copy", property: "typeScale", value: 66, typed: "set the supporting copy text size to 66", direct: { kind: "slider", label: "Text size" }, canvas: "Larger" },
  { name: "button contrast", target: "Order a favorite", targetId: "web-primary-action", property: "contrast", value: 73, typed: "set this button contrast to 73", direct: { kind: "slider", label: "Contrast" } },
  { name: "button spacing", target: "Order a favorite", targetId: "web-primary-action", property: "spacing", value: 44, typed: "set this button spacing to 44", direct: { kind: "slider", label: "Padding" } },
  { name: "button corners", target: "Order a favorite", targetId: "web-primary-action", property: "cornerRadius", value: 38, typed: "set this button corner roundness to 38", direct: { kind: "slider", label: "Corner roundness" } },
  { name: "button accent", target: "Order a favorite", targetId: "web-primary-action", property: "accentStrength", value: 61, typed: "set this button accent to 61", direct: { kind: "slider", label: "Color strength" } },
  { name: "button importance", target: "Order a favorite", targetId: "web-primary-action", property: "focalStrength", value: 50, typed: "set this button focus to 50", direct: { kind: "choice", label: "Balanced" } },
];

function uniqueWorkspace(label) {
  return `e2e-${label}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`.slice(0, 92);
}

function route(baseUrl, workspaceId) {
  return `${baseUrl}/classic?e2e=1&workspaceId=${encodeURIComponent(workspaceId)}`;
}

async function browserAction(action, attempts = 3) {
  let lastError;
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      return await action();
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 300 * (attempt + 1)));
    }
  }
  throw lastError;
}

async function state(tab) {
  return JSON.parse(await tab.playwright.getByTestId("e2e-state").textContent({ timeoutMs: 10_000 }));
}

async function waitForState(tab, predicate, message, timeoutMs = 12_000) {
  const started = Date.now();
  let latest;
  while (Date.now() - started < timeoutMs) {
    latest = await state(tab);
    if (predicate(latest)) return latest;
    await tab.playwright.waitForTimeout(100);
  }
  assert.fail(`${message}; latest state: ${JSON.stringify(latest)}`);
}

async function openWorkspace(browser, workspaceId, baseUrl = DEFAULT_BASE_URL) {
  const tab = await browser.tabs.new();
  await tab.goto(route(baseUrl, workspaceId));
  await tab.playwright.waitForLoadState({ state: "load", timeoutMs: 20_000 });
  await tab.playwright.getByTestId("e2e-state").waitFor({ state: "attached", timeoutMs: 20_000 });
  await waitForState(tab, (value) => value.identity.revision >= 1, "D1 workspace did not bootstrap");
  return tab;
}

async function selectTarget(tab, target) {
  await browserAction(() => tab.playwright.getByRole("button", { name: `Select ${target}`, exact: true }).click({ timeoutMs: 8_000 }));
  // Selection changes the operation scope and target refs through React state.
  await new Promise((resolve) => setTimeout(resolve, 250));
}

async function captureCount(tab) {
  return (await state(tab)).captures.length;
}

async function setFault(tab, fault) {
  await tab.playwright.getByTestId("e2e-fault").selectOption(fault);
}

async function typed(tab, item, expectFailure = false) {
  const before = await captureCount(tab);
  await selectTarget(tab, item.target);
  const input = tab.playwright.getByLabel("Expression", { exact: true });
  await input.fill(item.typed);
  // Let the controlled textarea commit its new value before the keyboard
  // submission reads the React closure, matching a real user's pause.
  await new Promise((resolve) => setTimeout(resolve, 50));
  await input.press("Enter");
  const staged = await waitForState(tab, (value) => value.captures.length > before && value.captures.at(-1)?.surface === "typed", `${item.name}: typed surface did not stage`);
  return expectFailure ? waitForState(tab, (value) => value.lastResult?.status === 500, `${item.name}: typed disposable apply did not settle`) : staged;
}

async function voice(tab, item, expectFailure = false) {
  const before = await captureCount(tab);
  await selectTarget(tab, item.target);
  await tab.playwright.getByTestId("e2e-voice-input").fill(item.typed);
  await new Promise((resolve) => setTimeout(resolve, 50));
  await browserAction(() => tab.playwright.getByTestId("e2e-voice-input").press("Enter"));
  const staged = await waitForState(tab, (value) => value.captures.length > before && value.captures.at(-1)?.surface === "voice", `${item.name}: voice seam did not stage`);
  return expectFailure ? waitForState(tab, (value) => value.lastResult?.status === 500, `${item.name}: voice disposable apply did not settle`) : staged;
}

async function clickSlider(tab, label, value) {
  const slider = tab.playwright.getByRole("slider", { name: label, exact: true });
  const rootId = await slider.evaluate((element) => element.parentElement?.parentElement?.id);
  const root = tab.playwright.locator(`#${rootId}`);
  // First focus the real control with one keyboard adjustment, which also
  // scrolls its track into the browser viewport. The browser client does not
  // expose scrollIntoView or positioned locator clicks.
  const beforeScroll = await captureCount(tab);
  await browserAction(() => slider.press("ArrowRight"));
  await waitForState(tab, (current) => current.captures.length > beforeScroll, `${label}: slider did not receive its focus adjustment`);
  await waitForState(tab, (current) => current.lastResult?.status === 500, `${label}: focus adjustment did not settle`);
  const rect = await root.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    return { left: bounds.left, top: bounds.top, width: bounds.width, height: bounds.height };
  });
  await tab.cua.click({ x: rect.left + rect.width * value / 100, y: rect.top + rect.height / 2 });
}

async function direct(tab, item, expectFailure = false) {
  const before = await captureCount(tab);
  await selectTarget(tab, item.target);
  await browserAction(() => tab.playwright.getByRole("tab", { name: "Tune", exact: true }).click({ timeoutMs: 8_000 }));
  if (item.direct.kind === "slider") {
    await clickSlider(tab, item.direct.label, item.value);
  } else if (item.direct.kind === "content") {
    const input = tab.playwright.getByLabel(item.direct.label, { exact: true });
    await input.fill(item.value);
    await input.press("Tab");
  } else {
    await browserAction(() => tab.playwright.getByRole("button", { name: item.direct.label, exact: true }).click({ timeoutMs: 8_000 }));
  }
  const staged = await waitForState(tab, (value) => value.captures.length > before && value.captures.at(-1)?.surface === "direct", `${item.name}: direct Tune surface did not stage`);
  return expectFailure ? waitForState(tab, (value) => value.lastResult?.status === 500, `${item.name}: direct disposable apply did not settle`) : staged;
}

async function canvas(tab, item, expectFailure = false) {
  const before = await captureCount(tab);
  await selectTarget(tab, item.target);
  await browserAction(() => tab.playwright.getByRole("button", { name: item.canvas }).click({ timeoutMs: 8_000 }));
  const staged = await waitForState(tab, (value) => value.captures.length > before && value.captures.at(-1)?.surface === "canvas", `${item.name}: canvas quick adjustment did not stage`);
  return expectFailure ? waitForState(tab, (value) => value.lastResult?.status === 500, `${item.name}: canvas disposable apply did not settle`) : staged;
}

async function webmcpStage(tab, item) {
  const before = await captureCount(tab);
  await tab.playwright.getByTestId("e2e-webmcp-input").fill(JSON.stringify({
    text: item.typed,
    artifactId: "artifact-web",
    targetIds: [item.targetId],
    property: item.property,
    value: item.value,
  }));
  await new Promise((resolve) => setTimeout(resolve, 50));
  await browserAction(() => tab.playwright.getByTestId("e2e-webmcp-input").press("Enter"));
  return waitForState(tab, (value) => value.captures.length > before && value.captures.at(-1)?.surface === "webmcp", `${item.name}: registered WebMCP tool did not stage`);
}

function canonicalBytes(operation) {
  return JSON.stringify({
    projectId: operation.projectId,
    workspaceId: operation.workspaceId,
    baseRevision: operation.baseRevision,
    artifactId: operation.artifactId,
    artifactVersion: operation.artifactVersion,
    targetIds: [...operation.targetIds].sort(),
    kind: operation.kind,
    property: operation.property,
    value: operation.value,
  });
}

function lastCaptureFor(current, surface) {
  return [...current.captures].reverse().find((capture) => capture.surface === surface);
}

async function requestApplyWebmcp(tab) {
  const before = await state(tab);
  await browserAction(() => tab.playwright.getByTestId("e2e-webmcp-input").press("Control+Enter"));
  const requested = await waitForState(tab, (value) => value.lastResult?.action === "webmcp-apply", "WebMCP apply request did not finish");
  assert.equal(requested.lastResult.result?.requiresHumanConfirmation, true, "WebMCP apply bypassed human confirmation");
  assert.equal(requested.identity.revision, before.identity.revision, "WebMCP apply request advanced durable revision");
  assert.deepEqual(requested.postApprovalNetworkCalls, [], "WebMCP apply request made a post-approval mutation call");
  return requested;
}

async function applyHuman(tab) {
  await browserAction(() => tab.playwright.getByTestId("human-apply-change").click({ timeoutMs: 8_000 }));
  return waitForState(tab, (value) => typeof value.lastResult?.ok === "boolean", "visible human Apply did not finish");
}

async function requestUndoWebmcp(tab) {
  const before = await state(tab);
  await browserAction(() => tab.playwright.getByTestId("e2e-undo-id").press("Enter"));
  const requested = await waitForState(tab, (value) => value.lastResult?.action === "webmcp-undo", "WebMCP undo request did not finish");
  assert.equal(requested.identity.revision, before.identity.revision, "WebMCP undo request advanced durable revision");
  return requested;
}

async function undoHuman(tab) {
  const before = await state(tab);
  await browserAction(() => tab.playwright.getByTestId("human-undo-change").click({ timeoutMs: 8_000 }));
  return waitForState(tab, (value) => value.identity.revision === before.identity.revision + 1 && value.history[0]?.kind === "revert", "visible human Undo did not finish");
}

function nodeState(current, targetId) {
  return current.artifacts.flatMap((artifact) => artifact.nodes).find((node) => node.id === targetId);
}

async function renderedStyle(tab, targetId) {
  return tab.playwright.locator(`[data-semantic-node="${targetId}"]`).evaluate((element) => {
    const style = getComputedStyle(element);
    return { backgroundColor: style.backgroundColor, color: style.color, text: element.textContent?.replace(/\s+/g, " ").trim() };
  });
}

function rgbToHex(value) {
  const parts = value.match(/\d+/g)?.slice(0, 3).map(Number);
  return parts?.length === 3 ? `#${parts.map((part) => part.toString(16).padStart(2, "0")).join("")}`.toUpperCase() : value.toUpperCase();
}

async function refetch(tab, revision) {
  await browserAction(() => tab.playwright.getByTestId("e2e-refetch").click({ timeoutMs: 8_000 }));
  return waitForState(tab, (value) => value.identity.revision === revision, `page did not converge on revision ${revision}`);
}

export async function runBrowserD1IntegrationSuite(browser, { baseUrl = DEFAULT_BASE_URL, representativeRange = [0, cases.length], includeIntegrationSections = true, includeCoreSections = true, raceRange = [0, 20] } = {}) {
  const report = { representativeExpressions: cases.length, assertions: 0, races: 0, workspaces: [], sections: [] };
  const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); report.assertions += 1; };
  const truthy = (actual, message) => { assert.ok(actual, message); report.assertions += 1; };

  for (const item of cases.slice(representativeRange[0], representativeRange[1])) {
    const workspace = uniqueWorkspace(`surfaces-${item.property.toLowerCase()}`);
    report.workspaces.push(workspace);
    const tab = await openWorkspace(browser, workspace, baseUrl);
    try {
      await setFault(tab, "persistence");
      let current = await typed(tab, item, true);
      current = await voice(tab, item, true);
      current = await direct(tab, item, true);
      if (item.canvas) current = await canvas(tab, item, true);
      current = await webmcpStage(tab, item);
      const surfaces = item.canvas ? ["typed", "voice", "direct", "canvas", "webmcp"] : ["typed", "voice", "direct", "webmcp"];
      const captures = surfaces.map((surface) => lastCaptureFor(current, surface));
      truthy(captures.every(Boolean), `${item.name}: every applicable real surface captured a staged operation; captured=${current.captures.map((capture) => capture.surface).join(",")}`);
      const operations = captures.map((capture) => capture.operations[0]);
      check(new Set(operations.map(canonicalBytes)).size, 1, `${item.name}: canonical operation bytes diverged`);
      check(new Set(operations.map((operation) => operation.operationId)).size, 1, `${item.name}: operation IDs diverged`);
      check(current.identity.revision, 1, `${item.name}: injected persistence failures advanced the revision`);
    } finally {
      await tab.close();
    }
  }
  report.sections.push(`${representativeRange[1] - representativeRange[0]} real cross-surface canonical-operation cases`);
  if (!includeIntegrationSections) return report;

  if (includeCoreSections) {
  for (const surface of ["typed", "webmcp"]) {
    const workspace = uniqueWorkspace(`coral-${surface}`);
    report.workspaces.push(workspace);
    const tab = await openWorkspace(browser, workspace, baseUrl);
    try {
      await selectTarget(tab, "Order a favorite");
      const unrelatedBefore = await renderedStyle(tab, "web-secondary-action");
      if (surface === "typed") await typed(tab, cases[0]);
      else { await webmcpStage(tab, cases[0]); await requestApplyWebmcp(tab); await applyHuman(tab); }
      const current = await waitForState(tab, (value) => value.identity.revision === 2, `${surface}: coral commit did not become durable`);
      check(nodeState(current, "web-primary-action").primitives.fill, "#F46666", `${surface}: exact coral semantic value changed`);
      check(rgbToHex((await renderedStyle(tab, "web-primary-action")).backgroundColor), "#F46666", `${surface}: rendered target is not exact coral`);
      check(await renderedStyle(tab, "web-secondary-action"), unrelatedBefore, `${surface}: unrelated node changed`);
      check(current.postApprovalNetworkCalls, ["POST /api/transactions/apply"], `${surface}: post-approval path made an intent/AI request`);
    } finally {
      await tab.close();
    }
  }
  report.sections.push("exact coral rendered target and post-approval network boundary");

  for (const fault of ["persistence", "postcondition"]) {
    const workspace = uniqueWorkspace(`fault-${fault}`);
    report.workspaces.push(workspace);
    const tab = await openWorkspace(browser, workspace, baseUrl);
    try {
      await selectTarget(tab, "Order a favorite");
      const before = await renderedStyle(tab, "web-primary-action");
      await setFault(tab, fault);
      const current = await typed(tab, cases[0]);
      await waitForState(tab, (value) => value.lastResult?.ok === false, `${fault}: failure was not acknowledged as failure`);
      const finalState = await state(tab);
      check(finalState.identity.revision, 1, `${fault}: revision advanced`);
      check(finalState.history.length, 0, `${fault}: commit/history row exists`);
      check(await renderedStyle(tab, "web-primary-action"), before, `${fault}: rendered target changed`);
      check(finalState.lastResult.ok, false, `${fault}: success was acknowledged`);
      truthy(current.captures.length >= 1, `${fault}: no real staged operation was exercised`);
    } finally {
      await tab.close();
    }
  }
  report.sections.push("persistence and postcondition failure rollback boundaries");

  {
    const workspace = uniqueWorkspace("reload-undo");
    report.workspaces.push(workspace);
    let tab = await openWorkspace(browser, workspace, baseUrl);
    const original = await renderedStyle(tab, "web-primary-action");
    await typed(tab, cases[0]);
    let current = await waitForState(tab, (value) => value.identity.revision === 2, "reload undo setup commit failed");
    const committedChangeId = current.history[0].id;
    await tab.close();
    tab = await openWorkspace(browser, workspace, baseUrl);
    current = await state(tab);
    check(current.identity.revision, 2, "committed change did not survive page recreation");
    await tab.playwright.getByTestId("e2e-undo-id").fill(committedChangeId);
    await new Promise((resolve) => setTimeout(resolve, 50));
    const undoRequest = await requestUndoWebmcp(tab);
    check(undoRequest.lastResult.result.requiresHumanConfirmation, true, "WebMCP Undo did not request human confirmation");
    await undoHuman(tab);
    current = await waitForState(tab, (value) => value.identity.revision === 3, "explicit undo did not commit");
    check(current.history[0].kind, "revert", "undo did not create a revert commit");
    check(current.history[0].revertedChangeId, committedChangeId, "revert commit does not identify the explicit change");
    await tab.close();
    tab = await openWorkspace(browser, workspace, baseUrl);
    current = await state(tab);
    check(current.identity.revision, 3, "revert commit did not survive another reload");
    check(await renderedStyle(tab, "web-primary-action"), original, "rendered postcondition was not restored after reload");
    await tab.close();
  }
  report.sections.push("reload-persistent explicit-change undo");

  }

  for (let run = raceRange[0]; run < raceRange[1]; run += 1) {
    const workspace = uniqueWorkspace(`race-${run}`);
    report.workspaces.push(workspace);
    const left = await openWorkspace(browser, workspace, baseUrl);
    const right = await openWorkspace(browser, workspace, baseUrl);
    try {
      await webmcpStage(left, { ...cases[0], typed: `left race ${run}` });
      await webmcpStage(right, { ...cases[0], typed: `right race ${run}` });
      await requestApplyWebmcp(left);
      await requestApplyWebmcp(right);
      await Promise.all([
        left.playwright.getByTestId("human-apply-change").click(),
        right.playwright.getByTestId("human-apply-change").click(),
      ]);
      const leftState = await waitForState(left, (value) => typeof value.lastResult?.ok === "boolean", `race ${run}: left result missing`);
      const rightState = await waitForState(right, (value) => typeof value.lastResult?.ok === "boolean", `race ${run}: right result missing`);
      const results = [leftState.lastResult, rightState.lastResult];
      check(results.filter((result) => result.ok).length, 1, `race ${run}: durable winner count`);
      check(results.filter((result) => !result.ok && result.status === 409 && result.authoritativeRevision === 2).length, 1, `race ${run}: authoritative loser conflict`);
      const firstCommitId = (results[0].ok ? leftState : rightState).lastResult.committedChangeId;
      const followupTab = results[0].ok ? right : left;
      await refetch(followupTab, 2);
      await webmcpStage(followupTab, { ...cases[0], typed: `followup ${run}`, value: "#DC2626" });
      await requestApplyWebmcp(followupTab);
      const followup = await applyHuman(followupTab);
      truthy(followup.lastResult.ok, `race ${run}: follow-up write failed`);
      check(followup.identity.revision, 3, `race ${run}: final revision`);
      await refetch(left, 3);
      await left.playwright.getByTestId("e2e-undo-id").fill(firstCommitId);
      await new Promise((resolve) => setTimeout(resolve, 50));
      const staleUndo = await requestUndoWebmcp(left);
      check(staleUndo.lastResult.result.ok, false, `race ${run}: cross-revision undo request was not rejected`);
      truthy(staleUndo.lastResult.result.error, `race ${run}: stale undo lacked an explanatory error`);
      const leftFinal = await refetch(left, 3);
      const rightFinal = await refetch(right, 3);
      check(leftFinal.history.length, 2, `race ${run}: exact history length`);
      check(leftFinal.history.map((entry) => entry.revision), [3, 2], `race ${run}: exact history revisions`);
      check(rightFinal.identity.revision, leftFinal.identity.revision, `race ${run}: pages did not converge`);
      check(nodeState(rightFinal, "web-primary-action"), nodeState(leftFinal, "web-primary-action"), `race ${run}: rendered semantic state did not converge`);
      report.races += 1;
    } finally {
      await left.close();
      await right.close();
    }
  }
  report.sections.push(`${raceRange[1] - raceRange[0]} actual two-page D1 CAS races`);
  return report;
}

export { cases as representativeCases };
