import { Server } from "@modelcontextprotocol/sdk/server";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type Tool,
} from "@modelcontextprotocol/sdk/types.js";
import {
  getHost,
  getIndex,
  getModule,
  getSkill,
  moduleExportName,
} from "./registry.js";
import { callVideoTool, VIDEO_TOOLS } from "./video.js";

// Injected at build time from package.json (tsup.config.ts `define`). Run from source (tests, tsx) it
// is absent — hence the fallback instead of a ReferenceError.
declare const __MCP_VERSION__: string | undefined;
const SERVER_VERSION =
  typeof __MCP_VERSION__ === "string" ? __MCP_VERSION__ : "0.0.0-dev";

// The iDosGames MCP server. Tools let an AI coding agent discover and pull composable game modules,
// the host scaffold, and skills for @idosgames/core and the module contract. Tools RETURN content;
// the agent writes files into its own project (standard MCP pattern).

// Every tool only READS the registry (bundled, or the public CDN copy) and returns content — nothing
// is written anywhere. MCP catalogs (Claude's connector directory, Glama) want a human `title` and the
// behaviour hints on each tool; the title goes to both places the spec has had for it.
const readOnly = (title: string): Tool["annotations"] => ({
  title,
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

const TOOLS: Tool[] = [
  {
    name: "list_modules",
    title: "List game modules",
    annotations: readOnly("List game modules"),
    description:
      "List the composable iDosGames modules in the catalog. Each entry has id, name, type " +
      "(template = a complete ready-to-run game to start FROM, e.g. voxelcraft; feature = a capability " +
      "to add on top), engine, genre, a short summary, what it 'provides' (its features), tags, preview " +
      "media, a live demo url, and its dependency count. Read 'provides' to reuse a ready module instead " +
      "of building the feature from scratch, then get_module to pull its source. Entries may also carry " +
      "'sharedUi' ({provides, requires, drawsOwn}: shared chrome roles currency-bar | wallet | status | account | menu | modes — " +
      "the project's base (sign-in + the lobby, see get_host_scaffold) provides currency-bar, wallet, account, menu and modes, " +
      "and a game hides its own copies automatically) and 'inBase' (true: a system installed with the base in every new " +
      "project — only profile, inventory, invite, friends and quests; its screen is a tab of the lobby; every other " +
      "system is added only when the app needs it) and 'uses' (a game's modules: install them together with the game) and 'events' ({emits: [{topic, " +
      "when, payload}], listens: [{topic, why}]}). To react to another module's event, copy its payload " +
      "descriptor into your own defineTopic(topic, shape(payload)) — never import another module.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_module",
    title: "Get module source",
    annotations: readOnly("Get module source"),
    description:
      "Get one module's full source (a map of files) plus install instructions. Write each file under src/modules/{id}/, install its dependencies, and register it in src/modules.ts. Requires a host scaffold in the project (see get_host_scaffold). Its module.ts declares 'sharedUi' (roles it draws for every mode or needs) and its module.meta.json declares 'events' (topics it emits with their payload shapes, and topics it listens to).",
    inputSchema: {
      type: "object",
      properties: {
        id: { type: "string", description: "Module id, e.g. board-game" },
      },
      required: ["id"],
    },
  },
  {
    name: "list_skills",
    title: "List SDK skills",
    annotations: readOnly("List SDK skills"),
    description:
      "List available skills (name + description). Skills are instructions for working with @idosgames/core services, the module contract, and composition. Use get_skill to load one.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_skill",
    title: "Get SDK skill",
    annotations: readOnly("Get SDK skill"),
    description:
      "Get one skill's full SKILL.md content and its reference files. Load the relevant skill before writing code against that part of the SDK.",
    inputSchema: {
      type: "object",
      properties: {
        name: {
          type: "string",
          description: "Skill name, e.g. currency-system",
        },
      },
      required: ["name"],
    },
  },
  {
    name: "get_host_scaffold",
    title: "Get project scaffold",
    annotations: readOnly("Get project scaffold"),
    description:
      "Get the base every NEW project starts from — the host shell with sign-in and the lobby (index.html, main.tsx, src/app.config.ts, the wallet files, empty src/modules.ts, config; the lobby and sign-in come from @idosgames/app-shell). Write these to the project root, then add modules with get_module: the systems with inBase (profile, inventory, invite, friends, quests, mailbox), the game(s) with the modules each game 'uses', and any other system the app needs.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "get_manifest",
    title: "Get runtime package versions",
    annotations: readOnly("Get runtime package versions"),
    description:
      "Get the @idosgames runtime packages and their exact versions (core, wallet, module-sdk, react, app-shell). Install these so a seeded host/module resolves its imports.",
    inputSchema: { type: "object", properties: {} },
  },
  {
    name: "search",
    title: "Search modules and skills",
    annotations: readOnly("Search modules and skills"),
    description:
      "Keyword search across modules and skills. Matches a module on its id, name, type, engine, genre, " +
      "summary, description, what it 'provides', and tags — so you can find a ready module by the feature " +
      "you need (e.g. 'dice board', 'idle income', 'voxel building') rather than by name. Skills match on " +
      "name and description. Returns the matching catalog entries.",
    inputSchema: {
      type: "object",
      properties: { query: { type: "string", description: "Free-text query" } },
      required: ["query"],
    },
  },
  ...VIDEO_TOOLS,
];

const json = (value: unknown): CallToolResult => ({
  content: [{ type: "text", text: JSON.stringify(value, null, 2) }],
});
const fail = (message: string): CallToolResult => ({
  content: [{ type: "text", text: message }],
  isError: true,
});

function argString(
  args: Record<string, unknown> | undefined,
  key: string,
): string | null {
  const v = args?.[key];
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

// Served to the agent on connect (the initialize `instructions` field). Draws the line between the
// two iDosGames MCP surfaces: this one serves CODE; a separate backend MCP owns a live Title's DATA.
const SERVER_INSTRUCTIONS = [
  "This MCP serves the iDosGames CODE registry. Use it to WRITE a game's source:",
  "get_host_scaffold (the host shell for a new project), list_modules / search / get_module (composable",
  "game/app module source you write under src/modules/{id}/), get_manifest (exact @idosgames/* runtime",
  "versions), and list_skills / get_skill (how to code against @idosgames/core and the module contract).",
  "validate_asset / validate_video check a video-studio asset or video package with the studio's own code (free, offline).",
  "It does NOT read or change any live Title's data.",
  "To configure a live Title's settings (TitlePublicConfiguration) or generate assets",
  "(image / audio / 3D / video / text), that is a SEPARATE server — the iDosGames Title-configuration MCP:",
  "HTTP JSON-RPC at POST https://site.idosgames.com/api/v2/mcp, tools get_<field> / save_<field>",
  "and generate_*. Authorization is OAuth 2.1: connect it as a plain HTTP MCP server with NO headers",
  "and no API key — initialize and tools/list need no sign-in; the first tool call answers 401, and the",
  "client discovers the authorization server from that challenge, registers itself, and opens a browser",
  "where the publisher picks the Titles and permissions to grant.",
  '.mcp.json: {"idosgames-title": {"type": "http", "url": "https://site.idosgames.com/api/v2/mcp"}}.',
  "Rule of thumb: game CODE → this server; a Title's live config DATA and generated ASSETS → the backend v2/mcp server.",
].join(" ");

export function createServer(): Server {
  const server = new Server(
    {
      // `name` matches the Official MCP Registry entry (com.idosgames/sdk); `title`, `websiteUrl` and
      // `icons` are what catalogs and clients show. The version is the package's own (tsup `define`).
      name: "idosgames-sdk",
      title: "iDos Games SDK",
      version: SERVER_VERSION,
      websiteUrl: "https://idosgames.com/mcp",
      icons: [
        {
          src: "https://idosgames.com/images/logo512.png",
          mimeType: "image/png",
          sizes: ["512x512"],
        },
      ],
    },
    { capabilities: { tools: {} }, instructions: SERVER_INSTRUCTIONS },
  );

  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  server.setRequestHandler(CallToolRequestSchema, async (req) => {
    const { name, arguments: args } = req.params;
    try {
      switch (name) {
        case "list_modules": {
          const index = await getIndex();
          return json(index.modules);
        }
        case "get_module": {
          const id = argString(args, "id");
          if (!id) return fail("get_module requires an 'id'.");
          const mod = await getModule(id);
          const exportName = moduleExportName(id);
          return json({
            ...mod,
            instructions: [
              `Write each file to src/modules/${id}/{path}.`,
              `Install dependencies: ${Object.entries(mod.dependencies)
                .map(([n, v]) => `${n}@${v}`)
                .join(", ")}.`,
              `Register in src/modules.ts: import { ${exportName} } from "./modules/${id}"; and add ${exportName} to the modules array.`,
            ].join(" "),
          });
        }
        case "list_skills": {
          const index = await getIndex();
          return json(index.skills);
        }
        case "get_skill": {
          const skill = argString(args, "name");
          if (!skill) return fail("get_skill requires a 'name'.");
          return json(await getSkill(skill));
        }
        case "get_host_scaffold": {
          const host = await getHost();
          return json({
            ...host,
            instructions:
              "Write each file to the project root. src/modules.ts starts empty; add modules with get_module.",
          });
        }
        case "get_manifest": {
          const index = await getIndex();
          return json({
            runtimePackages: index.runtimePackages,
            generatedFromCommit: index.generatedFromCommit,
          });
        }
        case "search": {
          const query = argString(args, "query");
          if (!query) return fail("search requires a 'query'.");
          const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
          const index = await getIndex();
          const hit = (text: string) => tokens.every((t) => text.includes(t));
          const modules = index.modules.filter((m) =>
            hit(
              [
                m.id,
                m.name,
                m.type,
                m.engine,
                m.genre ?? "",
                m.summary ?? "",
                m.description ?? "",
                (m.provides ?? []).join(" "),
                (m.tags ?? []).join(" "),
              ]
                .join(" ")
                .toLowerCase(),
            ),
          );
          const skills = index.skills.filter((s) =>
            hit(`${s.name} ${s.description}`.toLowerCase()),
          );
          return json({ modules, skills });
        }
        default: {
          const video = await callVideoTool(name, args);
          if (video) return video.ok ? json(video.value) : fail(video.error);
          return fail(`Unknown tool: ${name}`);
        }
      }
    } catch (err) {
      return fail(err instanceof Error ? err.message : String(err));
    }
  });

  return server;
}
