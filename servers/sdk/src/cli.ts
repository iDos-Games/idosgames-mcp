import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createServer } from "./server.js";

// Entry point for `npx @idosgames/mcp`: run the registry MCP server over stdio, the transport
// Claude Code / Cursor / Codex use for a local MCP server. tsup prepends the node shebang.

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr — stdout is the JSON-RPC channel and must stay clean.
  console.error("[idosgames-mcp] ready (stdio)");
}

main().catch((err) => {
  console.error("[idosgames-mcp] fatal:", err);
  process.exit(1);
});
