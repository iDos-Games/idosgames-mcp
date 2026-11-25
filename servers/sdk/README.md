# @idosgames/mcp

An MCP server that serves the **iDosGames Module & Skills Registry** to AI coding agents
(Claude Code, Codex, Cursor, …). It lets an agent discover and pull composable game **modules** and
the **host scaffold**, and load **skills** for `@idosgames/core`, the module contract, and
composition.

## Add it to your agent

Runs over stdio via `npx` — no install needed:

```jsonc
{
  "mcpServers": {
    "idosgames": {
      "command": "npx",
      "args": ["-y", "@idosgames/mcp"],
    },
  },
}
```

- **Claude Code**: `claude mcp add idosgames -- npx -y @idosgames/mcp`
- **Cursor / Codex / others**: add the JSON above to the client's MCP config.

The registry is bundled in the package, so it works offline. To point at the hosted registry instead
(always the newest, published to the CDN by `npm run push:registry`), set:

```
IDOSGAMES_REGISTRY_URL=https://cloud.idosgames.com/drive/registry/latest
```

## Tools

| Tool                | Purpose                                                      |
| ------------------- | ------------------------------------------------------------ |
| `list_modules`      | Catalog of modules (id, name, type, engine, genre, deps)     |
| `get_module {id}`   | One module's full source + install/registration instructions |
| `list_skills`       | Available skills (name + description)                        |
| `get_skill {name}`  | A skill's full `SKILL.md` + reference files                  |
| `get_host_scaffold` | The host-shell files for a new project                       |
| `get_manifest`      | `@idosgames` runtime packages + exact versions               |
| `search {query}`    | Keyword search over modules and skills                       |
| `validate_asset`    | Check a video-studio asset with the studio's own validator   |
| `validate_video`    | Check a video package `{ spec, assets }`; `title_id` → link  |
| `get_local_wallet`  | Addresses of the wallets this server can sign with           |
| `build_launch_tx`   | Hosted `build_token_launch_tx` answer → unsigned transactions |
| `send_launch_tx`    | Sign and send that launch with the local key                 |
| `quote_token_trade` | Live quote for buying or selling a game's token              |
| `build_token_trade` | Unsigned buy or sell for a wallet you control                |
| `send_token_trade`  | Buy or sell with the local key                               |

Tools **return** content; the agent writes files into its own project (standard MCP pattern). A
typical flow: `get_host_scaffold` → write to root → `get_module {id}` for each chosen module → write
to `src/modules/{id}/` and register in `src/modules.ts` → install `get_manifest` versions.

`validate_asset` / `validate_video` run the code of `@idosgames/timeline` bundled into this server —
the same checks a player's studio makes when it opens a video, free and offline. The paid steps
(`plan_video`, `generate_asset`) are on the platform server below.

## Game tokens from your own wallet

The token tools use [`@idosgames/token`](https://www.npmjs.com/package/@idosgames/token) (EVM Uniswap V4 and
Solana). The hosted server checks and reserves a launch (`prepare_token_launch`, `build_token_launch_tx`) and
finishes it (`submit_launch_tx`); this server builds the transactions on your computer and, if you give it a key,
signs them. Keys come only from this server's environment and never leave your computer:

| Variable | Value |
| --- | --- |
| `IDOSGAMES_EVM_PRIVATE_KEY` / `IDOSGAMES_EVM_KEY_FILE` | `0x…` key, or a path to a file with it |
| `IDOSGAMES_SOLANA_KEYPAIR` / `IDOSGAMES_SOLANA_PRIVATE_KEY` | path to a solana-keygen JSON file, or that JSON array |

No spending caps: every `send_*` call spends from that wallet exactly what it asks for.

## The second iDos Games server

This server serves game **code**. A Title's live **data** — its configuration, AI-generated assets, the
publisher's task board and build uploads — is a separate hosted server:
`https://site.idosgames.com/api/v2/mcp` (Streamable HTTP, OAuth 2.1; connect it with no headers — the
first tool call starts the sign-in). Both are listed at
[github.com/iDos-Games/idosgames-mcp](https://github.com/iDos-Games/idosgames-mcp) and documented at
[idosgames.com/mcp](https://idosgames.com/mcp).

## License

MIT
