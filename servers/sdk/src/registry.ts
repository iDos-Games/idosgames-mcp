import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

// Loads the Module & Skills Registry produced by scripts/publish-registry.mjs. Resolution order:
//   1. IDOSGAMES_REGISTRY_URL  — a hosted registry base
//      (e.g. https://cloud.idosgames.com/drive/registry/latest, published by scripts/push-registry.mjs)
//   2. IDOSGAMES_REGISTRY_DIR  — a local registry directory
//   3. the copy bundled into this package (registry/), so `npx @idosgames/mcp` works offline.

export interface ModuleMeta {
  name: string;
  /**
   * Catalog type: `template` (a complete ready-to-run game to start from) or `feature` (a capability
   * to add on top). Overrides the runtime ModuleMeta.type (game|app|ai-app) in the catalog index.
   */
  type: string;
  engine: string;
  genre?: string;
}
export interface RegistryFile {
  path: string;
  content: string;
}
/** Authored catalog metadata from module.meta.json, folded into the index by publish-registry. */
export interface ModuleCatalogFields {
  summary?: string;
  description?: string;
  /** Feature phrases the module already implements — used to reuse it instead of rebuilding. */
  provides?: string[];
  tags?: string[];
  media?: { image?: string; video?: string };
  demoUrl?: string;
  docsUrl?: string;
  author?: { name: string; url?: string };
  version?: string;
}
export interface ModuleIndexEntry extends ModuleMeta, ModuleCatalogFields {
  id: string;
  dependencies: Record<string, string>;
  fileCount: number;
}
export interface SkillIndexEntry {
  name: string;
  description: string;
}
export interface RegistryIndex {
  generatedFromCommit: string;
  runtimePackages: Record<string, string>;
  host: { id: string; fileCount: number };
  modules: ModuleIndexEntry[];
  skills: SkillIndexEntry[];
}
export interface ModuleArtifact {
  id: string;
  meta: ModuleMeta;
  dependencies: Record<string, string>;
  files: RegistryFile[];
}
export interface SkillArtifact {
  name: string;
  description: string;
  content: string;
  references: RegistryFile[];
}
export interface HostArtifact {
  id: string;
  files: RegistryFile[];
}

type Source = { kind: "url"; base: string } | { kind: "dir"; base: string };

function resolveSource(): Source {
  const url = process.env["IDOSGAMES_REGISTRY_URL"];
  if (url) return { kind: "url", base: url.replace(/\/+$/, "") };

  const dir = process.env["IDOSGAMES_REGISTRY_DIR"];
  if (dir) return { kind: "dir", base: dir };

  // Bundled: dist/cli.js sits next to ../registry/ in the published package.
  const here = fileURLToPath(new URL(".", import.meta.url));
  return { kind: "dir", base: join(here, "..", "registry") };
}

const source = resolveSource();

async function readJson<T>(relPath: string): Promise<T> {
  if (source.kind === "url") {
    const res = await fetch(`${source.base}/${relPath}`);
    if (!res.ok) throw new Error(`registry: ${relPath} -> HTTP ${res.status}`);
    return (await res.json()) as T;
  }
  return JSON.parse(readFileSync(join(source.base, relPath), "utf8")) as T;
}

let indexCache: RegistryIndex | null = null;

export async function getIndex(): Promise<RegistryIndex> {
  if (!indexCache) indexCache = await readJson<RegistryIndex>("index.json");
  return indexCache;
}

export const getModule = (id: string): Promise<ModuleArtifact> =>
  readJson<ModuleArtifact>(`modules/${id}.json`);

export const getSkill = (name: string): Promise<SkillArtifact> =>
  readJson<SkillArtifact>(`skills/${name}.json`);

export const getHost = (): Promise<HostArtifact> =>
  readJson<HostArtifact>("host.json");

/** The camelCase export name a module's index.ts exposes — must match the backend seeder's rule. */
export function moduleExportName(id: string): string {
  const parts = id.split(/[-_]/).filter(Boolean);
  return (
    parts
      .map((p, i) => (i === 0 ? p : p[0]!.toUpperCase() + p.slice(1)))
      .join("") + "Module"
  );
}
