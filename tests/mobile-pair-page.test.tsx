import React from "react";
(globalThis as Record<string, unknown>).React = React;
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { PairView, type PairViewProps } from "../components/mobile/pairing/pair-page.tsx";
import { INSTALL_STEPS } from "../components/mobile/pairing/pair-model.ts";

const noop = () => {};
const view = (over: Partial<PairViewProps> = {}) =>
	renderToStaticMarkup(
		<PairView phase="form" hasCode deviceName="iPhone" shortCode="" onDeviceName={noop} onShortCode={noop} onSubmit={noop} onRetry={noop} {...over} />,
	);

describe("phone pair page", () => {
	it("the form has a device name defaulting to iPhone and a Pair this phone button", () => {
		const html = view();
		assert.match(html, /value="iPhone"/);
		assert.match(html, /maxLength="64"/);
		assert.ok(html.includes(">Pair this phone<"));
	});
	it("offers a Have a code field for the short code", () => {
		const html = view({ hasCode: false, shortCode: "ABC" });
		assert.ok(html.includes("Have a code?"));
		assert.match(html, /value="ABC"/);
		assert.match(html, /autoCapitalize="characters"/);
	});
	it("disables Pair this phone without a code or a full short code", () => {
		assert.match(view({ hasCode: false }), /disabled=""[^>]*>Pair this phone/);
		assert.doesNotMatch(view({ hasCode: false, shortCode: "ABC234" }), /disabled=""[^>]*>Pair this phone/);
	});
	it("success shows Paired and the iPhone install steps", () => {
		const html = view({ phase: "paired" });
		assert.ok(html.includes("Paired"));
		for (const step of INSTALL_STEPS) assert.ok(html.includes(step.replace(/&/g, "&amp;")), step);
		assert.match(html, /<a[^>]*href="\/"[^>]*>Continue in Safari</);
		assert.ok(!html.includes("Pair this phone"));
	});
	it("failure shows the expired-code copy and a retry", () => {
		const html = view({ phase: "failed" });
		assert.ok(html.includes("That code did not work. It may have expired. Get a new code on your desktop."));
		assert.ok(html.includes(">Try again<"));
	});
	it("uses 44pt hit areas on controls", () => {
		assert.match(view(), /min-h-11/);
	});
});
