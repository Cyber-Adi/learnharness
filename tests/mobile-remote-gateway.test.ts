import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { z } from "zod";
import { decide, gatewayEnv, type GatewayEnv, type GatewayInput } from "../src/server/remote/gateway.ts";
import type { DeviceRecord } from "../src/server/remote/schemas.ts";
import { DEFAULT_MOBILE_SCOPES } from "../src/server/remote/scopes.ts";

const Fixture = z.object({
	verified: z.literal(false),
	host: z.string(),
	headers: z.record(z.string(), z.string()),
});
const fixture = Fixture.parse(
	JSON.parse(readFileSync(join(import.meta.dirname, "..", "e2e", "fixtures", "tailscale-headers.json"), "utf8")),
);
const HOST = fixture.host;
const ID = "A".repeat(21) + "A";
const COOKIE = `__Host-lh_device=${ID}.${"B".repeat(43)}`;
const device = (over: Partial<DeviceRecord> = {}): DeviceRecord => ({
	id: ID,
	name: "Phone",
	scopes: [...DEFAULT_MOBILE_SCOPES] as DeviceRecord["scopes"],
	createdAt: "2026-01-01T00:00:00.000Z",
	lastSeenAt: null,
	keyVersion: 1,
	...over,
});
const env = (over: Partial<GatewayEnv> = {}): GatewayEnv => ({
	desktopModeConfigured: false,
	desktopCapabilityValid: false,
	remoteHosts: [HOST],
	...over,
});
const input = (over: Partial<GatewayInput> = {}): GatewayInput => ({
	method: "GET",
	pathname: "/api/chats",
	headers: { host: HOST, cookie: COOKIE },
	env: env(),
	resolveDevice: () => device(),
	...over,
});
const denyCode = (d: ReturnType<typeof decide>): string | null =>
	d.kind === "deny" && "ok" in d.body ? d.body.error.code : null;

test("desktop capability allows any route", () => {
	const d = decide(
		input({
			pathname: "/api/keys/abc",
			method: "DELETE",
			headers: { host: "127.0.0.1:3000" },
			env: env({ desktopModeConfigured: true, desktopCapabilityValid: true }),
		}),
	);
	assert.deepEqual(d, { kind: "allow", via: "desktop" });
});

test("local loopback without desktop mode is allowed (browser mode)", () => {
	const d = decide(input({ headers: { host: "localhost:3000" }, pathname: "/api/keys" }));
	assert.deepEqual(d, { kind: "allow", via: "local" });
});

test("local loopback in desktop mode without capability is denied with upstream's 403", () => {
	const d = decide(
		input({ headers: { host: "127.0.0.1:3000" }, env: env({ desktopModeConfigured: true }) }),
	);
	assert.deepEqual(d, {
		kind: "deny",
		status: 403,
		body: { error: "Desktop API access requires the trusted LearnHarness window." },
	});
});

test("a relayed request whose Host was rewritten to localhost is never local", () => {
	for (const h of ["x-forwarded-for", "forwarded", "x-forwarded-host", "x-forwarded-proto"]) {
		const d = decide(input({ headers: { host: "localhost:3000", [h]: "1.2.3.4" }, pathname: "/api/keys" }));
		assert.equal(d.kind, "deny", h);
		assert.equal(denyCode(d), "bad_host", h);
	}
});

test("unknown Host is rejected with bad_host", () => {
	const d = decide(input({ headers: { host: "evil.example.com", cookie: COOKIE } }));
	assert.equal(d.kind, "deny");
	assert.equal(d.kind === "deny" && d.status, 421);
	assert.equal(denyCode(d), "bad_host");
});

test("remote request is not authorized by an unset desktop secret", () => {
	const d = decide(input({ headers: { host: HOST }, resolveDevice: () => null }));
	assert.equal(d.kind, "deny");
	assert.equal(denyCode(d), "unauthorized");
});

test("remote is off when LH_REMOTE_HOSTS is empty", () => {
	const d = decide(input({ env: env({ remoteHosts: [] }) }));
	assert.equal(denyCode(d), "remote_disabled");
	assert.equal(d.kind === "deny" && d.status, 404);
});

test("remote request without a device cookie gets unauthorized", () => {
	let called = false;
	const d = decide(
		input({
			headers: { host: HOST },
			resolveDevice: () => {
				called = true;
				return device();
			},
		}),
	);
	assert.equal(denyCode(d), "unauthorized");
	assert.equal(called, false);
});

test("remote request with a revoked device gets unauthorized", () => {
	const d = decide(input({ resolveDevice: () => null }));
	assert.equal(denyCode(d), "unauthorized");
	assert.equal(d.kind === "deny" && d.status, 401);
});

test("remote device outside its scope gets forbidden_scope", () => {
	const d = decide(input({ resolveDevice: () => device({ scopes: ["graph:read"] }) }));
	assert.equal(denyCode(d), "forbidden_scope");
});

test("remote write with a missing or foreign Origin gets bad_origin", () => {
	const base = { method: "POST", pathname: "/api/chat" };
	for (const origin of [undefined, "https://evil.example.com", `http://${HOST}`, "null"]) {
		const d = decide(input({ ...base, headers: { host: HOST, cookie: COOKIE, origin } }));
		assert.equal(denyCode(d), "bad_origin", String(origin));
	}
	const good = decide(input({ ...base, headers: { host: HOST, cookie: COOKIE, origin: `https://${HOST}` } }));
	assert.deepEqual(good, { kind: "allow", via: "remote", deviceId: ID });
});

test("remote GET within scope is allowed and reports the deviceId", () => {
	assert.deepEqual(decide(input()), { kind: "allow", via: "remote", deviceId: ID });
});

test("POST /api/remote/pair is reachable without a device only on a remote host", () => {
	const post = { method: "POST", pathname: "/api/remote/pair" };
	const origin = `https://${HOST}`;
	const ok = decide(input({ ...post, headers: { host: HOST, origin }, resolveDevice: () => null }));
	assert.deepEqual(ok, { kind: "allow", via: "remote" });
	const unknown = decide(input({ ...post, headers: { host: "evil.example.com", origin: "https://evil.example.com" } }));
	assert.equal(denyCode(unknown), "bad_host");
	const off = decide(input({ ...post, env: env({ remoteHosts: [] }), headers: { host: HOST, origin } }));
	assert.equal(denyCode(off), "remote_disabled");
	const foreign = decide(input({ ...post, headers: { host: HOST, origin: "https://evil.example.com" } }));
	assert.equal(denyCode(foreign), "bad_origin");
	const other = decide(input({ method: "POST", pathname: "/api/remote/pairing-code", headers: { host: HOST, origin }, resolveDevice: () => null }));
	assert.equal(denyCode(other), "unauthorized");
});

test("admin and graph:write routes are never allowed remotely, even if the record lists them", () => {
	const rec = device({ scopes: ["admin", "graph:write", "learn"] as DeviceRecord["scopes"] });
	const origin = `https://${HOST}`;
	const cases: ReadonlyArray<readonly [string, string]> = [
		["GET", "/api/remote/devices"],
		["DELETE", "/api/remote/devices/x1"],
		["POST", "/api/remote/pairing-code"],
		["PUT", "/api/settings/keys"],
		["PUT", "/api/graph/positions"],
		["DELETE", "/api/keys/abc"],
	];
	for (const [method, pathname] of cases) {
		const d = decide(input({ method, pathname, headers: { host: HOST, cookie: COOKIE, origin }, resolveDevice: () => rec }));
		assert.equal(denyCode(d), "forbidden_scope", `${method} ${pathname}`);
	}
});

test("deny responses never echo the path, headers or cookie value", () => {
	const secret = "s3cr3t-token-value";
	const variants: GatewayInput[] = [
		input({ pathname: "/api/echo-me-path", headers: { host: HOST, cookie: `${COOKIE}; x=${secret}` }, resolveDevice: () => null }),
		input({ headers: { host: "evil-host-echo.example", "x-custom": secret } }),
		input({ pathname: "/api/echo-me-path", method: "POST", headers: { host: HOST, cookie: COOKIE, origin: secret } }),
		input({ env: env({ remoteHosts: [] }), headers: { host: HOST, "x-custom": secret } }),
	];
	for (const v of variants) {
		const d = decide(v);
		assert.equal(d.kind, "deny");
		const text = JSON.stringify(d);
		for (const leak of ["echo-me", secret, "evil-host", "BBBB", HOST]) {
			assert.equal(text.includes(leak), false, leak);
		}
	}
});

test("the tailscale fixture request with a valid device is allowed", () => {
	const headers = { ...fixture.headers, cookie: COOKIE };
	const d = decide(input({ headers }));
	assert.deepEqual(d, { kind: "allow", via: "remote", deviceId: ID });
	const noDevice = decide(input({ headers: fixture.headers, resolveDevice: () => null }));
	assert.equal(denyCode(noDevice), "unauthorized");
});

test("Headers instances are accepted", () => {
	const headers = new Headers({ host: HOST, cookie: COOKIE });
	assert.deepEqual(decide(input({ headers })), { kind: "allow", via: "remote", deviceId: ID });
});

test("gatewayEnv: browser mode never reports a valid capability; bad hosts fail closed", () => {
	const fakeSecret = "f".repeat(64);
	const none = gatewayEnv({}, new Headers());
	assert.deepEqual(none, { desktopModeConfigured: false, desktopCapabilityValid: false, remoteHosts: [] });
	const good = gatewayEnv(
		{ LH_DESKTOP_API_SECRET: fakeSecret, LH_REMOTE_HOSTS: HOST },
		new Headers({ "x-learnharness-desktop": fakeSecret }),
	);
	assert.equal(good.desktopCapabilityValid, true);
	assert.deepEqual([...good.remoteHosts], [HOST]);
	const wrong = gatewayEnv({ LH_DESKTOP_API_SECRET: fakeSecret }, new Headers({ "x-learnharness-desktop": "nope" }));
	assert.equal(wrong.desktopCapabilityValid, false);
	assert.deepEqual(gatewayEnv({ LH_REMOTE_HOSTS: "localhost" }, new Headers()).remoteHosts, []);
});

test("desktop mode: a rejected request without the capability gets upstream's 403, not 404", () => {
	for (const headers of [{}, { host: "evil.example" }, { host: "localhost:3000", "x-forwarded-for": "1.2.3.4" }]) {
		const d = decide(
			input({
				pathname: "/api/settings",
				headers,
				env: env({ desktopModeConfigured: true, remoteHosts: [] }),
			}),
		);
		assert.equal(d.kind, "deny");
		if (d.kind === "deny") {
			assert.equal(d.status, 403, JSON.stringify(headers));
			assert.deepEqual(d.body, { error: "Desktop API access requires the trusted LearnHarness window." });
		}
	}
});

test("desktop mode with remote on: a foreign Host also gets upstream's 403", () => {
	const d = decide(input({ headers: { host: "evil.example" }, env: env({ desktopModeConfigured: true }) }));
	assert.deepEqual(d, { kind: "deny", status: 403, body: { error: "Desktop API access requires the trusted LearnHarness window." } });
});
