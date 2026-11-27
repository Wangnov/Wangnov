// agentsmirror.com umbrella hub worker.
//
// Responsibilities:
// 1. Canonical 301 redirect from www.agentsmirror.com/* -> https://agentsmirror.com/*
// 2. /api/overview.json: read-only edge-cached telemetry across R2 buckets
//    (codex-app-mirror, codex-app-manager, claude-app-mirror)
// 3. Static pages & SEO/GEO files (/, /en/, /robots.txt, /sitemap.xml, /llms.txt)
//    served directly via Workers Static Assets (env.ASSETS).

const TTL_SECONDS = 300;

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.hostname === "www.agentsmirror.com") {
      const target = new URL(url.pathname + url.search, "https://agentsmirror.com");
      return Response.redirect(target.toString(), 301);
    }

    if (url.pathname === "/api/overview.json") {
      return serveOverview(request, env, ctx);
    }

    return env.ASSETS.fetch(request);
  },
};

async function serveOverview(request, env, ctx) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    return new Response("Method Not Allowed", {
      status: 405,
      headers: { allow: "GET, HEAD" },
    });
  }

  const cache = caches.default;
  const cacheKey = new Request("https://agentsmirror.com/api/overview.json");
  let response = await cache.match(cacheKey);

  if (!response) {
    const body = await buildOverview(env);
    const ok = Boolean(body.codex || body.claude);
    response = new Response(JSON.stringify(body), {
      status: ok ? 200 : 503,
      headers: {
        "content-type": "application/json; charset=utf-8",
        "cache-control": ok ? `public, max-age=60, s-maxage=${TTL_SECONDS}` : "no-store",
        "x-content-type-options": "nosniff",
      },
    });
    if (ok) {
      ctx.waitUntil(cache.put(cacheKey, response.clone()));
    }
  }

  return request.method === "HEAD" ? new Response(null, response) : response;
}

async function buildOverview(env) {
  const [codexManifest, codexStats, managerLatest, claudeManifest, claudeStats] =
    await Promise.allSettled([
      readJSON(env.CODEX_MIRROR_BUCKET, "latest/manifest"),
      readJSON(env.CODEX_MIRROR_BUCKET, "stats/state.json"),
      readJSON(env.CODEX_MANAGER_BUCKET, "latest.json"),
      readJSON(env.CLAUDE_MIRROR_BUCKET, "latest/manifest"),
      readJSON(env.CLAUDE_MIRROR_BUCKET, "stats/state.json"),
    ]);

  const codexDownloads =
    codexStats.status === "fulfilled" && typeof codexStats.value?.total === "number"
      ? codexStats.value.total
      : null;
  const claudeDownloads =
    claudeStats.status === "fulfilled" && typeof claudeStats.value?.total === "number"
      ? claudeStats.value.total
      : null;

  const totalDownloads =
    (codexDownloads ?? 0) + (claudeDownloads ?? 0) > 0
      ? (codexDownloads ?? 0) + (claudeDownloads ?? 0)
      : null;

  return {
    generatedAt: new Date().toISOString(),
    totals: {
      installerDownloads: totalDownloads,
      pollingIntervalMinutes: 15,
    },
    codex:
      codexManifest.status === "fulfilled" && codexManifest.value
        ? {
            version: codexManifest.value.codexVersion ?? null,
            publishedAt: codexManifest.value.publishedAt ?? null,
            downloads: codexDownloads,
            managerVersion:
              managerLatest.status === "fulfilled" && managerLatest.value?.version
                ? String(managerLatest.value.version).replace(/^v/, "")
                : null,
          }
        : codexDownloads !== null
          ? { version: null, publishedAt: null, downloads: codexDownloads, managerVersion: null }
          : null,
    claude:
      claudeManifest.status === "fulfilled" && claudeManifest.value
        ? {
            version: claudeManifest.value.version ?? null,
            generatedAt: claudeManifest.value.generatedAt ?? null,
            downloads: claudeDownloads,
          }
        : claudeDownloads !== null
          ? { version: null, generatedAt: null, downloads: claudeDownloads }
          : null,
  };
}

async function readJSON(bucket, key) {
  if (!bucket) return null;
  const obj = await bucket.get(key);
  return obj ? obj.json() : null;
}
