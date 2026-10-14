import { readFileSync } from "node:fs";
import { defineConfig } from "tsup";

// serverInfo.version in the initialize answer = the published package version (it was hard-coded and
// drifted: 0.1.2 on a 0.1.33 package).
const { version } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
) as {
  version: string;
};

export default defineConfig({
  entry: ["src/cli.ts"],
  format: ["esm"],
  target: "node20",
  platform: "node",
  clean: true,
  sourcemap: false,
  dts: false,
  // Executable entry: prepend a shebang so the published bin runs directly.
  banner: { js: "#!/usr/bin/env node" },
  // The MCP SDK resolves from node_modules at runtime (declared dependency) — don't bundle it.
  external: ["@modelcontextprotocol/sdk"],
  define: { __MCP_VERSION__: JSON.stringify(version) },
});
