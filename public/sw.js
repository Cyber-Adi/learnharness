// App shell worker. Mirrors components/mobile/pwa/sw-policy.ts; a test checks the rules match.
const CACHE = "lh-shell-v1";
const STATIC_PREFIXES = ["/_next/static/", "/icons/"];
const SHELL = "/";

self.addEventListener("install", (event) => {
	event.waitUntil(
		caches
			.open(CACHE)
			.then((c) => c.add(SHELL))
			.catch(() => {})
			.then(() => self.skipWaiting()),
	);
});

self.addEventListener("activate", (event) => {
	event.waitUntil(
		caches
			.keys()
			.then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
			.then(() => self.clients.claim()),
	);
});

function strategy(req) {
	if (req.method !== "GET") return "network-only";
	const path = new URL(req.url).pathname;
	if (path === "/api" || path.startsWith("/api/")) return "network-only";
	if (STATIC_PREFIXES.some((p) => path.startsWith(p))) return "cache-first";
	if (req.mode === "navigate") return "network-first-shell";
	return "network-only";
}

self.addEventListener("fetch", (event) => {
	const req = event.request;
	const url = new URL(req.url);
	if (url.origin !== self.location.origin) return;
	// Authenticated requests are never cached or intercepted.
	if (req.headers.has("authorization") || req.headers.has("x-learnharness-desktop")) return;
	const s = strategy(req);
	if (s === "network-only") return;
	if (s === "cache-first") {
		event.respondWith(
			caches.open(CACHE).then(async (c) => {
				const hit = await c.match(req);
				if (hit) return hit;
				const res = await fetch(req);
				if (res.ok) c.put(req, res.clone());
				return res;
			}),
		);
		return;
	}
	event.respondWith(
		fetch(req).catch(async () => (await caches.match(SHELL)) || Response.error()),
	);
});
