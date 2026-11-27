// Static site builder for agentsmirror.com (zero external runtime dependencies;
// uses sharp from sibling workspace if available to rasterize 1200x630 OG PNGs,
// and pins exact inline JSON-LD SHA-256 hashes into dist/_headers).

import { createHash } from "node:crypto";
import { cp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { COPY } from "../site/copy.mjs";

const ROOT = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.join(ROOT, "dist");
const PUBLIC = path.join(ROOT, "public");

function esc(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function hashShort(buf) {
  return createHash("sha256").update(buf).digest("hex").slice(0, 10);
}

function renderTopologySvg(t) {
  const isZh = t.htmlLang.startsWith("zh");
  const upLabel = isZh ? "官方上游源" : "Official Upstreams";
  const probeLabel = isZh ? "15m 探测 & SHA-256" : "15m Probe & SHA-256";
  const edgeLabel = isZh ? "双层智能路由" : "Geo-Steered Edge";
  const cnNode = isZh ? "大陆高速节点 (S3)" : "CN Fast Mirror (S3)";
  const glNode = isZh ? "全球边缘 (CF R2)" : "Global Edge (CF R2)";

  return `<svg class="topology-svg" viewBox="0 0 440 210" width="440" height="210" role="img" aria-label="${esc(t.topoTitle)}">
    <defs>
      <style>
        .tp-box { fill: var(--surface-raised); stroke: var(--line-strong); stroke-width: 1.2; }
        .tp-accent { fill: var(--accent-soft); stroke: var(--accent); stroke-width: 1.3; }
        .tp-line { stroke: var(--line-strong); stroke-width: 1.3; fill: none; stroke-dasharray: 3 3; }
        .tp-solid { stroke: var(--accent); stroke-width: 1.5; fill: none; }
        .tp-title { fill: var(--ink); font-family: var(--font-sans); font-size: 11px; font-weight: 600; }
        .tp-sub { fill: var(--ink-3); font-family: var(--font-mono); font-size: 9.5px; }
      </style>
    </defs>
    <rect class="tp-box" x="10" y="20" width="124" height="52" rx="10"/>
    <text class="tp-title" x="22" y="42">${esc(upLabel)}</text>
    <text class="tp-sub" x="22" y="58">OpenAI · Anthropic</text>

    <rect class="tp-box" x="10" y="88" width="124" height="52" rx="10"/>
    <text class="tp-title" x="22" y="110">Astral · GitHub</text>
    <text class="tp-sub" x="22" y="126">uv · Python · CLIs</text>

    <path class="tp-line" d="M134 46 H162 V92 H174"/>
    <path class="tp-line" d="M134 114 H162 V98 H174"/>

    <rect class="tp-accent" x="174" y="64" width="118" height="62" rx="12"/>
    <text class="tp-title" x="186" y="90">${esc(probeLabel)}</text>
    <text class="tp-sub" x="186" y="108">GitHub Actions CI</text>

    <path class="tp-solid" d="M292 95 H314"/>
    <path class="tp-solid" d="M306 95 V50 H322"/>
    <path class="tp-solid" d="M306 95 V140 H322"/>

    <rect class="tp-box" x="322" y="24" width="108" height="52" rx="10"/>
    <text class="tp-title" x="332" y="46">${esc(cnNode)}</text>
    <text class="tp-sub" x="332" y="62">302 Presigned</text>

    <rect class="tp-box" x="322" y="114" width="108" height="52" rx="10"/>
    <text class="tp-title" x="332" y="136">${esc(glNode)}</text>
    <text class="tp-sub" x="332" y="152">Zero-Mod Binary</text>

    <text class="tp-sub" x="12" y="192">${esc(edgeLabel)} · codexapp / claudeapp / uv .agentsmirror.com</text>
  </svg>`;
}

function buildJsonLd(t) {
  const graph = [
    {
      "@type": "Person",
      "@id": "https://agentsmirror.com/#wangnov",
      name: "Wangnov",
      url: "https://agentsmirror.com/",
      sameAs: ["https://github.com/Wangnov"],
      jobTitle:
        t.htmlLang === "zh-CN"
          ? "独立 AI Agent 工程师 & FDE 风格企业 AI-Native 转型顾问"
          : "Independent AI Agent Engineer & FDE-Style Enterprise AI-Native Consultant",
      homeLocation: {
        "@type": "Place",
        name: "Shanghai, China",
      },
      knowsAbout: [
        "AI Agents",
        "Claude Code",
        "OpenAI Codex",
        "Enterprise AI-Native Transformation",
        "Forward Deployed Engineering",
        "Cloudflare Workers",
        "AWS Bedrock",
        "Rust",
        "TypeScript",
        "Python uv",
      ],
    },
    {
      "@type": "Organization",
      "@id": "https://agentsmirror.com/#organization",
      name: "agentsmirror",
      url: "https://agentsmirror.com/",
      logo: "https://agentsmirror.com/favicon.svg",
      founder: { "@id": "https://agentsmirror.com/#wangnov" },
      sameAs: [
        "https://github.com/Wangnov",
        "https://codexapp.agentsmirror.com/",
        "https://claudeapp.agentsmirror.com/",
      ],
    },
    {
      "@type": "WebSite",
      "@id": "https://agentsmirror.com/#website",
      name: "agentsmirror",
      alternateName: ["agentsmirror.com", "Wangnov Mirror Infrastructure"],
      url: "https://agentsmirror.com/",
      inLanguage: ["zh-CN", "en"],
      publisher: { "@id": "https://agentsmirror.com/#wangnov" },
    },
    {
      "@type": "ItemList",
      "@id": `${t.canonical}#mirror-list`,
      name: t.mirrorsSection.title,
      itemListElement: [
        {
          "@type": "ListItem",
          position: 1,
          item: {
            "@type": "SoftwareApplication",
            name: "Codex App Mirror & Codex App Manager",
            url: "https://codexapp.agentsmirror.com/",
            applicationCategory: "DeveloperApplication",
            operatingSystem: "macOS, Windows",
            author: { "@id": "https://agentsmirror.com/#wangnov" },
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          },
        },
        {
          "@type": "ListItem",
          position: 2,
          item: {
            "@type": "SoftwareApplication",
            name: "Claude Desktop App Mirror (claude-app-mirror)",
            url: "https://claudeapp.agentsmirror.com/",
            applicationCategory: "DeveloperApplication",
            operatingSystem: "macOS, Windows, Linux",
            author: { "@id": "https://agentsmirror.com/#wangnov" },
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          },
        },
        {
          "@type": "ListItem",
          position: 3,
          item: {
            "@type": "SoftwareApplication",
            name: "uv-custom (Astral uv & Python Runtime Mirror)",
            url: "https://github.com/Wangnov/uv-custom",
            downloadUrl: "https://uv.agentsmirror.com/install-cn.sh",
            applicationCategory: "DeveloperApplication",
            operatingSystem: "macOS, Linux, Windows",
            author: { "@id": "https://agentsmirror.com/#wangnov" },
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          },
        },
        {
          "@type": "ListItem",
          position: 4,
          item: {
            "@type": "SoftwareApplication",
            name: "claude-code-statusline-pro",
            url: "https://github.com/Wangnov/claude-code-statusline-pro",
            applicationCategory: "DeveloperApplication",
            operatingSystem: "macOS, Linux, Windows",
            author: { "@id": "https://agentsmirror.com/#wangnov" },
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          },
        },
      ],
    },
    {
      "@type": "FAQPage",
      "@id": `${t.canonical}#faq`,
      mainEntity: t.faqSection.items.map((item) => ({
        "@type": "Question",
        name: item.q,
        acceptedAnswer: {
          "@type": "Answer",
          text: item.a,
        },
      })),
    },
  ];

  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}

function renderPage(t, assets, ogPath) {
  const ogUrl = `https://agentsmirror.com${ogPath}`;
  const cardsHtml = t.mirrorsSection.cards
    .map(
      (c) => `
        <div class="mirror-card-wrap">
          <article class="mirror-card">
            <div>
              <div class="mirror-top">
                <span class="card-index">${esc(c.index)}</span>
                <a class="domain-badge" data-tone="${esc(c.tone)}" href="${esc(c.href)}">${esc(c.domain)}</a>
              </div>
              <h3><a href="${esc(c.href)}">${esc(c.title)}</a></h3>
              <p class="mirror-summary">${esc(c.summary)}</p>
              <div class="meta-pills">
                ${c.pills.map((p) => `<span class="meta-pill">${esc(p)}</span>`).join("")}
              </div>
            </div>
            <div>
              <div class="cmd-box">
                <code>${esc(c.cmd)}</code>
                <button class="copy-btn" type="button" data-copy="${esc(c.cmd)}">${esc(t.mirrorsSection.copyBtn)}</button>
              </div>
              <div class="card-links">
                <div class="card-links-group">
                  ${c.links.map(([label, href]) => `<a href="${esc(href)}">${esc(label)}</a>`).join("")}
                </div>
                <a class="card-cta" href="${esc(c.href)}">${esc(c.ctaLabel)}</a>
              </div>
            </div>
          </article>
        </div>`,
    )
    .join("");

  const toolsHtml = t.toolingSection.tools
    .map(
      (tool) => `
        <div class="tool-card-wrap">
          <article class="tool-card">
            <div>
              <div class="tool-head">
                <h3><a href="${esc(tool.href)}">${esc(tool.name)}</a></h3>
                <span class="tool-tag">${esc(tool.tag)}</span>
              </div>
              <p>${esc(tool.desc)}</p>
            </div>
            <div class="tool-foot">${esc(tool.foot)}</div>
          </article>
        </div>`,
    )
    .join("");

  const ledgerHtml = t.ledger
    .map(
      (cell) => `
        <div class="ledger-cell">
          <p class="ledger-val"${cell.valAttr ? ` data-live="${esc(cell.valAttr)}"` : ""}>${esc(cell.defaultVal)}</p>
          <p class="ledger-label">${esc(cell.label)}</p>
          <p class="ledger-note">${esc(cell.note)}</p>
        </div>`,
    )
    .join("");

  const faqHtml = t.faqSection.items
    .map(
      (item, idx) => `
        <details class="faq-item"${idx === 0 ? " open" : ""}>
          <summary>${esc(item.q)}</summary>
          <div class="faq-answer">${esc(item.a)}</div>
        </details>`,
    )
    .join("");

  return `<!doctype html>
<html lang="${esc(t.htmlLang)}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <title>${esc(t.title)}</title>
  <meta name="description" content="${esc(t.description)}">
  <meta name="author" content="Wangnov">
  <link rel="canonical" href="${esc(t.canonical)}">
  <link rel="author" href="https://github.com/Wangnov">
  <link rel="alternate" hreflang="zh-CN" href="https://agentsmirror.com/">
  <link rel="alternate" hreflang="en" href="https://agentsmirror.com/en/">
  <link rel="alternate" hreflang="x-default" href="https://agentsmirror.com/">
  <meta property="og:type" content="website">
  <meta property="og:site_name" content="agentsmirror">
  <meta property="og:title" content="${esc(t.title)}">
  <meta property="og:description" content="${esc(t.description)}">
  <meta property="og:url" content="${esc(t.canonical)}">
  <meta property="og:image" content="${esc(ogUrl)}">
  <meta property="og:image:width" content="1200">
  <meta property="og:image:height" content="630">
  <meta property="og:locale" content="${esc(t.ogLocale)}">
  <meta property="og:locale:alternate" content="${esc(t.ogAltLocale)}">
  <meta name="twitter:card" content="summary_large_image">
  <meta name="twitter:title" content="${esc(t.title)}">
  <meta name="twitter:description" content="${esc(t.description)}">
  <meta name="twitter:image" content="${esc(ogUrl)}">
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${esc(assets.css)}">
  <script type="application/ld+json">${buildJsonLd(t)}</script>
</head>
<body>
  <a class="skip-link" href="#main">${esc(t.skipLink)}</a>
  <header class="site-header">
    <div class="container header-inner">
      <a class="brand" href="${esc(t.canonical === "https://agentsmirror.com/" ? "/" : "/en/")}">
        <img class="brand-mark" src="/favicon.svg" alt="" width="28" height="28">
        <span>agentsmirror</span>
        <span class="brand-sub">${esc(t.brandSub)}</span>
      </a>
      <nav class="primary-nav" aria-label="Primary">
        ${t.nav.map(([h, label]) => `<a href="${esc(h)}">${esc(label)}</a>`).join("")}
      </nav>
      <div class="header-actions">
        <button class="pill-btn" type="button" data-theme-toggle aria-label="Theme">◐</button>
        <a class="pill-btn" href="${esc(t.altHref)}" hreflang="${t.htmlLang === "zh-CN" ? "en" : "zh-CN"}" aria-label="${esc(t.altAria)}">${esc(t.altLabel)}</a>
        <a class="pill-btn" href="https://github.com/Wangnov">GitHub</a>
      </div>
    </div>
  </header>

  <main id="main">
    <section class="hero">
      <div class="container">
        <div class="eyebrow">
          <span class="live-dot" aria-hidden="true"></span>
          <span>${esc(t.eyebrow)}</span>
        </div>
        <div class="hero-layout">
          <div>
            <h1>${esc(t.h1)}</h1>
            <p class="hero-lead">${t.leadHtml}</p>
            <div class="hero-actions">
              <a class="btn btn-primary" href="#mirrors">${esc(t.ctaPrimary)}</a>
              <a class="btn btn-secondary" href="https://codexapp.agentsmirror.com/${t.htmlLang === "en" ? "en/" : ""}">${esc(t.ctaCodex)}</a>
              <a class="btn btn-secondary" href="https://claudeapp.agentsmirror.com/${t.htmlLang === "en" ? "en/" : ""}">${esc(t.ctaClaude)}</a>
            </div>
          </div>
          <div class="topology-card">
            <div class="topology-head">
              <span>${esc(t.topoTitle)}</span>
              <span class="mono">${esc(t.topoTag)}</span>
            </div>
            ${renderTopologySvg(t)}
          </div>
        </div>

        <div class="ledger" role="region" aria-label="Telemetry">
          ${ledgerHtml}
        </div>
      </div>
    </section>

    <section class="section" id="mirrors">
      <div class="container">
        <div class="section-head">
          <div>
            <span class="section-kicker">${esc(t.mirrorsSection.kicker)}</span>
            <h2>${esc(t.mirrorsSection.title)}</h2>
          </div>
          <p class="section-desc">${esc(t.mirrorsSection.desc)}</p>
        </div>
        <div class="matrix-grid">
          ${cardsHtml}
        </div>
      </div>
    </section>

    <section class="section" id="tooling">
      <div class="container">
        <div class="section-head">
          <div>
            <span class="section-kicker">${esc(t.toolingSection.kicker)}</span>
            <h2>${esc(t.toolingSection.title)}</h2>
          </div>
          <p class="section-desc">${esc(t.toolingSection.desc)}</p>
        </div>
        <div class="tooling-grid">
          ${toolsHtml}
        </div>
      </div>
    </section>

    <section class="section" id="about">
      <div class="container">
        <div class="section-head">
          <div>
            <span class="section-kicker">${esc(t.aboutSection.kicker)}</span>
            <h2>${esc(t.aboutSection.title)}</h2>
          </div>
          <p class="section-desc">${esc(t.aboutSection.desc)}</p>
        </div>
        <div class="builder-layout">
          <div class="builder-prose">
            <h3>${esc(t.aboutSection.proseTitle)}</h3>
            ${t.aboutSection.paragraphs.map((p) => `<p>${esc(p)}</p>`).join("")}
            <div class="hero-actions" style="margin-top: 1.25rem;">
              <a class="btn btn-primary" href="https://github.com/Wangnov">${esc(t.aboutSection.ctaGithub)}</a>
              <a class="btn btn-secondary" href="https://github.com/Wangnov/agents-mirror-kit/issues">${esc(t.aboutSection.ctaIssue)}</a>
            </div>
          </div>
          <aside class="timeline-card" aria-label="${esc(t.aboutSection.timelineTitle)}">
            <div class="topology-head">
              <span>${esc(t.aboutSection.timelineTitle)}</span>
              <span class="mono">Shanghai, CN</span>
            </div>
            <ol class="timeline-list">
              ${t.aboutSection.timeline
                .map(
                  ([yr, head, body]) => `
                <li>
                  <span class="tl-year">${esc(yr)}</span>
                  <div class="tl-body">
                    <strong>${esc(head)}</strong>
                    <span>${esc(body)}</span>
                  </div>
                </li>`,
                )
                .join("")}
            </ol>
          </aside>
        </div>
      </div>
    </section>

    <section class="section" id="faq">
      <div class="container">
        <div class="section-head">
          <div>
            <span class="section-kicker">${esc(t.faqSection.kicker)}</span>
            <h2>${esc(t.faqSection.title)}</h2>
          </div>
          <p class="section-desc">${esc(t.faqSection.desc)}</p>
        </div>
        <div class="faq-list">
          ${faqHtml}
        </div>
      </div>
    </section>
  </main>

  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div>
          <strong>agentsmirror.com</strong> · Built &amp; maintained by <a href="https://github.com/Wangnov">Wangnov</a>
        </div>
        <div class="footer-links">
          ${t.footer.links.map(([label, href]) => `<a href="${esc(href)}">${esc(label)}</a>`).join("")}
        </div>
      </div>
      <p class="footer-notice">${esc(t.footer.notice)}</p>
    </div>
  </footer>
  <script src="${esc(assets.js)}" defer></script>
</body>
</html>
`;
}

function render404(assets) {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="color-scheme" content="light dark">
  <meta name="robots" content="noindex">
  <title>404 · agentsmirror.com</title>
  <link rel="icon" href="/favicon.svg" type="image/svg+xml">
  <link rel="stylesheet" href="${esc(assets.css)}">
</head>
<body>
  <main class="container" style="padding-block: 6rem; max-width: 42rem;">
    <span class="section-kicker">404 / NOT FOUND</span>
    <h1 style="margin: 0.4rem 0 1rem; font-size: clamp(1.6rem, 1.2rem + 1.5vw, 2.4rem);">页面不存在 · Page not found</h1>
    <p style="color: var(--ink-2); margin-bottom: 1.6rem;">请返回 agentsmirror.com 首页，或直接前往 Codex / Claude / uv 镜像入口。</p>
    <div class="hero-actions">
      <a class="btn btn-primary" href="/">返回中文首页</a>
      <a class="btn btn-secondary" href="/en/">English Home</a>
    </div>
  </main>
</body>
</html>
`;
}

function makeOgSvg(lang) {
  const isZh = lang === "zh";
  const subtitle = isZh
    ? "可验证开源公益镜像矩阵 · 190万+ 次原样安装包分发"
    : "Verifiable Open-Source Mirror Matrix · 1.90M+ Verified Downloads";
  const line2 = isZh
    ? "Codex 桌面生态 · Claude 桌面版镜像 · uv 与 Python Runtime · Wangnov"
    : "Codex Desktop Suite · Claude Desktop Mirror · Astral uv + Python · by Wangnov";

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
    <rect width="1200" height="630" fill="#131210"/>
    <rect x="36" y="36" width="1128" height="558" rx="28" fill="#191714" stroke="#36322c" stroke-width="2"/>
    <circle cx="104" cy="112" r="8" fill="#46c483"/>
    <text x="126" y="118" fill="#bdb5a8" font-family="-apple-system, PingFang SC, sans-serif" font-size="22" font-weight="500">agentsmirror.com · SHA-256 Verifiable Infrastructure</text>
    <text x="96" y="258" fill="#f2ede4" font-family="-apple-system, PingFang SC, sans-serif" font-size="72" font-weight="700">agentsmirror</text>
    <text x="96" y="342" fill="#e28363" font-family="-apple-system, PingFang SC, sans-serif" font-size="36" font-weight="600">${esc(subtitle)}</text>
    <text x="96" y="418" fill="#bdb5a8" font-family="-apple-system, PingFang SC, sans-serif" font-size="27">${esc(line2)}</text>
    <line x1="96" y1="482" x2="1104" y2="482" stroke="#2f2b26" stroke-width="2"/>
    <text x="96" y="534" fill="#8a8277" font-family="SF Mono, Menlo, monospace" font-size="22">codexapp.agentsmirror.com  ·  claudeapp.agentsmirror.com  ·  uv.agentsmirror.com</text>
  </svg>`;
}

async function generateOgImages() {
  let sharpMod = null;
  try {
    const m = await import("/Users/wangnov/codex-app-manager/website/node_modules/sharp/lib/index.js");
    sharpMod = m.default || m;
  } catch {}

  const out = {};
  for (const lang of ["zh", "en"]) {
    const svg = makeOgSvg(lang);
    if (sharpMod) {
      const pngPath = `/og-${lang}.png`;
      const buf = await sharpMod(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
      await writeFile(path.join(DIST, `og-${lang}.png`), buf);
      out[lang] = pngPath;
    } else {
      const svgPath = `/og-${lang}.svg`;
      await writeFile(path.join(DIST, `og-${lang}.svg`), svg, "utf8");
      out[lang] = svgPath;
    }
  }
  return out;
}

async function collectHtmlFiles(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...(await collectHtmlFiles(p)));
    else if (e.name.endsWith(".html")) out.push(p);
  }
  return out;
}

await rm(DIST, { recursive: true, force: true });
await mkdir(path.join(DIST, "assets"), { recursive: true });
await mkdir(path.join(DIST, "en"), { recursive: true });
await cp(PUBLIC, DIST, { recursive: true });

const cssRaw = await readFile(path.join(ROOT, "src/site.css"));
const jsRaw = await readFile(path.join(ROOT, "src/site.js"));
const cssName = `site-${hashShort(cssRaw)}.css`;
const jsName = `site-${hashShort(jsRaw)}.js`;
await writeFile(path.join(DIST, "assets", cssName), cssRaw);
await writeFile(path.join(DIST, "assets", jsName), jsRaw);

const assets = { css: `/assets/${cssName}`, js: `/assets/${jsName}` };
const ogPaths = await generateOgImages();

await writeFile(path.join(DIST, "index.html"), renderPage(COPY.zh, assets, ogPaths.zh), "utf8");
await writeFile(path.join(DIST, "en/index.html"), renderPage(COPY.en, assets, ogPaths.en), "utf8");
await writeFile(path.join(DIST, "404.html"), render404(assets), "utf8");

// Pin inline script hashes into dist/_headers
const hashes = new Set();
for (const file of await collectHtmlFiles(DIST)) {
  const html = await readFile(file, "utf8");
  for (const [, body] of html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/gi)) {
    hashes.add(`'sha256-${createHash("sha256").update(body).digest("base64")}'`);
  }
}
const headersPath = path.join(DIST, "_headers");
let headers = await readFile(headersPath, "utf8");
headers = headers.replace("__INLINE_SCRIPT_HASHES__", [...hashes].sort().join(" "));
await writeFile(headersPath, headers, "utf8");

console.log(`Built agentsmirror.com into ${DIST} (pinned ${hashes.size} inline script hash(es), og=${JSON.stringify(ogPaths)})`);
