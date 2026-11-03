// Host admin token: the headless host's own credential for admin routes while remote is on.
import assert from "node:assert/strict";
import { test } from "node:test";
import { decide, gatewayEnv, type GatewayEnv, type GatewayInput } from "../src/server/remote/gateway.ts";
import { HOST_ADMIN_HEADER } from "../src/server/remote/host-token.ts";

const HOST = "my-mac.tailnet-1234.ts.net";
const TOKEN = "T".repeat(43);
const LOCAL = { host: "localhost:3210", "x-forwarded-host": "localhost:3210", "x-forwarded-port": "3210", "x-forwarded-proto": "http", "x-forwarded-for": "127.0.0.1" };

const env = (over: Partial<GatewayEnv> = {}): GatewayEnv => ({
	desktopModeConfigured: false,
	desktopCapabilityValid: false,
	remoteHosts: [HOST],
	...over,
});
const input = (over: Partial<GatewayInput> = {}): GatewayInput => ({
	method: "POST",
	pathname: "/api/remote/pairing-code",
	headers: { ...LOCAL, [HOST_ADMIN_HEADER]: TOKEN },
	env: env({ hostAdminValid: true }),
	resolveDevice: () => null,
	...over,
});
const code = (d: ReturnType<typeof decide>): string | null => (d.kind === "deny" && "ok" in d.body ? d.body.error.code : null);
const computed = (headerValue: string | undefined, envToken: string | undefined): boolean => {
	const headers = new Headers({ host: "localhost:3210" });
	if (headerValue !== undefined) headers.set(HOST_ADMIN_HEADER, headerValue);
	return gatewayEnv({ LH_REMOTE_HOSTS: HOST, ...(envToken === undefined ? {} : { LH_HOST_ADMIN_TOKEN: envToken }) }, headers).hostAdminValid === true;
};

test("a local request with the right host admin token reaches admin routes with remote on", () => {
	assert.deepEqual(decide(input()), { kind: "allow", via: "local" });
	assert.deepEqual(decide(input({ method: "GET", pathname: "/api/remote/devices" })), { kind: "allow", via: "local" });
	assert.equal(computed(TOKEN, TOKEN), true);
});

test("without a valid token a local request still gets no admin route with remote on", () => {
	assert.equal(code(decide(input({ env: env({ hostAdminValid: false }) }))), "forbidden_scope");
});

test("a wrong or short token does not validate", () => {
	assert.equal(computed("W".repeat(43), TOKEN), false);
	assert.equal(computed(TOKEN.slice(0, 42), TOKEN.slice(0, 42)), false);
	assert.equal(computed(`${TOKEN}x`, TOKEN), false);
	assert.equal(computed(undefined, TOKEN), false);
});

test("the token never authorizes a remote request", () => {
	const d = decide(input({ headers: { host: HOST, origin: `https://${HOST}`, [HOST_ADMIN_HEADER]: TOKEN } }));
	assert.equal(code(d), "unauthorized");
});

test("the token never authorizes a relayed request", () => {
	const d = decide(input({ headers: { ...LOCAL, "x-forwarded-for": "100.101.102.103", [HOST_ADMIN_HEADER]: TOKEN } }));
	assert.equal(d.kind, "deny");
	assert.equal(code(d), "bad_host");
});

test("without LH_HOST_ADMIN_TOKEN the header is ignored", () => {
	assert.equal(computed(TOKEN, undefined), false);
	assert.equal(computed("", ""), false);
});
