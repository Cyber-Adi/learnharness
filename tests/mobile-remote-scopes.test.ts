import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { test } from "node:test";
import {
	DEFAULT_MOBILE_SCOPES,
	HOST_ONLY_SCOPES,
	ROUTE_SCOPES,
	remoteAllowed,
	scopeFor,
	type Method,
} from "../src/server/remote/scopes.ts";

const API_ROOT = join(import.meta.dirname, "..", "app", "api");
const METHOD_RE =
	/export\s+(?:async\s+)?function\s+(GET|POST|PUT|PATCH|DELETE)\b|export\s+const\s+(GET|POST|PUT|PATCH|DELETE)\b/g;

function routeFiles(dir: string): string[] {
	return readdirSync(dir).flatMap((name) => {
		const full = join(dir, name);
		if (statSync(full).isDirectory()) return routeFiles(full);
		return name === "route.ts" ? [full] : [];
	});
}

/** Concrete pathname from a Next folder path: dynamic segments get a sample value. */
function pathnameOf(file: string): string {
	const rel = relative(join(API_ROOT, ".."), file).split(sep).slice(0, -1);
	return `/${rel
		.map((s) => (s.startsWith("[...") ? "a/b" : s.startsWith("[") ? "x1" : s))
		.join("/")}`;
}

test("every app/api route method has a scope", () => {
	const missing: string[] = [];
	for (const file of routeFiles(API_ROOT)) {
		const src = readFileSync(file, "utf8");
		for (const m of src.matchAll(METHOD_RE)) {
			const method = (m[1] ?? m[2]) as Method;
			if (scopeFor(method, pathnameOf(file)) === null) {
				missing.push(`${method} ${pathnameOf(file)} (${relative(API_ROOT, file)})`);
			}
		}
	}
	assert.deepEqual(missing, [], `unscoped routes:\n${missing.join("\n")}`);
});

test("unlisted route is denied", () => {
	assert.equal(scopeFor("GET", "/api/new-thing"), null);
	assert.equal(remoteAllowed("GET", "/api/new-thing", ["learn", "admin"]), false);
});

test("admin is never remotely allowed, even when granted", () => {
	assert.equal(scopeFor("DELETE", "/api/keys/abc"), "admin");
	assert.equal(remoteAllowed("DELETE", "/api/keys/abc", ["admin", "learn"]), false);
	assert.equal(remoteAllowed("POST", "/api/subscriptions", ["admin"]), false);
});

test("graph:write is never remotely allowed, even when granted", () => {
	assert.equal(scopeFor("DELETE", "/api/graph/nodes/n1"), "graph:write");
	assert.equal(remoteAllowed("DELETE", "/api/graph/nodes/n1", ["graph:write"]), false);
	assert.equal(remoteAllowed("POST", "/api/graph/import", ["graph:write"]), false);
});

test("GET /api/settings is models:read; PUT /api/settings/keys is admin", () => {
	assert.equal(scopeFor("GET", "/api/settings"), "models:read");
	assert.equal(scopeFor("PUT", "/api/settings/keys"), "admin");
	assert.equal(scopeFor("PUT", "/api/settings"), "admin");
	assert.equal(scopeFor("GET", "/api/settings/prompts"), "admin");
});

test("granted scopes allow listed routes and only those", () => {
	assert.equal(remoteAllowed("GET", "/api/chats/abc/stream", DEFAULT_MOBILE_SCOPES), true);
	assert.equal(remoteAllowed("POST", "/api/chat", DEFAULT_MOBILE_SCOPES), true);
	assert.equal(remoteAllowed("POST", "/api/chat", ["graph:read"]), false);
	assert.equal(remoteAllowed("POST", "/api/graph", DEFAULT_MOBILE_SCOPES), false);
});

test("path tricks do not widen scope", () => {
	assert.equal(scopeFor("GET", "/api/chats/../keys"), null);
	assert.equal(scopeFor("GET", "/api//keys"), null);
	assert.equal(scopeFor("get", "/api/graph"), "graph:read");
});

test("exported tables are frozen", () => {
	assert.ok(Object.isFrozen(ROUTE_SCOPES));
	assert.ok(ROUTE_SCOPES.every((e) => Object.isFrozen(e)));
	assert.ok(Object.isFrozen(HOST_ONLY_SCOPES));
	assert.ok(Object.isFrozen(DEFAULT_MOBILE_SCOPES));
	assert.deepEqual([...HOST_ONLY_SCOPES], ["graph:write", "admin"]);
	assert.equal(DEFAULT_MOBILE_SCOPES.length, 4);
});
