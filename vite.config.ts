import vinext from "vinext";
import { defineConfig } from "vite";
import fs from "node:fs";
import { sites } from "./build/sites-vite-plugin.js";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

let hostingConfig: { d1?: string | null; r2?: string | null } = { d1: "DB", r2: null };
const hostingConfigUrl = new URL("./.openai/hosting.json", import.meta.url);
if (fs.existsSync(hostingConfigUrl)) {
  try {
    hostingConfig = JSON.parse(fs.readFileSync(hostingConfigUrl, "utf8"));
  } catch {
    // Fall back to default D1 binding
  }
}

const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      // Default to loopback so the shared development principal and local D1
      // proxy are never exposed to the LAN accidentally. Preview operators can
      // opt in explicitly when their trusted environment requires another bind.
      host: process.env.MEANT_DEV_HOST ?? "127.0.0.1",
      allowedHosts: ["terminal.local"],
      ...(isCodexSeatbeltSandbox
        ? { watch: { useFsEvents: false, usePolling: true } }
        : {}),
    },
    plugins: [
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        inspectorPort: false,
        config: localBindingConfig,
      }),
    ],
  };
});
