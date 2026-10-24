import type { Tool } from "@modelcontextprotocol/sdk/types.js";
import {
  encodeVideoPackage,
  readVideoPackage,
  validateAsset,
  type Asset,
  type VideoPackage,
} from "@idosgames/timeline";

// Проверка роликов и ассетов видеостудии — БЕСПЛАТНО и локально, тем же кодом, что у игроков
// (@idosgames/timeline вшит в сборку сервера): validateAsset — как при открытии из Мастерской,
// readVideoPackage — как у ссылки #videodata=. Платные шаги (режиссёр plan_video, ИИ-ассеты
// generate_asset) живут в MCP платформы (site.idosgames.com/api/v2/mcp): там кредиты издателя.

const readOnly = (title: string): Tool["annotations"] => ({
  title,
  readOnlyHint: true,
  destructiveHint: false,
  idempotentHint: true,
  openWorldHint: false,
});

export const VIDEO_TOOLS: Tool[] = [
  {
    name: "validate_asset",
    title: "Validate a video asset",
    annotations: readOnly("Validate a video asset"),
    description:
      "Check one asset of the iDos Games video studio (actor, set, prop or music — e.g. the answer of the platform " +
      "MCP's generate_asset, or one you wrote) against the asset contract the studio itself uses: ref, style, " +
      "title and tags, and the body — a voxel CharacterSpec, a 2D rig recipe (parts, colours, its own SVG art), " +
      "a cut-out picture, a scene's anchors and camera shots, https addresses. Returns ok and the issues " +
      "(error = the studio will drop the asset, warning = it works but the AI director will hardly pick it). Free, offline.",
    inputSchema: {
      type: "object",
      properties: { asset: { type: "object", description: "The asset JSON." } },
      required: ["asset"],
    },
  },
  {
    name: "validate_video",
    title: "Validate a video package",
    annotations: readOnly("Validate a video package"),
    description:
      "Check a video PACKAGE of the iDos Games video studio ({ spec, assets } — what the platform MCP's plan_video " +
      "and generate_asset return) exactly as the studio will open it: the VideoSpec (format, style, set, cast, " +
      "lines, captions, overrides), every asset, and that each own:/pack: ref of the spec is among the package's " +
      "assets (lib: refs are the studio library — see search_assets on the platform MCP). With title_id it also " +
      "returns the link that opens the package in that app's editor (https://{titleId}.idos.games/#videodata=…) — " +
      "rebuild the link after you edit the package. Free, offline.",
    inputSchema: {
      type: "object",
      properties: {
        package: { type: "object", description: "{ spec, assets } — a VideoSpec and the assets it uses." },
        title_id: { type: "string", description: "The app with the video studio, for the link (optional)." },
      },
      required: ["package"],
    },
  },
];

type Content = { ok: true; value: unknown } | { ok: false; error: string };

const TITLE_ID = /^([A-Z0-9]{8})(-DEV)?$/;

/**
 * Адрес игры по умолчанию — как `TitleHostNames` платформы (зеркало TitleHostWorker/src/host.ts):
 * `{id}.idos.games`, DEV-копия `{id}-DEV` — `{id}-dev.idos.games`.
 */
function titleOrigin(titleId: string): string | null {
  const m = TITLE_ID.exec(titleId);
  return m ? `https://${m[1]!.toLowerCase()}${m[2] ? "-dev" : ""}.idos.games` : null;
}

export async function callVideoTool(name: string, args: Record<string, unknown> | undefined): Promise<Content | null> {
  switch (name) {
    case "validate_asset": {
      const asset = args?.["asset"];
      if (!asset || typeof asset !== "object") return { ok: false, error: "validate_asset requires an 'asset' object." };
      const issues = validateAsset(asset as Asset, { inline: true });
      return { ok: true, value: { ok: !issues.some((i) => i.level === "error"), issues } };
    }
    case "validate_video": {
      const pkg = args?.["package"];
      if (!pkg || typeof pkg !== "object") return { ok: false, error: "validate_video requires a 'package' object." };
      const r = readVideoPackage(pkg);
      if (!r.ok) return { ok: true, value: { ok: false, error: r.error, issues: r.issues } };
      const errors = r.issues.filter((i) => "level" in i && i.level === "error");
      const dropped = (Array.isArray((pkg as { assets?: unknown }).assets) ? (pkg as { assets: unknown[] }).assets.length : 0) - r.value.assets.length;
      const titleId = typeof args?.["title_id"] === "string" ? args["title_id"].trim() : "";
      const origin = titleId ? titleOrigin(titleId) : null;
      const link = origin ? `${origin}/#videodata=${await encodeVideoPackage(r.value as VideoPackage)}` : null;
      return { ok: true, value: { ok: errors.length === 0, issues: r.issues, droppedAssets: dropped, link } };
    }
    default:
      return null;
  }
}
