import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { describe, it } from "node:test";
import { adminTokenFile, childEnv, makeAdminToken, resolveDataDir, writeAdminToken } from "../scripts/host-config.mjs";
import { formatPairing, pairRequest } from "../scripts/host-pair.mjs";

const config = { hostname: "127.0.0.1", port: 3210, remoteHosts: ["my-host.tailnet-1234.ts.net"], dataDir: "/tmp/lm-data" } as const;
const TOKEN = "Q".repeat(43);

describe("host admin token helpers", () => {
	it("names the token file inside the data dir", () => {
		assert.equal(adminTokenFile("/var/lib/lmobile"), path.join("/var/lib/lmobile", "host-admin.token"));
	});

	it("makes a 256-bit base64url token from injected entropy", () => {
		const token = makeAdminToken((n: number) => Buffer.alloc(n, 0xfb));
		assert.equal(token.length, 43);
		assert.match(token, /^[A-Za-z0-9_-]{43}$/);
		assert.notEqual(makeAdminToken((n: number) => Buffer.alloc(n, 1)), token);
	});

	it("passes the token to the child only via env LH_HOST_ADMIN_TOKEN", () => {
		const env = childEnv(config, { PATH: "/bin" }, TOKEN);
		assert.equal(env.LH_HOST_ADMIN_TOKEN, TOKEN);
		const rest = Object.entries(env).filter(([k]) => k !== "LH_HOST_ADMIN_TOKEN");
		assert.ok(rest.every(([, v]) => v !== TOKEN));
	});

	it("overrides an inherited LH_HOST_ADMIN_TOKEN", () => {
		assert.equal(childEnv(config, { LH_HOST_ADMIN_TOKEN: "old" }, TOKEN).LH_HOST_ADMIN_TOKEN, TOKEN);
	});

	it("falls back to the standalone data dir when LH_DATA_DIR is unset", () => {
		assert.equal(resolveDataDir({ ...config, dataDir: undefined }, "/app/standalone"), path.join("/app/standalone", "data"));
		assert.equal(resolveDataDir(config, "/app/standalone"), "/tmp/lm-data");
	});

	it("writes the token file with mode 0600 and rewrites it on each start", () => {
		const dir = fs.mkdtempSync(path.join(os.tmpdir(), "lm-host-token-"));
		const file = adminTokenFile(path.join(dir, "nested"));
		writeAdminToken(file, TOKEN);
		assert.equal(fs.readFileSync(file, "utf8"), TOKEN);
		assert.equal(fs.statSync(file).mode & 0o777, 0o600);
		writeAdminToken(file, "Z".repeat(43));
		assert.equal(fs.readFileSync(file, "utf8"), "Z".repeat(43));
		assert.equal(fs.statSync(file).mode & 0o777, 0o600);
		assert.deepEqual(fs.readdirSync(path.dirname(file)), ["host-admin.token"]);
	});
});

const good = {
	ok: true,
	data: {
		code: "A".repeat(21) + "A",
		shortCode: "ABC234",
		expiresAt: "2026-01-01T00:02:00.000Z",
		pairUrl: "https://my-host.tailnet-1234.ts.net/pair#" + "A".repeat(22),
	},
};

describe("host-pair", () => {
	it("builds a loopback request with the host header and no Origin", () => {
		const req = pairRequest({ port: 3210 }, TOKEN);
		assert.equal(req.url, "http://127.0.0.1:3210/api/remote/pairing-code");
		assert.equal(req.init.method, "POST");
		const headers = new Headers(req.init.headers);
		assert.equal(headers.get("x-lh-host-admin"), TOKEN);
		assert.equal(headers.get("origin"), null);
	});

	it("prints a QR, the short code and the expiry", () => {
		const out = formatPairing(good);
		assert.match(out, /[▀▄█]/);
		assert.ok(out.includes("ABC 234"));
		assert.ok(out.includes("2026-01-01T00:02:00.000Z"));
		assert.ok(!out.includes(good.data.pairUrl.split("#")[1] ?? "x"), "the code itself is only in the QR");
	});

	it("throws a fixed message without values on a failure envelope", () => {
		for (const bad of [{ ok: false, error: { code: "remote_disabled", message: "Not found." } }, null, { ok: true, data: { code: "SECRETVALUE" } }]) {
			assert.throws(() => formatPairing(bad), (e: Error) => !e.message.includes("SECRETVALUE") && e.message.length < 80);
		}
	});
});
