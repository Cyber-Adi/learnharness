// Review fixes for the gateway pure core (Phase 0 code review, 2026-10-29).
import assert from "node:assert/strict";
import { test } from "node:test";
import { classifyRequest, localAuthorizedWithoutSecret } from "../src/server/remote/classify.ts";
import { HOST_ONLY_SCOPES, METHODS, ROUTE_SCOPES, SCOPES, remoteAllowed, scopeFor } from "../src/server/remote/scopes.ts";
import { PairRequest, PairingCode, RefreshPayload } from "../src/server/remote/schemas.ts";

const base = Object.freeze({
	remoteHosts: Object.freeze(["my-mac.tailnet-1234.ts.net"]),
	desktopCapabilityValid: false,
	desktopModeConfigured: false,
	forwarded: false,
});

test("a proxied request that rewrote Host to loopback is never local", () => {
	for (const hostHeader of ["localhost", "127.0.0.1:3000", "[::1]"]) {
		const kind = classifyRequest({ ...base, hostHeader, forwarded: true });
		assert.equal(kind, "reject", hostHeader);
		assert.equal(localAuthorizedWithoutSecret(kind, false), false);
	}
});

test("a proxied request on the tunnel host is still remote", () => {
	assert.equal(classifyRequest({ ...base, hostHeader: "my-mac.tailnet-1234.ts.net", forwarded: true }), "remote");
});

test("Host values are matched strictly, without trimming", () => {
	for (const hostHeader of ["my-mac.tailnet-1234.ts.net\n", " localhost", "localhost\t"]) {
		assert.equal(classifyRequest({ ...base, hostHeader }), "reject", JSON.stringify(hostHeader));
	}
});

test("loopback ports use the same grammar as LH_REMOTE_HOSTS", () => {
	for (const hostHeader of ["127.0.0.1:0", "localhost:03000", "localhost:65536"]) {
		assert.equal(classifyRequest({ ...base, hostHeader }), "reject", hostHeader);
	}
	assert.equal(classifyRequest({ ...base, hostHeader: "localhost:65535" }), "local");
});

test("methods outside the table are denied, even on wildcard routes", () => {
	for (const method of ["HEAD", "OPTIONS", "TRACE", "CONNECT", "__proto__"]) {
		assert.equal(scopeFor(method, "/api/chats/abc"), null, method);
	}
});

test("host-only scopes are never remotely allowed for any method or listed route", () => {
	const hostOnlyEntries = ROUTE_SCOPES.filter((e) => HOST_ONLY_SCOPES.includes(e.scope));
	assert.ok(hostOnlyEntries.length > 0);
	for (const entry of hostOnlyEntries) {
		const path = entry.pattern.replaceAll("[id]", "x").replaceAll("/**", "/x").replace(/\[[^\]]+\]/g, "x");
		for (const method of entry.methods === "*" ? METHODS : entry.methods) {
			assert.equal(remoteAllowed(method, path, SCOPES), false, `${method} ${path}`);
		}
	}
});

test("pairing codes and refresh tokens must be canonical base64url", () => {
	// 128 bits in 22 chars leaves 4 spare bits; only A, Q, g, w end a canonical code.
	assert.equal(PairingCode.safeParse(`${"A".repeat(21)}Q`).success, true);
	assert.equal(PairingCode.safeParse(`${"A".repeat(21)}B`).success, false);
	const deviceId = `${"A".repeat(21)}w`;
	assert.equal(RefreshPayload.safeParse({ deviceId, token: `${"A".repeat(42)}E` }).success, true);
	assert.equal(RefreshPayload.safeParse({ deviceId, token: `${"A".repeat(42)}B` }).success, false);
});

test("device names reject bidi overrides and zero-width characters", () => {
	const code = `${"A".repeat(21)}Q`;
	for (const deviceName of ["Adi‮evil", "Adi​", "Adi⁦x", "‏Adi"]) {
		assert.equal(PairRequest.safeParse({ code, deviceName }).success, false, JSON.stringify(deviceName));
	}
	assert.equal(PairRequest.safeParse({ code, deviceName: "Adi's iPhone" }).success, true);
});
