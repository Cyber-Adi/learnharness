import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { encode } from "uqr";
import { parseDevices, type PairCode } from "../components/mobile/pairing/pair-dialog-model.ts";
import { DeviceList } from "../components/mobile/pairing/pair-devices.tsx";
import { PairCodePanel, PairPhoneView } from "../components/mobile/pairing/pair-dialog.tsx";
import { PairQr } from "../components/mobile/pairing/pair-qr.tsx";

const NOW = Date.parse("2026-01-01T12:00:00.000Z");
const ID1 = "A".repeat(22);
const ID2 = "B".repeat(22);
const noop = () => {};
const devices = parseDevices({
	ok: true,
	data: {
		devices: [
			{ id: ID1, name: "Adhij iPhone", scopes: ["learn"], createdAt: "2026-01-01T00:00:00.000Z", lastSeenAt: "2026-01-01T11:30:00.000Z", keyVersion: 1, tokenHash: "SECRETHASH" },
			{ id: ID2, name: "iPad", scopes: ["learn"], createdAt: "2026-01-01T00:00:00.000Z", lastSeenAt: null, keyVersion: 1, tokenHash: "SECRETHASH2" },
		],
	},
}) ?? [];
const PAIR_URL = `https://my-mac.tailnet-1234.ts.net/pair#${"x".repeat(21)}A`;
const code: PairCode = { shortCode: "ABC234", expiresAt: "2026-01-01T12:02:00.000Z", pairUrl: PAIR_URL };

const list = (confirmingId: string | null) =>
	renderToStaticMarkup(<DeviceList devices={devices} now={NOW} confirmingId={confirmingId} onAskRevoke={noop} onConfirmRevoke={noop} onCancel={noop} />);

describe("device list", () => {
	it("lists devices without token hashes and offers Revoke per device", () => {
		const html = list(null);
		assert.ok(html.includes("Adhij iPhone") && html.includes("iPad"));
		assert.ok(html.includes("30 minutes ago") && html.includes("never"));
		assert.ok(!html.includes("SECRETHASH"));
		assert.equal((html.match(/>Revoke</g) ?? []).length, 2);
	});
	it("revoke asks for confirmation first", () => {
		const html = list(ID1);
		assert.match(html, /Revoke Adhij iPhone\?/);
		assert.ok(html.includes(">Cancel<"));
		assert.equal((html.match(/>Revoke</g) ?? []).length, 1, "the other device still shows a plain Revoke");
		assert.ok(html.includes(">Revoke device<"));
		assert.ok(!list(null).includes("Revoke device"));
	});
	it("shows an empty state", () => {
		const html = renderToStaticMarkup(<DeviceList devices={[]} now={NOW} confirmingId={null} onAskRevoke={noop} onConfirmRevoke={noop} onCancel={noop} />);
		assert.match(html, /No phones paired yet/);
	});
});

describe("pair phone section view", () => {
	const view = (remote: "unknown" | "off") =>
		renderToStaticMarkup(<PairPhoneView remote={remote} devices={devices} now={NOW} confirmingId={null} busy={false} onPair={noop} onAskRevoke={noop} onConfirmRevoke={noop} onCancelRevoke={noop} />);
	it("offers the Pair a phone button by default", () => {
		assert.ok(view("unknown").includes(">Pair a phone<"));
	});
	it("remote off shows the remote-off copy and no Pair button", () => {
		const html = view("off");
		assert.ok(html.includes("Remote access is off. Set LH_REMOTE_HOSTS on the host to pair a phone."));
		assert.ok(!html.includes(">Pair a phone<"));
	});
});

describe("pair QR", () => {
	it("the QR is an inline svg for the pair URL", () => {
		const html = renderToStaticMarkup(<PairQr value={PAIR_URL} />);
		assert.ok(html.startsWith("<svg"));
		assert.ok(!html.includes("<img") && !html.includes("http"));
		assert.match(html, /width="240"/);
		assert.match(html, /height="240"/);
		assert.match(html, /role="img"/);
		const size = encode(PAIR_URL, { border: 0 }).size;
		assert.ok(html.includes(`viewBox="0 0 ${size + 8} ${size + 8}"`), "size plus a 4-module quiet zone each side");
		assert.match(html, /fill="#fff/i);
	});
	it("a different URL gives a different symbol", () => {
		const a = renderToStaticMarkup(<PairQr value={PAIR_URL} />);
		const b = renderToStaticMarkup(<PairQr value={`${PAIR_URL}z`} />);
		assert.notEqual(a, b);
	});
});

describe("pair code panel", () => {
	it("the short code is grouped in threes", () => {
		const html = renderToStaticMarkup(<PairCodePanel code={code} now={NOW} onNewCode={noop} />);
		assert.ok(html.includes("ABC 234"));
		assert.match(html, /font-mono/);
		assert.ok(html.includes("2:00"));
		assert.ok(html.startsWith("<div") && html.includes("<svg"));
		assert.ok(!html.includes("New code"));
	});
	it("an expired code shows New code and no QR", () => {
		const html = renderToStaticMarkup(<PairCodePanel code={code} now={NOW + 121_000} onNewCode={noop} />);
		assert.ok(html.includes(">New code<"));
		assert.ok(!html.includes("<svg"));
		assert.ok(!html.includes("ABC 234"));
	});
});
