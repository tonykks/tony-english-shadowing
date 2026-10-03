/**
 * data_source.js — Catalog fetcher and mode detector (Local vs Public)
 */

const DataSource = (() => {
  let cachedCatalog = null;
  let isLocalMode = false;

  async function checkLocalMode() {
    try {
      const resp = await fetch("/api/health", { method: "GET" });
      if (resp.ok) {
        const data = await resp.json();
        if (data.status === "ok") {
          isLocalMode = true;
          // Unhide local-only controls
          document.querySelectorAll("[data-local-only]").forEach(el => {
            el.hidden = false;
          });
        }
      }
    } catch {
      // Static mode (GitHub Pages or plain static file server)
      isLocalMode = false;
    }
  }

  async function loadCatalog(forceRefresh = false) {
    if (cachedCatalog && !forceRefresh) {
      return cachedCatalog;
    }

    let url = "./data/shadowing_catalog.json";
    if (isLocalMode) {
      url = "/api/catalog";
    }

    try {
      const resp = await fetch(url + (forceRefresh ? `?t=${Date.now()}` : ""));
      if (!resp.ok) {
        throw new Error(`Failed to load catalog: ${resp.status}`);
      }
      cachedCatalog = await resp.json();
      return cachedCatalog;
    } catch (err) {
      console.warn("Primary catalog load failed, trying fallback...", err);
      const fallback = await fetch("./data/shadowing_catalog.json");
      cachedCatalog = await fallback.json();
      return cachedCatalog;
    }
  }

  return {
    checkLocalMode,
    loadCatalog,
    isLocal: () => isLocalMode,
  };
})();
window.DataSource = DataSource;
