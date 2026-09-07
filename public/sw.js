// barrydo service worker — online-only by design.
// Exists solely to make the app installable as a PWA; all fetches pass through to network.
const CACHE = "barrydo-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));
self.addEventListener("fetch", () => { /* transparent passthrough */ });
