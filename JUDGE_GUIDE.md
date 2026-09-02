# Judge guide

Expected time: about three minutes.

Use ChatGPT’s in-app browser, or Google Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled.

## Product walkthrough

1. Open [Meant](https://meant.protoperfect.io/).
2. Choose **New composition**, select **Poster**, and enter: **Create a poster about a neighborhood climate action plan.**
3. Confirm the result is labeled **Exploring** and the kept revision has not advanced.
4. Select the title and enter: **Make the opening title coral and a little more editorial.**
5. Choose **Compare**. Confirm the views are labeled **Kept** and **Exploring · not yet kept**.
6. Choose **Discard** once. Confirm the kept artifact and revision remain unchanged.
7. Create the direction again and choose the visible **Keep** control.
8. Reload. Confirm the kept artifact and History return.
9. Choose the visible **Undo** control. Confirm a newer revision restores the prior artifact and History retains both events.

## WebMCP walkthrough

1. Ask the browser agent to call `get_composition_context` and summarize the active artifact and selection without changing anything.
2. Ask it to call `preview_composition_turn` with: **Make the opening title coral and a little more editorial.**
3. Confirm Meant creates an Exploring proposal while the durable revision stays unchanged.
4. Ask the agent to call `keep_composition_draft` for that exact draft.
5. Confirm the tool requests human confirmation and does not advance the revision.
6. Choose the visible **Keep** control and confirm the revision advances.

## Expected behavior

- Exploring never impersonates a saved result.
- Compare names both versions.
- Discard removes only the temporary branch.
- Keep is visible, revision-bound, and durable after reload.
- Undo creates a newer revert revision.
- History retains both the original change and the revert.
- The agent uses the same semantic canvas and bounded operations as the person.
- The agent cannot perform Keep, Discard, or Undo without a visible human decision.

Realtime voice is not required for judging. Text, visible controls, and WebMCP provide the complete working path.
