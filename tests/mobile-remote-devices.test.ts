import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import {
	createDevice,
	deviceCookie,
	listDevices,
	resolveDevice,
	revokeDevice,
	type RandomBytes,
} from "../src/server/remote/devices.ts";

const T0 = Date.UTC(2026, 0, 1);
function fresh(): string {
	return join(mkdtempSync(join(tmpdir(), "lh-dev-")), "devices.json");
}
function counterBytes(): RandomBytes {
	let n = 0;
	return (size) => Buffer.alloc(size, ++n);
}
const cookieOf = (d: { record: { id: string }; token: string }) => `${d.record.id}.${d.token}`;

test("a created device's token is returned once and only its hash is stored", () => {
	const file = fresh();
	const d = createDevice(file, { name: "Phone", scopes: ["learn"] }, T0, counterBytes());
	assert.match(d.token, /^[A-Za-z0-9_-]{43}$/);
	const raw = readFileSync(file, "utf8");
	assert.equal(raw.includes(d.token), false);
	assert.ok(raw.includes(createHash("sha256").update(d.token).digest("hex")));
	assert.equal(resolveDevice(file, cookieOf(d), T0)?.id, d.record.id);
});

test("a tampered token does not resolve", () => {
	const file = fresh();
	const d = createDevice(file, { name: "Phone", scopes: ["learn"] }, T0, counterBytes());
	const bad = `${d.token.slice(0, -1)}${d.token.endsWith("A") ? "B" : "A"}`;
	assert.equal(resolveDevice(file, `${d.record.id}.${bad}`, T0), null);
	assert.equal(resolveDevice(file, "garbage", T0), null);
	assert.equal(resolveDevice(file, "", T0), null);
});

test("a cookie for another device id does not resolve", () => {
	const file = fresh();
	const rb = counterBytes();
	const a = createDevice(file, { name: "A", scopes: ["learn"] }, T0, rb);
	const b = createDevice(file, { name: "B", scopes: ["learn"] }, T0, rb);
	assert.equal(resolveDevice(file, `${b.record.id}.${a.token}`, T0), null);
});

test("revoke keeps the record and stops it resolving", () => {
	const file = fresh();
	const d = createDevice(file, { name: "Phone", scopes: ["learn"] }, T0, counterBytes());
	assert.equal(revokeDevice(file, d.record.id, T0 + 5), true);
	assert.equal(resolveDevice(file, cookieOf(d), T0 + 10), null);
	const listed = listDevices(file);
	assert.equal(listed.length, 1);
	assert.ok(listed[0]?.revokedAt);
	assert.equal(revokeDevice(file, "A".repeat(21) + "A", T0), false);
});

test("requested host-only scopes are dropped", () => {
	const file = fresh();
	const d = createDevice(
		file,
		{ name: "Phone", scopes: ["learn", "admin", "graph:write", "learn"] },
		T0,
		counterBytes(),
	);
	assert.deepEqual([...d.record.scopes], ["learn"]);
	assert.throws(() => createDevice(file, { name: "X", scopes: ["admin"] }, T0, counterBytes()));
});

test("a corrupt devices file reads empty and refuses writes", () => {
	const file = fresh();
	writeFileSync(file, "{not json");
	assert.deepEqual(listDevices(file), []);
	assert.equal(resolveDevice(file, `${"A".repeat(22)}.${"A".repeat(43)}`, T0), null);
	assert.throws(() => createDevice(file, { name: "P", scopes: ["learn"] }, T0, counterBytes()));
	assert.equal(readFileSync(file, "utf8"), "{not json");
});

test("lastSeenAt updates at most once per minute", () => {
	const file = fresh();
	const d = createDevice(file, { name: "Phone", scopes: ["learn"] }, T0, counterBytes());
	const c = cookieOf(d);
	assert.equal(resolveDevice(file, c, T0)?.lastSeenAt, new Date(T0).toISOString());
	assert.equal(resolveDevice(file, c, T0 + 30_000)?.lastSeenAt, new Date(T0).toISOString());
	assert.equal(
		resolveDevice(file, c, T0 + 61_000)?.lastSeenAt,
		new Date(T0 + 61_000).toISOString(),
	);
});

test("listDevices never includes token hashes", () => {
	const file = fresh();
	createDevice(file, { name: "Phone", scopes: ["learn"] }, T0, counterBytes());
	assert.equal(JSON.stringify(listDevices(file)).includes("tokenHash"), false);
});

test("deviceCookie sets __Host- prefix, Secure, HttpOnly, SameSite=Strict, Path=/", () => {
	const c = deviceCookie("abc.def");
	assert.ok(c.startsWith("__Host-lh_device=abc.def;"));
	for (const part of ["Secure", "HttpOnly", "SameSite=Strict", "Path=/", "Max-Age=34560000"]) {
		assert.ok(c.split("; ").includes(part), part);
	}
	assert.equal(c.includes("Domain"), false);
});
