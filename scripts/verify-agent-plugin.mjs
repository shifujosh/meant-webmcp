import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";

const root = new URL("../", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("plugins/meant/.codex-plugin/plugin.json", root), "utf8"));
const mcp = JSON.parse(await readFile(new URL("plugins/meant/.mcp.json", root), "utf8"));
const skill = await readFile(new URL("plugins/meant/skills/meant/SKILL.md", root), "utf8");
assert.equal(manifest.name, "meant");
assert.equal(manifest.version, "0.2.0");
assert.equal(manifest.mcpServers, "./.mcp.json");
assert.equal(mcp.mcpServers.meant.url, "https://meant.protoperfect.io/mcp");
for (const term of ["nextActions", "STALE_REVISION", "get_composition_render", "explicit"]) assert.match(skill, new RegExp(term, "i"));
for (const path of ["PLUGIN_SUBMISSION.md", "ROADMAP.md", "evals/agent-engagement.jsonl", "plugins/meant/assets/meant-icon.svg"]) await access(new URL(path, root));
console.log("meant-plugin: manifest, endpoint, skill, policies, roadmap, and eval distribution verified");
