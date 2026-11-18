// Wave D: an unpaired or revoked phone opening the app got a raw JSON 401 page and no way forward.
// A remote GET for a page without a valid device now goes to /pair; APIs and other denials do not change.
import assert from "node:assert/strict"
import { test } from "node:test"
import { NextRequest } from "next/server"
import { proxy } from "../proxy.ts"
import { decide, type GatewayEnv, type GatewayInput } from "../src/server/remote/gateway.ts"
import type { DeviceRecord } from "../src/server/remote/schemas.ts"

const HOST = "my-mac.tailnet-1234.ts.net"
const COOKIE = `__Host-lh_device=${"A".repeat(21)}.${"B".repeat(43)}`
const env = (over: Partial<GatewayEnv> = {}): GatewayEnv => ({
	desktopModeConfigured: false,
	desktopCapabilityValid: false,
	remoteHosts: [HOST],
	...over,
})
const input = (over: Partial<GatewayInput> = {}): GatewayInput => ({
	method: "GET",
	pathname: "/",
	headers: { host: HOST },
	env: env(),
	resolveDevice: () => null,
	...over,
})
const code = (d: ReturnType<typeof decide>): string | null => (d.kind === "deny" && "ok" in d.body ? d.body.error.code : null)

test("an unpaired phone opening the app is sent to the pair page", () => {
	assert.deepEqual(decide(input()), { kind: "redirect", location: "/pair" })
	assert.deepEqual(decide(input({ pathname: "/chat/abc" })), { kind: "redirect", location: "/pair" })
})

test("a revoked phone opening the app is sent to the pair page", () => {
	assert.deepEqual(decide(input({ headers: { host: HOST, cookie: COOKIE } })), { kind: "redirect", location: "/pair" })
})

test("an unpaired API call still gets the JSON 401", () => {
	const d = decide(input({ pathname: "/api/chats" }))
	assert.equal(code(d), "unauthorized")
	assert.equal(d.kind === "deny" && d.status, 401)
})

test("only GET pages redirect; a POST to a page stays denied", () => {
	assert.equal(code(decide(input({ method: "POST", pathname: "/chat/abc" }))), "unauthorized")
})

test("an unknown Host is never redirected", () => {
	assert.equal(code(decide(input({ headers: { host: "evil.example.com" } }))), "bad_host")
})

test("a paired device without the learn scope is still refused, not sent to pair", () => {
	const noLearn: DeviceRecord = {
		id: "A".repeat(21),
		name: "Phone",
		scopes: [],
		createdAt: "2026-01-01T00:00:00.000Z",
		lastSeenAt: null,
		keyVersion: 1,
	}
	assert.equal(code(decide(input({ headers: { host: HOST, cookie: COOKIE }, resolveDevice: () => noLearn }))), "forbidden_scope")
})

test("the proxy answers with a 303 to a relative /pair, uncached", () => {
	const prior = process.env.LH_REMOTE_HOSTS
	try {
		process.env.LH_REMOTE_HOSTS = HOST
		// Behind tailscale serve the server sees http; a relative Location keeps the phone on https.
		const res = proxy(new NextRequest(`http://${HOST}/?source=pwa`, { headers: { host: HOST } }))
		assert.equal(res.status, 303)
		assert.equal(res.headers.get("location"), "/pair")
		assert.equal(res.headers.get("cache-control"), "no-store")
	} finally {
		if (prior === undefined) delete process.env.LH_REMOTE_HOSTS
		else process.env.LH_REMOTE_HOSTS = prior
	}
})
