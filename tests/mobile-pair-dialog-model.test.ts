import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	formatCountdown, groupShortCode, parseCodeResponse, parseDevices, relativeTime, remainingMs,
} from "../components/mobile/pairing/pair-dialog-model.ts";

const ID = "A".repeat(22);
const NOW = Date.parse("2026-01-01T12:00:00.000Z");

describe("pair dialog model", () => {
	it("the short code is grouped in threes", () => {
		assert.equal(groupShortCode("ABC234"), "ABC 234");
		assert.equal(groupShortCode("ABCDEFGH"), "ABC DEF GH");
	});
	it("counts down to the expiry and never goes negative", () => {
		assert.equal(remainingMs("2026-01-01T12:02:00.000Z", NOW), 120_000);
		assert.equal(remainingMs("2026-01-01T11:59:00.000Z", NOW), 0);
		assert.equal(remainingMs("not a date", NOW), 0);
	});
	it("formats a countdown as m:ss, rounding up", () => {
		assert.equal(formatCountdown(120_000), "2:00");
		assert.equal(formatCountdown(59_001), "1:00");
		assert.equal(formatCountdown(5_000), "0:05");
		assert.equal(formatCountdown(0), "0:00");
	});
	it("describes last seen relatively", () => {
		assert.equal(relativeTime(null, NOW), "never");
		assert.equal(relativeTime("2026-01-01T11:59:40.000Z", NOW), "just now");
		assert.equal(relativeTime("2026-01-01T11:30:00.000Z", NOW), "30 minutes ago");
		assert.equal(relativeTime("2026-01-01T09:00:00.000Z", NOW), "3 hours ago");
		assert.equal(relativeTime("2025-12-29T12:00:00.000Z", NOW), "3 days ago");
	});
	it("parseDevices keeps only the shown fields and drops revoked devices", () => {
		const json = {
			ok: true,
			data: {
				devices: [
					{ id: ID, name: "iPhone", scopes: ["learn"], createdAt: "2026-01-01T00:00:00.000Z", lastSeenAt: null, keyVersion: 1, tokenHash: "SECRETHASH" },
					{ id: "B".repeat(22), name: "Old", scopes: ["learn"], createdAt: "2026-01-01T00:00:00.000Z", lastSeenAt: null, keyVersion: 1, revokedAt: "2026-01-02T00:00:00.000Z" },
				],
			},
		};
		const devices = parseDevices(json);
		assert.deepEqual(devices, [{ id: ID, name: "iPhone", createdAt: "2026-01-01T00:00:00.000Z", lastSeenAt: null }]);
		assert.ok(!JSON.stringify(devices).includes("SECRETHASH"));
	});
	it("parseDevices rejects a malformed response", () => {
		assert.equal(parseDevices({ ok: true, data: { devices: [{ id: 1 }] } }), null);
		assert.equal(parseDevices(null), null);
	});
	it("parseCodeResponse maps ok, remote_disabled and everything else", () => {
		const code = { shortCode: "ABC234", expiresAt: "2026-01-01T12:02:00.000Z", pairUrl: `https://h.ts.net/pair#${ID}` };
		assert.deepEqual(parseCodeResponse({ ok: true, data: { ...code, code: ID } }), { kind: "code", code });
		assert.deepEqual(parseCodeResponse({ ok: false, error: { code: "remote_disabled", message: "Not found." } }), { kind: "remote_disabled" });
		assert.deepEqual(parseCodeResponse({ ok: false, error: { code: "internal", message: "x" } }), { kind: "error" });
		assert.deepEqual(parseCodeResponse("junk"), { kind: "error" });
	});
});
