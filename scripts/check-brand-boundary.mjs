import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.env.SITES_PROJECT_ROOT ?? process.cwd();
const publicSurfaceFiles = [
  "app/globals.css",
  "app/layout.tsx",
  "app/page.tsx",
  "app/studio.tsx",
  "package.json",
  "public/favicon.svg",
];

const legacyPalette = [
  "#2e3b51", "#f6f4ef", "#e9e9e9", "#a691f2", "#f090b3", "#9a6dff",
  "#7b90b5", "#cbbaa8", "#6e5fc0", "#7565c5", "#7462c5", "#6d5cc3",
  "#6c4aff", "#a879ff", "#b5a3f5", "#c4b6ff", "#ded7ff", "#d9d0ff",
  "#d9d2fa", "#1c2431", "#171e29", "#202936", "#273142", "#222c3b",
  "#303c4e", "#273243", "#3b4658", "#283344", "#1f2836", "#1b2330",
  "#edf1f7", "#f2f4f8", "#aab5c5", "#a8b3c3",
];

const canonicalTokens = {
  "--meant-paper": "#f3efe5",
  "--meant-chalk": "#fffcf5",
  "--meant-carbon": "#191816",
  "--meant-graphite": "#666158",
  "--meant-proof": "#f04b32",
  "--meant-marker": "#f1d64b",
  "--meant-muted": "#e9e3d7",
  "--meant-warm": "#b9aa94",
  "--meant-success": "#42745f",
};

const requiredThemeCoverage = [
  ".studio-topbar",
  ".command-dock",
  ".artifact-rail",
  ".instrument-dock",
  ".profile-menu",
  ".meant-preferences-dialog",
  ".meant-profile-dialog",
  ".theme-dark .studio-topbar",
  ".theme-dark .command-dock",
  ".theme-dark .artifact-rail",
  ".theme-dark .instrument-dock",
  ".theme-dark-menu",
  ".theme-dark-dialog",
];

const failures = [];

for (const relativePath of publicSurfaceFiles) {
  const source = readFileSync(resolve(root, relativePath), "utf8");
  const lines = source.split("\n");

  lines.forEach((line, index) => {
    const privateGhosaReference =
      relativePath === "app/studio.tsx"
      && (line.includes("@/lib/ghosa/") || line.includes("LEGACY_") || line.includes("semantic coverage gap"));
    if (/ghosa/i.test(line) && !privateGhosaReference) {
      failures.push(`${relativePath}:${index + 1} exposes GHOSA on a Meant surface`);
    }
  });

  if (relativePath === "app/globals.css") {
    if (/--ghosa-/i.test(source)) failures.push(`${relativePath} still defines a GHOSA design token`);
    for (const color of legacyPalette) {
      if (source.toLowerCase().includes(color)) failures.push(`${relativePath} still contains legacy color ${color}`);
    }
    if (/rgba\((166,\s*145,\s*242|123,\s*144,\s*181|154,\s*109,\s*255|240,\s*144,\s*179)/i.test(source)) {
      failures.push(`${relativePath} still contains a legacy violet, serenity, or rose channel`);
    }
    for (const [token, value] of Object.entries(canonicalTokens)) {
      const definitions = [...source.matchAll(new RegExp(`${token}\\s*:\\s*([^;]+);`, "gi"))];
      if (definitions.length !== 1) {
        failures.push(`${relativePath} must define ${token} exactly once`);
      } else if (definitions[0][1].trim().toLowerCase() !== value) {
        failures.push(`${relativePath} changed canonical ${token} from ${value}`);
      }
    }
    for (const selector of requiredThemeCoverage) {
      if (!source.includes(selector)) failures.push(`${relativePath} is missing Meant theme coverage for ${selector}`);
    }
  }
}

if (failures.length) {
  console.error("Meant brand boundary check failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}

console.log("Meant brand boundary verified.");
