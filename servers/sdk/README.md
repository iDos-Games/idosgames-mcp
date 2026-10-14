# iDos Games SDK MCP server (source)

Source of the npm package [`@idosgames/mcp`](https://www.npmjs.com/package/@idosgames/mcp): a local (stdio) MCP
server that gives AI coding agents the iDos Games game modules, the host scaffold and SDK skills.

- `src/server.ts` — the 7 tools (`list_modules`, `get_module`, `list_skills`, `get_skill`, `get_host_scaffold`,
  `get_manifest`, `search`), all read-only.
- `src/registry.ts` — reads the registry from the bundled `registry/` folder, a local folder
  (`IDOSGAMES_REGISTRY_DIR`) or a URL (`IDOSGAMES_REGISTRY_URL`).
- `src/cli.ts` — stdio entry point.

The registry data (module sources and skills, about 6 MB) is generated from the private iDos Games SDK
repository at release time and shipped inside the npm package; it is not part of this repository. Without it the
server starts and answers, but returns an empty catalog unless one of the two environment variables is set.

```bash
npx -y @idosgames/mcp          # run the published package
npm install && npm run build   # build this source (dist/cli.js)
```

MIT licensed.
