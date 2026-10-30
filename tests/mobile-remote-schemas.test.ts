import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";
import { test } from "node:test";
import {
	DeviceRecord,
	PairRequest,
	PairingCode,
	RefreshPayload,
	RemoteHosts,
} from "../src/server/remote/schemas.ts";

const code = "A".repeat(22);
// Real encodings, as the host will mint them.
const token = randomBytes(32).toString("base64url");

test("the pairing code must be exactly 128-bit base64url", () => {
	assert.equal(PairingCode.safeParse(code).success, true);
	for (let i = 0; i < 50; i++) assert.equal(PairingCode.safeParse(randomBytes(16).toString("base64url")).success, true);
	for (const bad of ["A".repeat(21), "A".repeat(23), `${"A".repeat(21)}=`, `${"A".repeat(21)}+`, `${"A".repeat(21)}/`, "", 5]) {
		assert.equal(PairingCode.safeParse(bad).success, false, String(bad));
	}
});

test("the pair request rejects unknown fields and control chars in the device name", () => {
	assert.equal(PairRequest.safeParse({ code, deviceName: "  Adi's iPhone " }).data?.deviceName, "Adi's iPhone");
	assert.equal(PairRequest.safeParse({ code, deviceName: "x", extra: 1 }).success, false);
	for (const name of ["a\nb", "a\u0000b", "a\u007fb", "", "   ", "x".repeat(65)]) {
		assert.equal(PairRequest.safeParse({ code, deviceName: name }).success, false, JSON.stringify(name));
	}
	assert.equal(PairRequest.safeParse({ code, deviceName: "x".repeat(64) }).success, true);
});

const device = {
	id: code,
	name: "Phone",
	scopes: ["learn", "graph:read"],
	createdAt: "2026-10-29T00:00:00.000Z",
	lastSeenAt: null,
	keyVersion: 1,
};

test("the device record cannot carry admin or graph:write", () => {
	assert.equal(DeviceRecord.safeParse(device).success, true);
	assert.equal(DeviceRecord.safeParse({ ...device, lastSeenAt: "2026-10-29T01:00:00Z" }).success, true);
	for (const scopes of [["admin"], ["learn", "graph:write"], [], ["bogus"]]) {
		assert.equal(DeviceRecord.safeParse({ ...device, scopes }).success, false, scopes.join());
	}
	assert.equal(DeviceRecord.safeParse({ ...device, keyVersion: 0 }).success, false);
	assert.equal(DeviceRecord.safeParse({ ...device, extra: true }).success, false);
});

test("the refresh payload needs a 256-bit token", () => {
	assert.equal(RefreshPayload.safeParse({ deviceId: code, token }).success, true);
	assert.equal(RefreshPayload.safeParse({ deviceId: code, token: "B".repeat(42) }).success, false);
});

test("LH_REMOTE_HOSTS rejects schemes, wildcards, IPs and localhost, and empty means off", () => {
	const ok = RemoteHosts.parse("my-mac.tailnet-1234.ts.net, host.example.com:8443");
	assert.deepEqual([...ok], ["my-mac.tailnet-1234.ts.net", "host.example.com:8443"]);
	assert.ok(Object.isFrozen(ok));
	for (const off of [undefined, "", "  ", " , "]) {
		const parsed = RemoteHosts.parse(off);
		assert.deepEqual([...parsed], []);
		assert.ok(Object.isFrozen(parsed));
	}
	for (const bad of [
		"https://a.example.com",
		"a.example.com/path",
		"*.example.com",
		"127.0.0.1",
		"10.0.0.5:3000",
		"[::1]",
		"localhost",
		"localhost:3000",
		"A.Example.com",
		"a.example.com:0",
		"a.example.com:70000",
		"a.example.com:",
		"-a.example.com",
		"a b.example.com",
	]) {
		assert.equal(RemoteHosts.safeParse(bad).success, false, bad);
	}
});
