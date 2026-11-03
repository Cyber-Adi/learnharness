export const CACHE_NAME = "lh-shell-v1";
export const STATIC_PREFIXES = Object.freeze(["/_next/static/", "/icons/"]);

export type SwStrategy = "network-only" | "cache-first" | "network-first-shell";

export interface SwRequest {
	readonly method: string;
	readonly url: string;
	readonly mode: string;
}

/** Mirrored by public/sw.js; tests/mobile-sw-policy.test.ts guards drift. */
export function swStrategy(req: SwRequest): SwStrategy {
	if (req.method.toUpperCase() !== "GET") return "network-only";
	let path: string;
	try {
		path = new URL(req.url).pathname;
	} catch {
		return "network-only";
	}
	if (path === "/api" || path.startsWith("/api/")) return "network-only";
	if (STATIC_PREFIXES.some((p) => path.startsWith(p))) return "cache-first";
	if (req.mode === "navigate") return "network-first-shell";
	return "network-only";
}
