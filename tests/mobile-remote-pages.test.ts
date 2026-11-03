// F2 review fixes: pages through the gateway, forwarded headers, local CSRF (SR1-SR3).
import assert from "node:assert/strict";
import { test } from "node:test";
import { NextRequest } from "next/server";
import { unstable_doesMiddlewareMatch as doesProxyMatch } from "next/experimental/testing/server";
import { config, proxy } from "../proxy.ts";
import { decide, LOCAL_DENY_BODY, type GatewayEnv, type GatewayInput } from "../src/server/remote/gateway.ts";
import type { DeviceRecord } from "../src/server/remote/schemas.ts";
import { DEFAULT_MOBILE_SCOPES } from "../src/server/remote/scopes.ts";

const HOST = "my-mac.tailnet-1234.ts.net";
const ID = "A".repeat(21);
const COOKIE = `__Host-lh_device=${ID}.${"B".repeat(43)}`;
const device = (scopes: DeviceRecord["scopes"] = [...DEFAULT_MOBILE_SCOPES] as DeviceRecord["scopes"]): DeviceRecord => ({
	id: ID,
	name: "Phone",
	scopes,
	createdAt: "2026-01-01T00:00:00.000Z",
	lastSeenAt: null,
	keyVersion: 1,
});
const env = (over: Partial<GatewayEnv> = {}): GatewayEnv => ({
	desktopModeConfigured: false,
	desktopCapabilityValid: false,
	remoteHosts: [HOST],
	...over,
});
const input = (over: Partial<GatewayInput> = {}): GatewayInput => ({
	method: "GET",
	pathname: "/chat/abc",
	headers: { host: HOST },
	env: env(),
	resolveDevice: () => null,
	...over,
});
const code = (d: ReturnType<typeof decide>): string | null =>
	d.kind === "deny" && "ok" in d.body ? d.body.error.code : null;

test("a remote page request without a device is unauthorized", () => {
	const d = decide(input());
	assert.equal(code(d), "unauthorized");
	assert.equal(d.kind === "deny" && d.status, 401);
});

test("a remote page request with a valid device is allowed", () => {
	const d = decide(input({ headers: { host: HOST, cookie: COOKIE }, resolveDevice: () => device() }));
	assert.deepEqual(d, { kind: "allow", via: "remote", deviceId: ID });
});

test("a remote page request from a device without learn scope is forbidden", () => {
	const d = decide(input({ headers: { host: HOST, cookie: COOKIE }, resolveDevice: () => device(["activity"]) }));
	assert.equal(code(d), "forbidden_scope");
});

test("a remote /pair page is reachable without a device", () => {
	for (const pathname of ["/pair", "/pair/", "/pair/anything"]) {
		assert.deepEqual(decide(input({ pathname })), { kind: "allow", via: "remote" }, pathname);
	}
	assert.equal(code(decide(input({ pathname: "/pairing" }))), "unauthorized");
	assert.equal(code(decide(input({ pathname: "/pair-x/y" }))), "unauthorized");
});

test("a page request with an unknown Host is rejected", () => {
	const d = decide(input({ headers: { host: "evil.example.com" } }));
	assert.equal(code(d), "bad_host");
	assert.equal(d.kind === "deny" && d.status, 421);
});

test("an unknown Host page request in desktop mode gets upstream's 403 body", () => {
	const d = decide(input({ headers: { host: "evil.example.com" }, env: env({ desktopModeConfigured: true }) }));
	assert.deepEqual(d, { kind: "deny", status: 403, body: LOCAL_DENY_BODY });
});

test("a loopback page request in desktop mode is still served", () => {
	const d = decide(input({ headers: { host: "127.0.0.1:3000" }, env: env({ desktopModeConfigured: true }) }));
	assert.equal(d.kind, "allow");
	const prior = { m: process.env.LH_DESKTOP_SERVER, s: process.env.LH_DESKTOP_API_SECRET };
	try {
		process.env.LH_DESKTOP_SERVER = "1";
		process.env.LH_DESKTOP_API_SECRET = "a".repeat(64);
		const res = proxy(new NextRequest("http://127.0.0.1:3000/chat/new", { headers: { host: "127.0.0.1:3000" } }));
		assert.equal(res.headers.get("x-middleware-next"), "1");
		assert.equal(res.status, 200);
	} finally {
		if (prior.m === undefined) delete process.env.LH_DESKTOP_SERVER; else process.env.LH_DESKTOP_SERVER = prior.m;
		if (prior.s === undefined) delete process.env.LH_DESKTOP_API_SECRET; else process.env.LH_DESKTOP_API_SECRET = prior.s;
	}
});

test("the proxy matcher covers pages and API routes", () => {
	const origin = "http://127.0.0.1:3000";
	for (const p of ["/", "/chat/new", "/pair", "/api/chats", "/api/events", "/graph"]) {
		assert.equal(doesProxyMatch({ config, nextConfig: {}, url: origin + p }), true, p);
	}
});

test("static assets bypass the proxy matcher", () => {
	const origin = "http://127.0.0.1:3000";
	const assets = [
		"/_next/static/chunks/main.js",
		"/_next/image?url=%2Fa.png&w=64&q=75",
		"/icons/icon-192.png",
		"/sw.js",
		"/manifest.webmanifest",
		"/favicon.ico",
	];
	for (const p of assets) assert.equal(doesProxyMatch({ config, nextConfig: {}, url: origin + p }), false, p);
});

test("a loopback Host with only a forwarding-style header is never local", () => {
	for (const header of [
		"tailscale-user-login",
		"Tailscale-User-Name",
		"x-forwarded-port",
		"X-Forwarded-Server",
		"x-real-ip",
		"via",
	]) {
		const d = decide(input({ pathname: "/api/chats", headers: { host: "localhost:3000", [header]: "x" } }));
		assert.equal(d.kind, "deny", header);
		assert.equal(code(d), "bad_host", header);
	}
});

test("a loopback Host with only a tailscale-user-login header is never local (Headers instance)", () => {
	const headers = new Headers({ host: "127.0.0.1:3000", "tailscale-user-login": "a@b.c" });
	assert.equal(decide(input({ headers })).kind, "deny");
});

const headerSets = (sets: readonly Record<string, string>[]): readonly Record<string, string>[] => sets;
const local = (method: string, extra: Record<string, string>): GatewayInput =>
	input({ method, pathname: "/api/chats", headers: { host: "localhost:3000", ...extra } });

test("a cross-site POST to a loopback host is refused", () => {
	for (const extra of headerSets([
		{ origin: "https://evil.example.com" },
		{ origin: "null" },
		{ origin: "http://localhost.evil.com" },
		{ origin: "http://localhost:3000", "sec-fetch-site": "cross-site" },
		{ "sec-fetch-site": "same-site" },
	])) {
		const d = decide(local("POST", extra));
		assert.equal(code(d), "bad_origin", JSON.stringify(extra));
	}
});

test("a same-origin loopback POST still works", () => {
	for (const extra of headerSets([
		{ origin: "http://localhost:3000", "sec-fetch-site": "same-origin" },
		{ origin: "http://127.0.0.1:3000" },
		{ origin: "http://[::1]:3000", "sec-fetch-site": "none" },
		{ origin: "https://localhost" },
	])) {
		assert.deepEqual(decide(local("DELETE", extra)), { kind: "allow", via: "local" }, JSON.stringify(extra));
	}
});

test("a loopback POST with no Origin (curl) still works", () => {
	assert.deepEqual(decide(local("POST", {})), { kind: "allow", via: "local" });
});

test("a cross-site GET to a loopback host is not subject to the CSRF rule", () => {
	assert.equal(decide(local("GET", { origin: "https://evil.example.com" })).kind, "allow");
});
