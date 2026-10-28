# Installing the iDos Games MCP servers

Instructions for an AI agent (Cline and similar) setting these servers up for a user.

## 1. iDos Games (hosted): live game data

Add a remote MCP server over Streamable HTTP:

- URL: `https://site.idosgames.com/api/v2/mcp`
- Headers: **none**. Do not ask the user for an API key; there is none.

`initialize` and `tools/list` work without sign-in. The first tool call returns HTTP 401. The client then
runs OAuth 2.1 (dynamic client registration and PKCE are supported) and opens a browser, where the user picks
which games and which permissions to grant. After that, repeat the tool call.

Cline config (`cline_mcp_settings.json`):

```json
{
  "mcpServers": {
    "idosgames": {
      "type": "streamableHttp",
      "url": "https://site.idosgames.com/api/v2/mcp"
    }
  }
}
```

If the client cannot do OAuth for remote servers, tell the user so. The platform has no API-key fallback.

## 2. iDos Games SDK (local): game code

Requires Node.js 20+. No sign-in, no environment variables.

```json
{
  "mcpServers": {
    "idosgames-sdk": {
      "command": "npx",
      "args": ["-y", "@idosgames/mcp"]
    }
  }
}
```

Optional: `IDOSGAMES_REGISTRY_URL=https://cloud.idosgames.com/drive/registry/latest` serves the newest registry
from the CDN instead of the copy bundled in the package. The value is a base URL; do not append `/index.json`.

## Verify

- SDK: call `list_modules`. It returns a non-empty list of modules.
- Hosted: call `list_my_titles`. After sign-in it returns the games the user shared with the assistant.
- Hosted, with the "Create new apps" permission: `create_title` with a `name` creates a game; the next `list_my_titles` shows it.
