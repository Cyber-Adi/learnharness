export const CACHE_NAME = "lh-shell-v1";
export const CACHE_FIRST_PREFIXES = Object.freeze(["/_next/static/"]);
export const REVALIDATE_PREFIXES = Object.freeze(["/icons/"]);

export type SwStrategy = "network-only" | "cache-first" | "stale-while-revalidate" | "network-first-shell";

export interface SwRequest {
	readonly method: string;
	readonly url: string;
	readonly mode: string;
}

/** Mirrored by public/sw.js; tests/mobile-sw-vm.test.ts guards drift. */
export function swStrategy(req: SwRequest): SwStrategy {
	if (req.method.toUpperCase() !== "GET") return "network-only";
	let path: string;
	try {
		path = new URL(req.url).pathname;
	} catch {
		return "network-only";
	}
	if (path === "/api" || path.startsWith("/api/")) return "network-only";
	if (CACHE_FIRST_PREFIXES.some((p) => path.startsWith(p))) return "cache-first";
	if (REVALIDATE_PREFIXES.some((p) => path.startsWith(p))) return "stale-while-revalidate";
	if (req.mode === "navigate") return "network-first-shell";
	return "network-only";
}
