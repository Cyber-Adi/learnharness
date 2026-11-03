// App shell worker. Mirrors components/mobile/pwa/sw-policy.ts; tests/mobile-sw-vm.test.ts runs this file against it.
const CACHE = "lh-shell-v1";
const CACHE_FIRST = ["/_next/static/"];
const REVALIDATE = ["/icons/"];
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
	let path;
	try {
		path = new URL(req.url).pathname;
	} catch {
		return "network-only";
	}
	if (path === "/api" || path.startsWith("/api/")) return "network-only";
	if (CACHE_FIRST.some((p) => path.startsWith(p))) return "cache-first";
	if (REVALIDATE.some((p) => path.startsWith(p))) return "stale-while-revalidate";
	if (req.mode === "navigate") return "network-first-shell";
	return "network-only";
}

// Only complete, readable responses: a 206 or an opaque body must never be replayed as a full one.
function cacheable(res) {
	return res.status === 200 && (res.type === "basic" || res.type === "cors");
}

function store(cache, req, res) {
	if (!cacheable(res)) return Promise.resolve();
	return Promise.resolve(cache.put(req, res.clone())).catch(() => {});
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
				store(c, req, res);
				return res;
			}),
		);
		return;
	}
	if (s === "stale-while-revalidate") {
		event.respondWith(
			caches.open(CACHE).then(async (c) => {
				const hit = await c.match(req);
				const refresh = fetch(req).then(async (res) => {
					await store(c, req, res);
					return res;
				});
				if (!hit) return refresh;
				refresh.catch(() => {});
				return hit;
			}),
		);
		return;
	}
	event.respondWith(fetch(req).catch(async () => (await caches.match(SHELL)) || Response.error()));
});
