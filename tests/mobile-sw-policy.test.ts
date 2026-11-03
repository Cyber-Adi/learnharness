import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";
import { swStrategy, CACHE_NAME } from "../components/mobile/pwa/sw-policy.ts";
import { shouldRegisterSw } from "../components/mobile/pwa/sw-register.tsx";

const o = "https://host.example.ts.net";

describe("swStrategy", () => {
	it("/api requests are network-only", () => {
		assert.equal(swStrategy({ method: "GET", url: `${o}/api/graph`, mode: "cors" }), "network-only");
		assert.equal(swStrategy({ method: "GET", url: `${o}/api`, mode: "navigate" }), "network-only");
	});
	it("non-GET requests are network-only", () => {
		assert.equal(swStrategy({ method: "POST", url: `${o}/_next/static/a.js`, mode: "cors" }), "network-only");
		assert.equal(swStrategy({ method: "post", url: `${o}/`, mode: "navigate" }), "network-only");
	});
	it("/_next/static is cache-first", () => {
		assert.equal(swStrategy({ method: "GET", url: `${o}/_next/static/chunks/a.js`, mode: "no-cors" }), "cache-first");
	});
	it("an icon refresh is picked up: /icons is stale-while-revalidate, not cache-first", () => {
		assert.equal(swStrategy({ method: "GET", url: `${o}/icons/icon-192.png`, mode: "no-cors" }), "stale-while-revalidate");
	});
	it("navigations are network-first with the shell fallback", () => {
		assert.equal(swStrategy({ method: "GET", url: `${o}/learn`, mode: "navigate" }), "network-first-shell");
	});
	it("everything else is network-only", () => {
		assert.equal(swStrategy({ method: "GET", url: `${o}/other.json`, mode: "cors" }), "network-only");
		assert.equal(swStrategy({ method: "GET", url: "not a url", mode: "cors" }), "network-only");
	});
	it("sw.js never mentions push", () => {
		const src = readFileSync(new URL("../public/sw.js", import.meta.url), "utf8");
		assert.ok(src.includes(`"${CACHE_NAME}"`));
		assert.ok(!/push/i.test(src));
	});
});

describe("shouldRegisterSw", () => {
	const ok = { production: true, secure: true, electron: false, mobileShell: true, supported: true };
	it("registers when every condition holds", () => assert.equal(shouldRegisterSw(ok), true));
	it("is skipped in Electron, outside a secure context, and in development", () => {
		assert.equal(shouldRegisterSw({ ...ok, electron: true }), false);
		assert.equal(shouldRegisterSw({ ...ok, secure: false }), false);
		assert.equal(shouldRegisterSw({ ...ok, production: false }), false);
		assert.equal(shouldRegisterSw({ ...ok, mobileShell: false }), false);
		assert.equal(shouldRegisterSw({ ...ok, supported: false }), false);
	});
});
