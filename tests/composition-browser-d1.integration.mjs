import assert from "node:assert/strict";

const DEFAULT_BASE_URL = "http://terminal.local:4173";

function workspace(label) {
  return `e2e-composition-${label}-${Date.now()}-${Math.random().toString(16).slice(2, 10)}`.slice(0, 92);
}

function route(baseUrl, workspaceId) {
  return `${baseUrl}/?e2e=1&workspaceId=${encodeURIComponent(workspaceId)}`;
}

async function state(tab) {
  return JSON.parse(await tab.playwright.getByTestId("composition-e2e-state").textContent({ timeoutMs: 10_000 }));
}

async function waitForState(tab, predicate, message, timeoutMs = 15_000) {
  const started = Date.now();
  let latest;
  while (Date.now() - started < timeoutMs) {
    latest = await state(tab);
    if (predicate(latest)) return latest;
    await (tab.waiter ?? tab.playwright).waitForTimeout(100);
  }
  assert.fail(`${message}; latest=${JSON.stringify(latest)}`);
}

async function openMobileWorkspace(browser, workspaceId, baseUrl = DEFAULT_BASE_URL, width = 390) {
  const outer = await browser.tabs.new();
  await outer.goto(`${baseUrl}/api/e2e/mobile-harness?workspaceId=${encodeURIComponent(workspaceId)}&width=${width}`);
  await outer.playwright.waitForLoadState({ state: "load", timeoutMs: 20_000 });
  const frame = outer.playwright.frameLocator('iframe[title="Meant mobile viewport"]');
  const mobile = { playwright: frame, waiter: outer.playwright };
  await frame.getByTestId("composition-e2e-state").waitFor({ state: "attached", timeoutMs: 20_000 });
  await waitForState(mobile, (current) => current.revision === 1 && current.saveState === "saved" && current.webMcpStatus === "ready", `${width}px canonical workspace did not become ready`);
  return { outer, mobile };
}

async function openWorkspace(browser, workspaceId, baseUrl = DEFAULT_BASE_URL) {
  const tab = await browser.tabs.new();
  await tab.goto(route(baseUrl, workspaceId));
  await tab.playwright.waitForLoadState({ state: "load", timeoutMs: 20_000 });
  await tab.playwright.getByTestId("composition-e2e-state").waitFor({ state: "attached", timeoutMs: 20_000 });
  await waitForState(tab, (current) => current.revision === 1 && current.saveState === "saved" && current.webMcpStatus === "ready", "canonical workspace did not become ready");
  return tab;
}

async function tool(tab, name, input) {
  const call = JSON.stringify({ name, input });
  await tab.playwright.getByTestId("composition-e2e-webmcp-input").fill(call);
  await tab.playwright.getByTestId("composition-e2e-webmcp-execute").click();
  return waitForState(tab, (current) => current.lastToolCall?.name === name && current.lastToolCall?.settled === true, `${name} did not settle`);
}

async function previewTitle(tab, value, summary = "Set the opening title exactly") {
  return tool(tab, "preview_composition_change", {
    summary,
    operations: [{ kind: "node.update", frameId: "frame-opening", targetId: "opening-title", patch: { content: value } }],
  });
}

async function reload(tab) {
  await tab.reload();
  await tab.playwright.waitForLoadState({ state: "load", timeoutMs: 20_000 });
  return waitForState(tab, (current) => current.saveState === "saved", "canonical workspace did not reload");
}

export async function runCompositionBrowserD1Suite(browser, { baseUrl = DEFAULT_BASE_URL } = {}) {
  const report = { assertions: 0, races: 0, workspaces: [], sections: [] };
  const check = (actual, expected, message) => { assert.deepEqual(actual, expected, message); report.assertions += 1; };
  const truthy = (actual, message) => { assert.ok(actual, message); report.assertions += 1; };

  {
    const id = workspace("loop");
    report.workspaces.push(id);
    const tab = await openWorkspace(browser, id, baseUrl);
    try {
      const original = (await state(tab)).keptTitle;
      let current = await previewTitle(tab, "A truthful, editable opening");
      check(current.revision, 1, "Exploring advanced the revision");
      check(current.keptTitle, original, "Exploring changed the kept artifact");
      check(current.activeTitle, "A truthful, editable opening", "preview did not change the real artifact");
      truthy(current.draftId, "preview did not create an Exploring draft");
      await tab.playwright.getByRole("button", { name: "Compare", exact: true }).first().click();
      await tab.playwright.getByText("Kept · r1", { exact: true }).waitFor({ state: "visible" });
      await tab.playwright.getByText("Exploring · not yet kept", { exact: true }).waitFor({ state: "visible" });
      const keepRequest = await tool(tab, "keep_composition_draft", { draftId: current.draftId });
      check(keepRequest.lastToolCall.result.requiresHumanConfirmation, true, "agent Keep bypassed confirmation");
      check(keepRequest.revision, 1, "agent Keep advanced the revision");
      await tab.playwright.getByRole("button", { name: "Keep", exact: true }).click();
      current = await waitForState(tab, (value) => value.revision === 2 && !value.draftId, "human Keep did not create revision 2");
      check(current.keptTitle, "A truthful, editable opening", "Keep did not persist the exact artifact content");
      current = await reload(tab);
      check(current.revision, 2, "Keep did not survive reload");
      check(current.keptTitle, "A truthful, editable opening", "kept artifact did not survive reload");

      current = await previewTitle(tab, "A disposable direction", "Try a disposable opening");
      const discardRequest = await tool(tab, "discard_composition_draft", { draftId: current.draftId });
      check(discardRequest.lastToolCall.result.requiresHumanConfirmation, true, "agent Discard bypassed confirmation");
      check(discardRequest.revision, 2, "agent Discard advanced the revision");
      await tab.playwright.getByRole("button", { name: "Discard", exact: true }).click();
      current = await waitForState(tab, (value) => !value.draftId, "human Discard did not clear the draft");
      check(current.revision, 2, "Discard changed durable revision");
      check(current.keptTitle, "A truthful, editable opening", "Discard changed kept content");

      const apply = current.history.find((entry) => entry.kind === "apply" && entry.revision === 2);
      truthy(apply?.id, "kept change is missing from History");
      const undoRequest = await tool(tab, "undo_composition_change", { committedChangeId: apply.id, expectedRevision: 2 });
      check(undoRequest.lastToolCall.result.requiresHumanConfirmation, true, "agent Undo bypassed confirmation");
      check(undoRequest.revision, 2, "agent Undo advanced the revision");
      await tab.playwright.getByRole("button", { name: "Undo", exact: true }).click();
      current = await waitForState(tab, (value) => value.revision === 3 && value.history[0]?.kind === "revert", "human Undo did not create revision 3");
      check(current.keptTitle, original, "Undo did not restore the exact prior artifact");
      check(current.history.map((entry) => entry.revision), [3, 2], "History does not retain the change and its revert");
      current = await reload(tab);
      check(current.revision, 3, "Undo did not survive reload");
      check(current.keptTitle, original, "restored artifact did not survive reload");
    } finally {
      await tab.close();
    }
  }
  report.sections.push("canonical Exploring, Compare, agent confirmation, Keep, reload, Discard, Undo, and History");

  {
    const id = workspace("race");
    report.workspaces.push(id);
    const left = await openWorkspace(browser, id, baseUrl);
    const right = await openWorkspace(browser, id, baseUrl);
    try {
      await previewTitle(left, "Left proposal", "Left concurrent proposal");
      await previewTitle(right, "Right proposal", "Right concurrent proposal");
      await Promise.all([
        left.playwright.getByRole("button", { name: "Keep", exact: true }).click(),
        right.playwright.getByRole("button", { name: "Keep", exact: true }).click(),
      ]);
      const leftState = await waitForState(left, (value) => value.revision === 2, "left did not converge to revision 2");
      const rightState = await waitForState(right, (value) => value.revision === 2, "right did not converge to revision 2");
      const winners = [leftState, rightState].filter((value) => !value.draftId && value.saveState === "saved");
      const losers = [leftState, rightState].filter((value) => Boolean(value.draftId) && value.saveState === "conflict");
      check(winners.length, 1, "two-tab CAS did not produce exactly one durable winner");
      check(losers.length, 1, "two-tab CAS did not preserve exactly one visible losing draft");
      check(leftState.keptTitle, rightState.keptTitle, "tabs disagree about authoritative kept content");
      check(leftState.history.length, 1, "race created more than one durable commit");
      check(rightState.history.length, 1, "race loser did not receive authoritative History");
      report.races += 1;
    } finally {
      await left.close();
      await right.close();
    }
  }
  report.sections.push("actual two-page canonical D1 compare-and-swap race");

  {
    const raceId = workspace("bootstrap-race");
    report.workspaces.push(raceId);
    const tab = await browser.tabs.new();
    try {
      await tab.goto(`${baseUrl}/e2e/bootstrap-proof?workspaceId=${raceId}`);
      const bootstrapRace = JSON.parse(await tab.playwright.locator("body").innerText({ timeoutMs: 20_000 }));
      check(bootstrapRace.attempts.map((attempt) => attempt.status).sort(), [200, 409], "racing bootstrap calls did not produce one winner and one conflict");
      check(bootstrapRace.attempts.filter((attempt) => attempt.body.conflict === true).length, 1, "bootstrap loser did not receive an authoritative conflict receipt");
      truthy(["composition-bootstrap-left", "composition-bootstrap-right"].includes(bootstrapRace.authoritative.project.composition.id), "bootstrap race did not persist either exact candidate");
      report.races += 1;
    } finally {
      await tab.close();
    }
  }
  report.sections.push("actual first-use D1 bootstrap race with one authoritative winner");

  {
    const id = workspace("long-turn");
    report.workspaces.push(id);
    const tab = await openWorkspace(browser, id, baseUrl);
    try {
      const transcript = `Make the title quieter. ${"Detailed context remains available to the planner. ".repeat(12)}`;
      truthy(transcript.length > 240, "long-turn fixture did not cross the receipt limit");
      const current = await tool(tab, "preview_composition_turn", { transcript });
      truthy(current.draftId, "a valid long WebMCP direction did not create an Exploring draft");
      check(current.lastToolCall.error, undefined, "a valid long WebMCP direction crossed the durable summary boundary");
    } finally {
      await tab.close();
    }
  }
  report.sections.push("long public WebMCP directions retain full planning input with bounded receipts");

  {
    const id = workspace("typed-keep");
    report.workspaces.push(id);
    const tab = await openWorkspace(browser, id, baseUrl);
    try {
      await previewTitle(tab, "A person keeps this direction", "Verify the typed Keep decision");
      const direction = tab.playwright.getByLabel("Direction", { exact: true });
      await direction.fill("Keep this.");
      await direction.press("Enter");
      const current = await waitForState(tab, (value) => value.revision === 2 && !value.draftId, "the public typed Keep phrase did not create revision 2");
      check(current.keptTitle, "A person keeps this direction", "typed Keep did not preserve the exact draft");
    } finally {
      await tab.close();
    }
  }
  report.sections.push("person-originated typed “Keep this.” decision");

  {
    const id = workspace("mobile-390");
    report.workspaces.push(id);
    const { outer, mobile } = await openMobileWorkspace(browser, id, baseUrl);
    try {
      const viewport = await mobile.playwright.locator("body").evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
      check(viewport.width, 390, "mobile harness did not exercise the required 390px CSS width");
      check(viewport.height, 844, "mobile harness did not exercise the required 844px CSS height");
      await outer.cua.scroll({ x: 600, y: 350, scrollX: 0, scrollY: -1_000 });
      await mobile.playwright.getByTestId("composition-e2e-collapse").click();
      const direction = mobile.playwright.getByLabel("Direction", { exact: true });
      await direction.fill("Make the title quieter.");
      await direction.press("Enter");
      let current = await waitForState(mobile, (value) => Boolean(value.draftId), "390px typed direction did not create an Exploring draft");
      await outer.cua.scroll({ x: 600, y: 350, scrollX: 0, scrollY: -1_000 });
      await outer.playwright.waitForTimeout(100);
      await mobile.playwright.getByRole("button", { name: "Compare", exact: true }).first().click();
      await mobile.playwright.getByRole("button", { name: "View kept", exact: true }).waitFor({ state: "visible" });
      await mobile.playwright.getByRole("button", { name: "View Exploring", exact: true }).waitFor({ state: "visible" });
      const mobileActions = await Promise.all(["Keep", "Discard", "Undo", "History"].map(async (name) => {
        const button = mobile.playwright.getByRole("button", { name, exact: true }).first();
        await button.waitFor({ state: "visible" });
        return button.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return { name: element.textContent?.trim(), width: bounds.width, height: bounds.height };
        });
      }));
      truthy(mobileActions.every((action) => action.width >= 44 && action.height >= 44), `mobile decision targets are smaller than 44px: ${JSON.stringify(mobileActions)}`);
      await direction.fill("Keep this.");
      await direction.press("Enter");
      current = await waitForState(mobile, (value) => value.revision === 2 && !value.draftId, "390px typed Keep did not create revision 2");
      check(current.keptTitle, current.activeTitle, "390px Keep did not preserve the exact Exploring artifact");
      check(current.history[0]?.kind, "apply", "390px Keep did not create a durable apply receipt");
      await outer.cua.scroll({ x: 600, y: 350, scrollX: 0, scrollY: -1_000 });
      await outer.playwright.waitForTimeout(150);
      await mobile.playwright.getByRole("button", { name: "History", exact: true }).click();
      await mobile.playwright.getByText("Durable revision trail", { exact: true }).waitFor({ state: "visible" });
      await mobile.playwright.getByText("Revision 2", { exact: false }).waitFor({ state: "visible" });
      await mobile.playwright.getByRole("button", { name: "Close history", exact: true }).click();
      await mobile.playwright.getByRole("button", { name: "Undo", exact: true }).click();
      current = await waitForState(mobile, (value) => value.revision === 3 && value.history[0]?.kind === "revert", "390px Undo did not create revision 3");
      check(current.history.map((entry) => entry.revision), [3, 2], "390px History lost the kept/revert pair");
    } finally {
      await outer.close();
    }
  }
  report.sections.push("390×844 mobile Compare, 44px decisions, Keep, History drawer, and Undo");

  {
    const id = workspace("mobile-768");
    report.workspaces.push(id);
    const { outer, mobile } = await openMobileWorkspace(browser, id, baseUrl, 768);
    try {
      const viewport = await mobile.playwright.locator("body").evaluate(() => ({ width: window.innerWidth, height: window.innerHeight }));
      check(viewport.width, 768, "tablet harness did not exercise the required 768px CSS width");
      check(viewport.height, 844, "tablet harness did not exercise the required 844px CSS height");
      await outer.cua.scroll({ x: 600, y: 350, scrollX: 0, scrollY: -1_000 });
      await mobile.playwright.getByTestId("composition-e2e-collapse").click();
      const direction = mobile.playwright.getByLabel("Direction", { exact: true });
      await direction.fill("Make the title quieter.");
      await direction.press("Enter");
      await waitForState(mobile, (value) => Boolean(value.draftId), "768px typed direction did not create an Exploring draft");
      await outer.cua.scroll({ x: 600, y: 350, scrollX: 0, scrollY: -1_000 });
      await outer.playwright.waitForTimeout(100);
      const targets = await Promise.all([
        ["button", "Compare"], ["button", "Keep"], ["button", "Discard"], ["button", "Undo"], ["button", "History"],
        ["button", "Previous frame"], ["button", "Next frame"],
      ].map(async ([role, name]) => {
        const button = mobile.playwright.getByRole(role, { name, exact: true }).first();
        await button.waitFor({ state: "visible" });
        return button.evaluate((element) => {
          const bounds = element.getBoundingClientRect();
          return { name: element.getAttribute("aria-label") ?? element.textContent?.trim(), width: bounds.width, height: bounds.height };
        });
      }));
      truthy(targets.every((target) => target.width >= 44 && target.height >= 44), `768px touch targets are smaller than 44px: ${JSON.stringify(targets)}`);
      await mobile.playwright.getByRole("button", { name: "History", exact: true }).click();
      const close = mobile.playwright.getByRole("button", { name: "Close history", exact: true });
      await close.waitFor({ state: "visible" });
      const closeBounds = await close.evaluate((element) => {
        const bounds = element.getBoundingClientRect();
        return { width: bounds.width, height: bounds.height };
      });
      truthy(closeBounds.width >= 44 && closeBounds.height >= 44, `768px history close target is smaller than 44px: ${JSON.stringify(closeBounds)}`);
    } finally {
      await outer.close();
    }
  }
  report.sections.push("768×844 tablet layout retains 44px decision, navigation, and drawer targets");
  return report;
}
