import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import vm from "node:vm";
import { swStrategy } from "../components/mobile/pwa/sw-policy.ts";

const ORIGIN = "https://host.example.ts.net";
const SOURCE = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");

interface FakeRes {
	readonly status: number;
	readonly type: string;
	readonly ok: boolean;
	clone(): FakeRes;
}
const res = (status: number, type = "basic"): FakeRes => ({
	status,
	type,
	ok: status >= 200 && status < 300,
	clone() {
		return this;
	},
});

interface FakeEvent {
	readonly request: {
		readonly method: string;
		readonly url: string;
		readonly mode: string;
		readonly headers: { has(name: string): boolean };
	};
	pending?: Promise<unknown>;
	respondWith(p: Promise<unknown>): void;
}

interface Sandbox {
	readonly strategy: (req: { method: string; url: string; mode: string }) => string;
	readonly puts: number[];
	run(url: string, mode: string): Promise<unknown>;
	flush(): Promise<void>;
}

function load(opts: { cached?: FakeRes; network: FakeRes; putThrows?: boolean }): Sandbox {
	const listeners: Record<string, (e: FakeEvent) => void> = {};
	const puts: number[] = [];
	const cache = {
		match: async () => opts.cached,
		add: async () => {},
		put: async (_req: unknown, r: FakeRes) => {
			if (opts.putThrows) throw new Error("quota");
			puts.push(r.status);
		},
	};
	const ctx = vm.createContext({
		self: {
			addEventListener: (t: string, f: (e: FakeEvent) => void) => {
				listeners[t] = f;
			},
			location: { origin: ORIGIN },
			skipWaiting: () => Promise.resolve(),
			clients: { claim: () => Promise.resolve() },
		},
		caches: { open: async () => cache, match: async () => undefined, keys: async () => [], delete: async () => true },
		fetch: async () => opts.network,
		URL,
		Response: { error: () => "error" },
		Promise,
	});
	vm.runInContext(SOURCE, ctx);
	return {
		strategy: (ctx as { strategy: Sandbox["strategy"] }).strategy,
		puts,
		async run(url, mode) {
			const ev: FakeEvent = {
				request: { method: "GET", url, mode, headers: { has: () => false } },
				respondWith(p) {
					ev.pending = p;
				},
			};
			listeners["fetch"]?.(ev);
			return ev.pending;
		},
		flush: () => new Promise((r) => setImmediate(r)),
	};
}

const CASES: ReadonlyArray<{ method: string; path: string; mode: string }> = [
	{ method: "GET", path: "/api/graph", mode: "cors" },
	{ method: "GET", path: "/api", mode: "navigate" },
	{ method: "POST", path: "/_next/static/a.js", mode: "cors" },
	{ method: "PUT", path: "/", mode: "navigate" },
	{ method: "GET", path: "/_next/static/chunks/a.js", mode: "no-cors" },
	{ method: "GET", path: "/icons/icon-192.png", mode: "no-cors" },
	{ method: "GET", path: "/learn", mode: "navigate" },
	{ method: "GET", path: "/", mode: "navigate" },
	{ method: "GET", path: "/other.json", mode: "cors" },
	{ method: "GET", path: "/apiary", mode: "navigate" },
	{ method: "GET", path: "/_next/image", mode: "no-cors" },
	{ method: "GET", path: "/manifest.webmanifest", mode: "cors" },
	{ method: "GET", path: "/sw.js", mode: "same-origin" },
	{ method: "GET", path: "/icons", mode: "no-cors" },
];

describe("sw.js", () => {
	it("sw.js and sw-policy agree on every case", () => {
		const sb = load({ network: res(200) });
		assert.ok(CASES.length >= 12);
		for (const c of CASES) {
			const req = { method: c.method, url: `${ORIGIN}${c.path}`, mode: c.mode };
			assert.equal(sb.strategy(req), swStrategy(req), `${c.method} ${c.path} ${c.mode}`);
		}
	});

	it("a 206 response is never cached", async () => {
		const sb = load({ network: res(206) });
		await sb.run(`${ORIGIN}/_next/static/video.mp4`, "no-cors");
		await sb.flush();
		assert.deepEqual(sb.puts, []);
	});

	it("an opaque response is never cached", async () => {
		const sb = load({ network: res(200, "opaque") });
		await sb.run(`${ORIGIN}/_next/static/a.js`, "no-cors");
		assert.deepEqual(sb.puts, []);
	});

	it("a full 200 basic response is cached", async () => {
		const sb = load({ network: res(200) });
		await sb.run(`${ORIGIN}/_next/static/a.js`, "no-cors");
		assert.deepEqual(sb.puts, [200]);
	});

	it("a cache write failure does not fail the response", async () => {
		const sb = load({ network: res(200), putThrows: true });
		const out = await sb.run(`${ORIGIN}/_next/static/a.js`, "no-cors");
		assert.equal((out as FakeRes).status, 200);
	});

	it("an icon request returns the cached copy and refreshes it in the background", async () => {
		const stale = res(200);
		const sb = load({ cached: stale, network: res(200) });
		const out = await sb.run(`${ORIGIN}/icons/icon-192.png`, "no-cors");
		assert.equal(out, stale);
		await sb.flush();
		assert.deepEqual(sb.puts, [200]);
	});

	it("an uncached icon waits for the network", async () => {
		const fresh = res(200);
		const sb = load({ network: fresh });
		assert.equal(await sb.run(`${ORIGIN}/icons/icon-192.png`, "no-cors"), fresh);
	});
});
