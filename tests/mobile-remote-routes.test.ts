import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, beforeEach, test } from "node:test";
import { DELETE } from "../app/api/remote/devices/[id]/route.ts";
import { GET as listRoute } from "../app/api/remote/devices/route.ts";
import { POST as pairRoute } from "../app/api/remote/pair/route.ts";
import { POST as codeRoute } from "../app/api/remote/pairing-code/route.ts";
import { setPairingStore } from "../src/server/remote/handlers.ts";
import { resolveDevice } from "../src/server/remote/devices.ts";
import { createPairingStore } from "../src/server/remote/pairing.ts";

const HOST = "my-mac.tailnet-1234.ts.net";
const saved = { hosts: process.env.LH_REMOTE_HOSTS, file: process.env.LH_REMOTE_DEVICES_FILE };
let file = "";

beforeEach(() => {
	file = join(mkdtempSync(join(tmpdir(), "lh-routes-")), "devices.json");
	process.env.LH_REMOTE_DEVICES_FILE = file;
	process.env.LH_REMOTE_HOSTS = HOST;
	setPairingStore(createPairingStore());
});
after(() => {
	for (const [k, v] of [["LH_REMOTE_HOSTS", saved.hosts], ["LH_REMOTE_DEVICES_FILE", saved.file]] as const) {
		if (v === undefined) delete process.env[k];
		else process.env[k] = v;
	}
});

const post = (url: string, body: unknown) =>
	new Request(`https://${HOST}${url}`, { method: "POST", body: typeof body === "string" ? body : JSON.stringify(body) });

test("pairing-code returns remote_disabled when no remote host is configured", async () => {
	process.env.LH_REMOTE_HOSTS = "";
	const res = await codeRoute(post("/api/remote/pairing-code", ""));
	assert.equal(res.status, 404);
	assert.equal(((await res.json()) as { error: { code: string } }).error.code, "remote_disabled");
});

async function issue() {
	const res = await codeRoute(post("/api/remote/pairing-code", ""));
	assert.equal(res.status, 200);
	return ((await res.json()) as { data: { code: string; shortCode: string; pairUrl: string; expiresAt: string } }).data;
}

test("pairing-code returns a pair URL on the first remote host", async () => {
	const d = await issue();
	assert.equal(d.pairUrl, `https://${HOST}/pair#${d.code}`);
	assert.match(d.shortCode, /^[A-HJ-NP-Z2-9]{6}$/);
});

test("pair with a valid code sets the device cookie and grants the default mobile scopes", async () => {
	const { code } = await issue();
	const res = await pairRoute(post("/api/remote/pair", { code, deviceName: "Adi's iPhone" }));
	assert.equal(res.status, 200);
	const body = (await res.json()) as { data: { deviceId: string; name: string; scopes: string[] } };
	assert.deepEqual(body.data.scopes, ["learn", "graph:read", "activity", "models:read"]);
	assert.equal(res.headers.get("cache-control"), "no-store");
	const cookie = res.headers.get("set-cookie") ?? "";
	assert.ok(cookie.startsWith("__Host-lh_device="));
	assert.ok(cookie.includes("HttpOnly") && cookie.includes("Secure") && cookie.includes("SameSite=Strict"));
	const value = cookie.split(";")[0]?.split("=").slice(1).join("=") ?? "";
	assert.equal(resolveDevice(file, value, Date.now())?.id, body.data.deviceId);
	assert.equal(readFileSync(file, "utf8").includes(value.split(".")[1] ?? "x"), false);
	const again = await pairRoute(post("/api/remote/pair", { code, deviceName: "Again" }));
	assert.equal(again.status, 401);
});

test("pair accepts the short code form", async () => {
	const { shortCode } = await issue();
	const res = await pairRoute(post("/api/remote/pair", { shortCode: shortCode.toLowerCase(), deviceName: "Phone" }));
	assert.equal(res.status, 200);
});

test("pair with a bad body returns invalid_input without echoing it", async () => {
	for (const body of ["{nope", { code: "leak-me-please", deviceName: "x" }, { code: "x", extra: "leak-me-please" }]) {
		const res = await pairRoute(post("/api/remote/pair", body));
		const text = await res.text();
		assert.equal(res.status, 400);
		assert.equal((JSON.parse(text) as { error: { code: string } }).error.code, "invalid_input");
		assert.equal(text.includes("leak-me"), false);
	}
});

test("devices list never includes token hashes, and revoke works", async () => {
	const { code } = await issue();
	const paired = (await (await pairRoute(post("/api/remote/pair", { code, deviceName: "Phone" }))).json()) as { data: { deviceId: string } };
	const res = await listRoute(new Request(`https://${HOST}/api/remote/devices`));
	const text = await res.text();
	assert.equal(text.includes("tokenHash"), false);
	assert.equal(text.includes(paired.data.deviceId), true);
	const del = await DELETE(new Request(`https://${HOST}/api/remote/devices/x`, { method: "DELETE" }), {
		params: Promise.resolve({ id: paired.data.deviceId }),
	});
	assert.equal(del.status, 200);
	const bad = await DELETE(new Request(`https://${HOST}/api/remote/devices/x`, { method: "DELETE" }), {
		params: Promise.resolve({ id: "../etc" }),
	});
	assert.equal(bad.status, 400);
});
