const CACHE_NAME = "english-study-hub-v7";
const DEFAULT_CONTENT = "Pq2uwssaFRo";
const CORE_ASSETS = [
  "./",
  "./index.html",
  "./assets/css/main.css",
  "./assets/js/main.js",
  "./assets/main.css",
  "./assets/main.js",
  "./pages/listening/index.html",
  `./pages/listening/content/${DEFAULT_CONTENT}/${DEFAULT_CONTENT}.html`,
  `./pages/listening/content/${DEFAULT_CONTENT}/00_meta.txt`,
  `./pages/listening/content/${DEFAULT_CONTENT}/01_intro.txt`,
  `./pages/listening/content/${DEFAULT_CONTENT}/02_core.txt`,
  `./pages/listening/content/${DEFAULT_CONTENT}/03_summary.txt`,
  `./pages/listening/content/${DEFAULT_CONTENT}/04_full_script.txt`,
  `./pages/listening/content/${DEFAULT_CONTENT}/05_wordcard.txt`,
  `./pages/listening/content/${DEFAULT_CONTENT}/06_hangman.json`
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(CORE_ASSETS)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(
      keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))
    ))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const requestUrl = new URL(event.request.url);
  if (requestUrl.origin !== self.location.origin) return;

  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy));
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
