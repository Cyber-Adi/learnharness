export const METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE"] as const;
export type Method = (typeof METHODS)[number];

export const SCOPES = [
	"learn",
	"graph:read",
	"activity",
	"models:read",
	"graph:write",
	"admin",
] as const;
export type Scope = (typeof SCOPES)[number];

/** Never grantable to a remote device, whatever the record says. */
export const HOST_ONLY_SCOPES: readonly Scope[] = Object.freeze(["graph:write", "admin"]);
export const DEFAULT_MOBILE_SCOPES: readonly Scope[] = Object.freeze([
	"learn",
	"graph:read",
	"activity",
	"models:read",
]);

export interface RouteScope {
	readonly scope: Scope;
	readonly methods: readonly Method[] | "*";
	/** Next folder syntax: [x] = one segment, ** = zero or more trailing segments. */
	readonly pattern: string;
}

const NON_GET: readonly Method[] = Object.freeze(["POST", "PUT", "PATCH", "DELETE"]);
const entry = (scope: Scope, methods: readonly Method[] | "*", pattern: string): RouteScope =>
	Object.freeze({
		scope,
		methods: methods === "*" ? methods : Object.freeze([...methods]),
		pattern,
	});

/** First match wins; order is most specific first. Unlisted means denied. */
export const ROUTE_SCOPES: readonly RouteScope[] = Object.freeze([
	entry("models:read", ["GET"], "/api/settings"),
	entry("admin", NON_GET, "/api/settings"),
	entry("admin", "*", "/api/settings/**"),
	entry("admin", "*", "/api/keys/**"),
	entry("admin", "*", "/api/custom-provider"),
	entry("admin", "*", "/api/claude-code"),
	entry("admin", "*", "/api/subscriptions/**"),
	entry("models:read", ["GET"], "/api/models"),
	entry("learn", ["POST"], "/api/chat"),
	entry("learn", "*", "/api/chats/**"),
	entry("learn", ["GET"], "/api/events"),
	entry("learn", ["GET"], "/api/search"),
	entry("learn", ["GET"], "/api/stt/token"),
	entry("graph:read", ["GET"], "/api/graph"),
	entry("graph:read", ["GET"], "/api/graph/status"),
	entry("graph:read", ["GET"], "/api/graph/costs"),
	entry("graph:read", ["GET"], "/api/graph/render-settings"),
	// render-settings PUT is not in the PRD table; kept host-only as writes.
	entry("graph:write", ["PUT"], "/api/graph/render-settings"),
	entry("graph:write", ["PUT"], "/api/graph/positions"),
	entry("graph:write", ["POST"], "/api/graph/import"),
	entry("graph:write", ["POST"], "/api/graph/coverage/extract"),
	entry("graph:write", ["DELETE"], "/api/graph/nodes/[id]"),
	entry("activity", ["GET"], "/api/activity"),
	entry("activity", ["POST"], "/api/activity/abort"),
	entry("activity", ["GET"], "/api/jobs"),
]);

function normalize(pathname: string): string[] | null {
	if (!pathname.startsWith("/")) return null;
	const trimmed = pathname.length > 1 && pathname.endsWith("/") ? pathname.slice(0, -1) : pathname;
	const segments = trimmed.split("/").slice(1);
	// Reject traversal, empty segments and encoded/backslash tricks outright.
	for (const s of segments) {
		if (s === "" || s === "." || s === ".." || s.includes("\\") || s.includes("%")) return null;
	}
	return segments;
}

function matches(pattern: string, segments: readonly string[]): boolean {
	const parts = pattern.split("/").slice(1);
	for (let i = 0; i < parts.length; i++) {
		const p = parts[i];
		if (p === "**") return true;
		const s = segments[i];
		if (s === undefined) return false;
		if (!(p?.startsWith("[") && p.endsWith("]")) && p !== s) return false;
	}
	return parts.length === segments.length;
}

export function scopeFor(method: string, pathname: string): Scope | null {
	const segments = normalize(pathname);
	if (!segments) return null;
	const m = METHODS.find((known) => known === method.toUpperCase());
	// HEAD, OPTIONS and anything else unlisted never inherit a "*" grant.
	if (!m) return null;
	for (const e of ROUTE_SCOPES) {
		if (e.methods !== "*" && !e.methods.includes(m)) continue;
		if (matches(e.pattern, segments)) return e.scope;
	}
	return null;
}

export function remoteAllowed(
	method: string,
	pathname: string,
	granted: readonly Scope[],
): boolean {
	const scope = scopeFor(method, pathname);
	if (scope === null || HOST_ONLY_SCOPES.includes(scope)) return false;
	return granted.includes(scope);
}
