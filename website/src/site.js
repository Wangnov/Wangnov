// Progressive enhancement for agentsmirror.com:
// 1. Theme cycle (system -> dark -> light) + system media query listener
// 2. One-click CLI snippet copy
// 3. Live R2 telemetry hydration from /api/overview.json

(function () {
  const root = document.documentElement;
  const lang = root.lang.startsWith("zh") ? "zh" : "en";
  const STORAGE_KEY = "am-theme";

  const media = window.matchMedia("(prefers-color-scheme: dark)");
  function applyTheme(pref) {
    if (pref === "light" || pref === "dark") {
      root.setAttribute("data-theme", pref);
    } else {
      root.removeAttribute("data-theme");
    }
    const btn = document.querySelector("[data-theme-toggle]");
    if (btn) {
      const effective = pref === "light" || pref === "dark" ? pref : media.matches ? "dark" : "light";
      btn.setAttribute("data-effective", effective);
      const label =
        lang === "zh"
          ? pref
            ? `主题：${pref === "dark" ? "深色" : "浅色"}（点击切换）`
            : "主题：跟随系统（点击切换）"
          : pref
            ? `Theme: ${pref} (click to cycle)`
            : "Theme: system (click to cycle)";
      btn.setAttribute("aria-label", label);
      btn.setAttribute("title", label);
    }
  }

  let saved = null;
  try {
    saved = localStorage.getItem(STORAGE_KEY);
  } catch {}
  applyTheme(saved);

  media.addEventListener("change", () => {
    if (!saved) applyTheme(null);
  });

  const toggle = document.querySelector("[data-theme-toggle]");
  if (toggle) {
    toggle.addEventListener("click", () => {
      saved = saved === null ? (media.matches ? "light" : "dark") : saved === "dark" ? "light" : null;
      try {
        if (saved) localStorage.setItem(STORAGE_KEY, saved);
        else localStorage.removeItem(STORAGE_KEY);
      } catch {}
      applyTheme(saved);
    });
  }

  // Copy buttons
  document.addEventListener("click", async (ev) => {
    const btn = ev.target instanceof Element ? ev.target.closest("[data-copy]") : null;
    if (!btn) return;
    const text = btn.getAttribute("data-copy");
    if (!text || !navigator.clipboard) return;
    try {
      await navigator.clipboard.writeText(text);
      const orig = btn.textContent;
      btn.setAttribute("data-copied", "true");
      btn.textContent = lang === "zh" ? "已复制" : "Copied";
      setTimeout(() => {
        btn.removeAttribute("data-copied");
        btn.textContent = orig;
      }, 1600);
    } catch {}
  });

  // Format download count cleanly
  function fmtCount(n) {
    if (typeof n !== "number" || !Number.isFinite(n) || n <= 0) return null;
    if (lang === "zh") {
      if (n >= 10000) return `${(n / 10000).toFixed(n >= 1000000 ? 0 : 1).replace(/\.0$/, "")}万+`;
      return `${n.toLocaleString("zh-CN")}+`;
    }
    if (n >= 1000000) return `${(n / 1000000).toFixed(2).replace(/0$/, "").replace(/\.$/, "")}M+`;
    if (n >= 1000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}k+`;
    return `${n}+`;
  }

  function setText(sel, val) {
    if (!val) return;
    for (const el of document.querySelectorAll(sel)) {
      el.textContent = val;
    }
  }

  fetch("/api/overview.json", { headers: { accept: "application/json" } })
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      if (!data) return;
      if (data.totals?.installerDownloads) {
        setText('[data-live="total-downloads"]', fmtCount(data.totals.installerDownloads));
      }
      if (data.codex?.downloads) {
        setText('[data-live="codex-downloads"]', fmtCount(data.codex.downloads));
      }
      if (data.claude?.downloads) {
        setText('[data-live="claude-downloads"]', fmtCount(data.claude.downloads));
      }
      if (data.codex?.version) {
        setText('[data-live="codex-version"]', `v${data.codex.version}`);
      }
      if (data.claude?.version) {
        setText('[data-live="claude-version"]', `v${data.claude.version}`);
      }
    })
    .catch(() => {});
})();
