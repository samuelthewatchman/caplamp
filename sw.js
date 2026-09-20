// ==========================================================
// sw.js
// ----------------------------------------------------------
// Its only real job is to exist. A registered service worker with
// a fetch handler is one of the technical requirements Chrome
// checks before it'll treat "Add to Home Screen" as a real install
// (opening full-screen, its own icon) rather than just a bookmark
// shortcut that opens a browser tab.
//
// Deliberately does NOT cache anything. This app's whole point is
// showing live stock data from Supabase — caching those responses
// would risk showing stale inventory counts after opening from the
// home screen, which would be worse than doing nothing at all.
// Every request is passed straight through to the network exactly
// as if this file didn't exist; it just needs to be present and
// listening.
// ==========================================================
self.addEventListener("install", () => {
  // Activates this service worker immediately rather than waiting
  // for every open tab to close first — there's no cached version
  // to conflict with, so there's nothing to lose by skipping the
  // wait.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("fetch", (event) => {
  event.respondWith(fetch(event.request));
});
