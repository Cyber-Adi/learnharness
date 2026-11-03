import assert from "node:assert/strict";
import { test } from "node:test";
import { decide, type GatewayEnv, type GatewayInput } from "../src/server/remote/gateway.ts";

// Next's base-server fills x-forwarded-{host,port,proto,for} with `??=` on EVERY request
// (node_modules/next/dist/server/base-server.js), so a plain local curl arrives with them.
const TS_HOST = "my-mac.tailnet-1234.ts.net";
const env = (over: Partial<GatewayEnv> = {}): GatewayEnv => ({
	desktopModeConfigured: false,
	desktopCapabilityValid: false,
	remoteHosts: [],
	...over,
});
const nextFilled = (host: string, peer: string): Record<string, string> => ({
	host,
	"x-forwarded-host": host,
	"x-forwarded-port": host.split(":").at(-1) ?? "80",
	"x-forwarded-proto": "http",
	"x-forwarded-for": peer,
});
const input = (over: Partial<GatewayInput> = {}): GatewayInput => ({
	method: "GET",
	pathname: "/api/chats",
	headers: nextFilled("localhost:3000", "::1"),
	env: env(),
	resolveDevice: () => null,
	...over,
});
const code = (d: ReturnType<typeof decide>): string | null =>
	d.kind === "deny" && "ok" in d.body ? d.body.error.code : null;

test("a plain local request carrying only the headers Next itself adds is local", () => {
	for (const [host, peer] of [
		["localhost:3000", "::1"],
		["127.0.0.1:3000", "127.0.0.1"],
		["localhost:3000", "::ffff:127.0.0.1"],
		["[::1]:3000", "::1"],
	] as const) {
		const d = decide(input({ headers: nextFilled(host, peer) }));
		assert.deepEqual(d, { kind: "allow", via: "local" }, `${host} ${peer}`);
	}
});

test("a loopback Host relayed from a non-loopback peer is never local", () => {
	for (const peer of ["100.101.102.103", "192.168.1.5", "100.64.0.2, 127.0.0.1", "unknown"]) {
		const d = decide(input({ headers: nextFilled("localhost:3000", peer) }));
		assert.equal(code(d), "bad_host", peer);
	}
});

test("a loopback Host relayed over https is never local", () => {
	const d = decide(input({ headers: { ...nextFilled("localhost:3000", "127.0.0.1"), "x-forwarded-proto": "https" } }));
	assert.equal(code(d), "bad_host");
});

test("a loopback Host whose forwarded host differs is never local", () => {
	const d = decide(input({ headers: { ...nextFilled("localhost:3000", "127.0.0.1"), "x-forwarded-host": TS_HOST } }));
	assert.equal(code(d), "bad_host");
});

test("with remote on, a local request never reaches admin routes without the capability", () => {
	for (const [method, pathname] of [
		["POST", "/api/remote/pairing-code"],
		["GET", "/api/remote/devices"],
		["PUT", "/api/settings"],
		["POST", "/api/keys"],
		["PUT", "/api/graph/positions"],
	] as const) {
		const d = decide(input({ method, pathname, env: env({ remoteHosts: [TS_HOST] }) }));
		assert.equal(code(d), "forbidden_scope", `${method} ${pathname}`);
	}
});

test("with remote on, a local request still reaches learner routes and pages", () => {
	const on = env({ remoteHosts: [TS_HOST] });
	assert.deepEqual(decide(input({ env: on })), { kind: "allow", via: "local" });
	assert.deepEqual(decide(input({ env: on, pathname: "/settings" })), { kind: "allow", via: "local" });
});

test("with remote off, a local browser still reaches admin routes (upstream browser mode)", () => {
	const d = decide(input({ method: "PUT", pathname: "/api/settings" }));
	assert.deepEqual(d, { kind: "allow", via: "local" });
});

test("the desktop window keeps admin routes with remote on", () => {
	const d = decide(
		input({
			method: "PUT",
			pathname: "/api/settings",
			env: env({ remoteHosts: [TS_HOST], desktopModeConfigured: true, desktopCapabilityValid: true }),
		}),
	);
	assert.deepEqual(d, { kind: "allow", via: "desktop" });
});
