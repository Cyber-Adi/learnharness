import assert from "node:assert/strict"
import { test } from "node:test"
import { externalCliEnv } from "../src/core/auth-env.ts"
import { decide, type GatewayEnv, type GatewayInput } from "../src/server/remote/gateway.ts"
import { HOST_ADMIN_HEADER } from "../src/server/remote/host-token.ts"

const HOST = "my-mac.tailnet-1234.ts.net"
const TOKEN = "T".repeat(43)
const LOCAL = {
	host: "localhost:3210",
	"x-forwarded-host": "localhost:3210",
	"x-forwarded-port": "3210",
	"x-forwarded-proto": "http",
	"x-forwarded-for": "127.0.0.1",
}
const env: GatewayEnv = { desktopModeConfigured: false, desktopCapabilityValid: false, remoteHosts: [HOST], hostAdminValid: true }
const req = (method: string, pathname: string): GatewayInput => ({
	method,
	pathname,
	headers: { ...LOCAL, [HOST_ADMIN_HEADER]: TOKEN },
	env,
	resolveDevice: () => null,
})

test("the host token cannot reach settings or keys", () => {
	for (const [m, p] of [
		["PUT", "/api/settings"],
		["POST", "/api/keys/openrouter"],
		["PUT", "/api/custom-provider"],
		["PUT", "/api/graph/positions"],
	] as const) {
		const d = decide(req(m, p))
		assert.equal(d.kind, "deny", `${m} ${p}`)
	}
})

test("the host token still reaches pairing and device routes", () => {
	for (const [m, p] of [
		["POST", "/api/remote/pairing-code"],
		["GET", "/api/remote/devices"],
		["DELETE", "/api/remote/devices/abc"],
	] as const) {
		assert.equal(decide(req(m, p)).kind, "allow", `${m} ${p}`)
	}
})

test("the host admin token is not in process.env after load", async () => {
	process.env.LH_HOST_ADMIN_TOKEN = TOKEN
	// A query string forces a fresh module evaluation (and so a fresh capture).
	const spec = "../src/server/remote/host-token.ts?fresh=capture"
	const fresh = (await import(spec)) as typeof import("../src/server/remote/host-token.ts")
	assert.equal(process.env.LH_HOST_ADMIN_TOKEN, undefined)
	assert.equal(fresh.expectedHostToken({}), TOKEN)
})

test("external CLI env never carries the host admin token", () => {
	const out = externalCliEnv({ NODE_ENV: "test", PATH: "/bin", LH_HOST_ADMIN_TOKEN: TOKEN })
	assert.equal(out.LH_HOST_ADMIN_TOKEN, undefined)
	assert.equal(out.PATH, "/bin")
})
