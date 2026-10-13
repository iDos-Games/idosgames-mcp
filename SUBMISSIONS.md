# Подача в каталоги MCP — инструкция владельца

Порядок и статусы ведутся в `MCP_каталоги_iDosGames.xlsx`. Здесь: что сделать **до** подачи, готовые тексты
(вставлять как есть, они на английском) и шаги по каждому каталогу. Разбор решений —
`docs/feature-history/mcp-catalogs.md` в корне платформы.

## 0. Прежде чем подавать куда-либо

1. **Выкатить `ig-platform`** (IGE_Site_Backend). Только после этого `initialize`/`tools/list` отвечают без входа,
   а у тулов появляется `title`. Проверка (ответ 200 и `"title":"iDos Games"`):
   ```bash
   curl -s -X POST https://site.idosgames.com/api/v2/mcp -H "Content-Type: application/json" -H "Accept: application/json, text/event-stream" -d "{\"jsonrpc\":\"2.0\",\"id\":1,\"method\":\"initialize\",\"params\":{\"protocolVersion\":\"2025-06-18\",\"capabilities\":{},\"clientInfo\":{\"name\":\"probe\",\"version\":\"0\"}}}"
   ```
   Если какой-то клиент сломался — настройка приложения `MCP_PUBLIC_DISCOVERY=false` вернёт прежний вход без выката.
2. **Выпустить `@idosgames/mcp` 0.1.34** (`npm run release -- --dry-run`, потом `npm run release` в iDosGamesSDK_TS):
   в нём поле `mcpName`, без которого Official Registry откажет npm-серверу.
3. **Создать публичный репо `iDos-Games/idosgames-mcp`**, вписать свой GitHub-логин в `glama.json` вместо
   `REPLACE_WITH_GITHUB_LOGIN`, залить содержимое этой папки.
4. **Cloudflare, зона idosgames.com → Rules → URL Rewrite**: третье правило рядом с OAuth-правилами,
   `https://site.idosgames.com/.well-known/security.txt` → static `api/.well-known/security.txt`
   (нужно MCPBundles для подтверждения владельца).
5. **Cloudflare → Security → Bots**: убедиться, что Bot Fight Mode не отвечает 403 сканерам каталогов
   (`SmitheryBot/1.0` и др.). Иначе Smithery пишет «Initialization failed with status 403».

## 1. Готовые тексты

| Поле | Текст |
|---|---|
| Name | `iDos Games` (SDK: `iDos Games SDK`) |
| Short (≤100) | `Configure and ship web games on iDos Games: live config, AI assets, task board, builds.` |
| Short SDK (≤100) | `Game modules, project scaffold and SDK skills for building web games on iDos Games.` |
| One-liner (≤200) | `Let your AI assistant run your iDos Games web games: update live game config, generate images, audio, video and 3D assets, manage your task board and ship builds.` |
| Categories | Game Development; Developer Tools |
| Tags | games, game-backend, liveops, game-config, ai-assets, gamedev |
| URL сервера | `https://site.idosgames.com/api/v2/mcp` (Streamable HTTP, OAuth 2.1) |
| npm | `npx -y @idosgames/mcp` |
| Repo | `https://github.com/iDos-Games/idosgames-mcp` |
| Docs | `https://idosgames.com/mcp` |
| Privacy / Terms | `https://idosgames.com/privacy` / `https://idosgames.com/terms` |
| Support | `https://idosgames.com/mcp#support`, help@idos.games |
| Logo | `assets/logo-400.png` (400×400), `assets/logo-512.png`, URL `https://idosgames.com/images/logo512.png` |

**Long description (≤2000)**

```
iDos Games is a backend and publishing platform for web games. This connector links your iDos Games account so the assistant can work on the games you choose to share with it.

What it can do:
- Find your games by name and see what the assistant is allowed to do in each.
- Read and update a game's configuration: virtual currencies, item catalog, store, lootboxes, quests, timed and co-op events, seasons, leaderboards, crafting, rewards, tutorials, A/B experiments and more. Each section is saved on its own, the rest of the configuration stays untouched.
- Manage the game's shared key-value data and its localization keys.
- Publish server-side game logic (CloudCode).
- Generate assets with AI: images, speech, music, short videos, 3D models and text (billed to your account's credits; the assistant can check the price first).
- Keep your task board up to date: projects, columns, cards, assignees and comments.
- Upload a ready web build, get a test link, then put it live for players.

Access is granted with OAuth: on the first tool call you sign in, pick which games and which permissions the assistant gets, and you can revoke it at any time in Connected apps on platform.idosgames.com.

For writing game code there is a companion local server, iDos Games SDK (npx -y @idosgames/mcp): composable game modules, the project scaffold and SDK skills.
```

## 2. Official MCP Registry — первым: от него питаются PulseMCP, GitHub MCP Registry, MCPCentral

Namespace `com.idosgames/*` подтверждается TXT-записью домена `idosgames.com`.

```bash
# 1) mcp-publisher: https://github.com/modelcontextprotocol/registry/releases (windows_amd64 / darwin / linux)
# 2) ключ (key.pem НЕ коммитить: он в .gitignore; хранить как пароль)
openssl genpkey -algorithm Ed25519 -out key.pem
# 3) строка для DNS: Cloudflare → idosgames.com → DNS → TXT, имя @, значение — то, что в кавычках
echo "v=MCPv1; k=ed25519; p=$(openssl pkey -in key.pem -pubout -outform DER | tail -c 32 | base64)"
# 4) вход (после того как TXT-запись видна: nslookup -type=TXT idosgames.com)
mcp-publisher login dns --domain idosgames.com --private-key $(openssl pkey -in key.pem -noout -text | grep -A3 "priv:" | tail -n +2 | tr -d ' :\n')
# 5) публикация — из папки каждого сервера
cd servers/platform && mcp-publisher publish
cd ../sdk && mcp-publisher publish   # только ПОСЛЕ npm 0.1.34: реестр сверяет mcpName в опубликованном пакете
```

Любая правка текста позже — поднять `version` в нужном `server.json` (хотя бы патч) и снова `mcp-publisher publish`.
Для sdk `version` = версия npm-пакета.

## 3. Каталог коннекторов Claude — https://claude.ai/directory/manage → Submit new → MCP connector

- **Connection**: `https://site.idosgames.com/api/v2/mcp`, один адрес для всех.
- **Tools**: подтянутся сами. У каждого тула `title` + `readOnlyHint`/`destructiveHint`, флажков быть не должно.
- **Listing**: тексты из п.1, иконка `logo-512.png`, slug `idos-games` (slug навсегда).
- **Use cases**: что нужно пользователю — аккаунт iDos Games (бесплатный) и хотя бы одна игра; данные — read и write.
- **Authentication**: OAuth with dynamic client registration. Отметить, что сервер стартует без входа, а вход
  запрашивается на первом вызове тула (lazy auth).
- **Data handling**: API наш собственный; персональных медицинских данных и спонсорского контента нет.
- **Test & launch**: тестовый аккаунт издателя с заполненной игрой (валюты, магазин, квесты), без 2FA и кодов
  на почту. Подтвердить, что каждый тул вызывали в custom connector.
- **Compliance**: семь подтверждений. Учесть: генерация медиа ИИ — да (платная, кредиты издателя); финансовые
  операции — тулы не переводят деньги, но генерация списывает кредиты, а `save_blockchain`/`save_purchase`
  меняют настройки оплат игры.

Сначала добавить сервер себе как custom connector (Settings → Connectors) и пройти все тулы: список виден без
входа, первый вызов показывает карточку Connect, после входа вызов повторяется сам.

## 4. ChatGPT / Codex (каталог плагинов OpenAI)

Всё уже подготовлено в `iDosGamesSDK_TS/plugins/openai` (`npm run pack:openai-plugin`), чек-лист и кейсы — в
его README. Подавать после выката (п.0.1), чтобы скан увидел `title` у тулов. Токен домена —
`OPENAI_APPS_CHALLENGE_TOKEN` + правило Cloudflare (см. `docs/feature-history/chatgpt-plugin.md`).

## 5. Крупные каталоги

| Каталог | Что делать |
|---|---|
| **Glama** (glama.ai/mcp/servers) | Войти через GitHub → Add MCP Server → URL репо. `glama.json` подтверждает владельца, `Dockerfile` запускает SDK-сервер для проверки тулов. Удалённый сервер Glama находит по `tools/list` без входа. |
| **Smithery** | `smithery.ai/new` → URL `https://site.idosgames.com/api/v2/mcp` (или CLI `smithery mcp publish "https://site.idosgames.com/api/v2/mcp" -n idosgames/platform`). Скан без входа должен увидеть все тулы. |
| **PulseMCP** | Подтянет из Official Registry. Если через неделю нет — форма pulsemcp.com/submit. |
| **mcp.so** | Кнопка Submit (или issue в github.com/chatmcp/mcpso): имя, short, repo, URL сервера. |
| **awesome-mcp-servers** (punkpeye) | PR в README, раздел **🎮 Gaming**, по алфавиту: строка ниже. |
| **LobeHub** | lobehub.com/mcp → Submit MCP: repo + URL сервера. |
| **MCP Market** | mcpmarket.com → Submit, категория Game Development. |
| **mcpservers.org** | Форма Submit: short + repo. |

Строка для awesome-mcp-servers:

```
- [iDos-Games/idosgames-mcp](https://github.com/iDos-Games/idosgames-mcp) 🎖️ 📇 ☁️ 🏠 - Official iDos Games servers: configure live web games (currencies, store, quests, events, leaderboards), generate AI assets, manage the task board and ship builds; plus game modules and SDK skills for coding agents.
```

## 6. Средние и небольшие

| Каталог | Что делать |
|---|---|
| **Cline Marketplace** | Issue в github.com/cline/mcp-marketplace: ссылка на репо, `assets/logo-400.png`, почему полезен (тексты п.1). `llms-install.md` уже в репо. |
| **MCPBundles** | Найдёт сервер сам. Claim: код придёт на help@idos.games из `security.txt` (нужно правило Cloudflare из п.0.4). |
| **GitHub MCP Registry / VS Code** | Подтянет из Official Registry. |
| **Cursor Directory** | cursor.directory/mcp → форма; конфиг — блок Cursor из README. |
| **Windsurf, OpenTools, MCP.Directory, Claude Market, MCPCentral, MCPHub, MCP Server Finder, MCP-Server-Directory, MCPServer.directory, ClaudePro.directory (issue), AI Agents List, AIBase, MCP.ing, Portkey** | Тексты из п.1 + repo + URL сервера. |
| **MCP Hunt** | Launch: short, long, логотип, 2–3 скриншота (подключение в Claude + результат тула). |
| **Docker MCP Catalog** | Низкий приоритет: PR в github.com/docker/mcp-registry, есть `Dockerfile` для SDK-сервера. |
| **Reddit / Product Hunt / Show HN / DEV.to** | Пост о задаче и демо («собрать и выкатить игру из Claude за 10 минут»), не просто ссылка. |
