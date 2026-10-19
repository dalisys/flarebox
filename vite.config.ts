// Copyright (c) 2026 Cloudflare, Inc.
// Licensed under the Apache 2.0 license found in the LICENSE file or at:
//     https://opensource.org/licenses/Apache-2.0

import { reactRouter } from "@react-router/dev/vite";
import { cloudflare } from "@cloudflare/vite-plugin";
import tailwindcss from "@tailwindcss/vite";
import { existsSync } from "node:fs";
import { defineConfig } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

// Private deployment settings live in wrangler.local.jsonc, which git ignores.
const configPath = existsSync("wrangler.local.jsonc") ? "wrangler.local.jsonc" : undefined;

export default defineConfig({
  plugins: [
    cloudflare({ viteEnvironment: { name: "ssr" }, configPath }),
    tailwindcss(),
    reactRouter(),
    tsconfigPaths(),
  ],
});
