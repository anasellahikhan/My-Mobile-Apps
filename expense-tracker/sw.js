/* ============================================================
   SERVICE WORKER  -  sw.js
   ============================================================

   This is what makes the app work with no internet.

   WHAT A SERVICE WORKER ACTUALLY IS
   ---------------------------------
   A small script the browser keeps installed, separate from
   the page. It sits between your app and the network and can
   answer requests itself. Once it has cached your files, the
   app loads from the phone's own storage - aeroplane, basement
   car park, no signal, it does not matter.

   IT RUNS IN ITS OWN WORLD
   ------------------------
   No access to the page, no document, no window. It cannot
   touch your expenses; those live in localStorage which
   belongs to the page. This file only ever deals in files.

   THE ONE RULE THAT CATCHES EVERYONE
   ----------------------------------
   Bump CACHE_NAME whenever you change any file below.
   The browser serves the cached copy first, so without a new
   cache name your edits will not appear - you will change
   app.css, refresh, and see nothing, and assume you broke
   something.
   ============================================================ */

const CACHE_NAME = "expenses-v8";

// The "app shell": everything needed to draw the UI offline.
const SHELL = [
  "./",
  "./index.html",
  "./app.css",
  "./app.js",
  "./voice.js",
  "./manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png"
];


/* ------------------------------------------------------------
   INSTALL  -  runs once, when the worker is first registered
   ------------------------------------------------------------ */
self.addEventListener("install", event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(SHELL))
      // Take over immediately instead of waiting for every tab
      // using the old version to be closed.
      .then(() => self.skipWaiting())
  );
});


/* ------------------------------------------------------------
   ACTIVATE  -  clean out caches from older versions
   ------------------------------------------------------------ */
self.addEventListener("activate", event => {
  event.waitUntil(
    caches.keys()
      .then(names => Promise.all(
        names
          .filter(name => name !== CACHE_NAME)
          .map(name => caches.delete(name))
      ))
      .then(() => self.clients.claim())
  );
});


/* ------------------------------------------------------------
   FETCH  -  answer every request the page makes
   ------------------------------------------------------------

   Strategy: cache first, network as a fallback.

   Right for this app because the files change only when you
   edit them, and instant loading matters more than freshness.
   A news site would want the opposite.
*/
self.addEventListener("fetch", event => {

  // Only handle GET. Nothing else should ever be served stale.
  if (event.request.method !== "GET") return;

  event.respondWith(
    caches.match(event.request).then(cached => {

      if (cached) return cached;

      return fetch(event.request)
        .then(response => {

          // Cache newly fetched same-origin files so they are
          // available next time offline too.
          if (response && response.status === 200 &&
              response.type === "basic") {

            const copy = response.clone();
            caches.open(CACHE_NAME).then(c => c.put(event.request, copy));
          }

          return response;
        })
        .catch(() => {
          // Offline and not cached. For a page request, fall
          // back to the app shell so the user sees the app
          // rather than the browser's dinosaur.
          if (event.request.mode === "navigate") {
            return caches.match("./index.html");
          }
        });
    })
  );
});
