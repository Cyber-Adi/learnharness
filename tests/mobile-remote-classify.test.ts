import assert from "node:assert/strict";
import { test } from "node:test";
import {
	classifyRequest,
	localAuthorizedWithoutSecret,
} from "../src/server/remote/classify.ts";

const remoteHosts = Object.freeze(["my-mac.tailnet-1234.ts.net"]);
const base = {
	remoteHosts,
	desktopCapabilityValid: false,
	desktopModeConfigured: false,
	forwarded: false,
};

test("the tunnel host is remote even when desktop mode is not configured", () => {
	const kind = classifyRequest({ ...base, hostHeader: "my-mac.tailnet-1234.ts.net" });
	assert.equal(kind, "remote");
	assert.equal(classifyRequest({ ...base, hostHeader: "MY-MAC.tailnet-1234.ts.net" }), "remote");
});

test("a remote request is not authorized by the absence of a desktop secret", () => {
	const kind = classifyRequest({ ...base, hostHeader: "my-mac.tailnet-1234.ts.net" });
	assert.equal(localAuthorizedWithoutSecret(kind, false), false);
	assert.equal(localAuthorizedWithoutSecret("local", false), true);
	assert.equal(localAuthorizedWithoutSecret("local", true), false);
	assert.equal(localAuthorizedWithoutSecret("desktop", false), false);
	assert.equal(localAuthorizedWithoutSecret("reject", false), false);
});

test("an unknown Host is rejected (DNS rebinding)", () => {
	for (const hostHeader of ["evil.example.com", "127.0.0.1.evil.com", "192.168.1.5:3000", "", null, undefined]) {
		assert.equal(classifyRequest({ ...base, hostHeader }), "reject", String(hostHeader));
	}
});

test("loopback hosts with ports are local", () => {
	for (const hostHeader of ["127.0.0.1", "127.0.0.1:3000", "[::1]:3000", "[::1]", "localhost", "localhost:51234"]) {
		assert.equal(classifyRequest({ ...base, hostHeader }), "local", hostHeader);
	}
	assert.equal(classifyRequest({ ...base, hostHeader: "localhost:99999x" }), "reject");
});

test("a valid desktop capability wins over host", () => {
	for (const hostHeader of ["my-mac.tailnet-1234.ts.net", "127.0.0.1:3000", "evil.example.com"]) {
		const kind = classifyRequest({ ...base, hostHeader, desktopCapabilityValid: true, desktopModeConfigured: true });
		assert.equal(kind, "desktop", hostHeader);
	}
});
