// Нужно ли публиковать server.json в Official MCP Registry — и готово ли для этого всё вокруг.
//
//   node scripts/registry-plan.mjs servers/sdk/server.json
//
// Код выхода:
//   0  — версии в реестре ещё нет, её npm-пакет уже в npm: публиковать;
//   10 — эта версия уже в реестре: пропустить (повторная публикация той же версии — ошибка реестра);
//   1  — сбой (реестр не ответил, npm-пакет так и не появился за NPM_WAIT_SECONDS и т.п.).
//
// ⚠ Реестр проверяет npm-пакет при публикации (версия существует и в нём `mcpName`), поэтому
// пакет обязан быть в npm раньше записи. Пуш сюда мог случиться до `npm run release` в SDK —
// тогда ждём пакет, а не падаем сразу (NPM_WAIT_SECONDS, по умолчанию 15 минут).

import { readFileSync } from "node:fs";

const REGISTRY = process.env.MCP_REGISTRY_URL ?? "https://registry.modelcontextprotocol.io";
const NPM_WAIT_SECONDS = Number(process.env.NPM_WAIT_SECONDS ?? 900);

const file = process.argv[2];
if (!file) {
  console.error("usage: node scripts/registry-plan.mjs <server.json>");
  process.exit(1);
}

const server = JSON.parse(readFileSync(file, "utf8"));
const { name, version } = server;
if (!name || !version) {
  console.error(`${file}: no name/version`);
  process.exit(1);
}

/** Все версии записи в реестре (поиск по имени, с постраничным курсором). */
async function registryVersions(serverName) {
  const versions = new Set();
  let cursor = null;
  for (let page = 0; page < 20; page++) {
    const url = new URL("/v0/servers", REGISTRY);
    url.searchParams.set("search", serverName);
    if (cursor) url.searchParams.set("cursor", cursor);
    const res = await fetch(url);
    if (!res.ok) throw new Error(`registry ${res.status} ${await res.text()}`);
    const body = await res.json();
    for (const item of body.servers ?? []) {
      const s = item.server ?? item;
      if (s.name === serverName && s.version) versions.add(s.version);
    }
    cursor = body.metadata?.nextCursor ?? null;
    if (!cursor) break;
  }
  return versions;
}

/** Версия npm-пакета опубликована (метаданные реестра npm). */
async function npmHasVersion(identifier, ver) {
  const res = await fetch(`https://registry.npmjs.org/${identifier.replace("/", "%2F")}/${encodeURIComponent(ver)}`);
  return res.ok;
}

try {
  const published = await registryVersions(name);
  if (published.has(version)) {
    console.log(`${name}@${version}: already in the registry — skip`);
    process.exit(10);
  }

  const npmPackages = (server.packages ?? []).filter((p) => p.registryType === "npm");
  for (const pkg of npmPackages) {
    const deadline = Date.now() + NPM_WAIT_SECONDS * 1000;
    while (!(await npmHasVersion(pkg.identifier, pkg.version))) {
      if (Date.now() > deadline) {
        console.error(`${pkg.identifier}@${pkg.version} is not on npm after ${NPM_WAIT_SECONDS}s — release the SDK first`);
        process.exit(1);
      }
      console.log(`waiting for ${pkg.identifier}@${pkg.version} on npm…`);
      await new Promise((r) => setTimeout(r, 30_000));
    }
  }

  console.log(`${name}@${version}: not in the registry yet (has: ${[...published].join(", ") || "none"}) — publish`);
  process.exit(0);
} catch (e) {
  console.error(`${name}: ${e instanceof Error ? e.message : e}`);
  process.exit(1);
}
