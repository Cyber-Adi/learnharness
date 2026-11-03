import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	FORM_FACTOR_COOKIE,
	formFactorCookie,
	formFactorFromRequest,
} from "../components/mobile/shell/form-factor-server.ts";

const IPHONE =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const IPAD =
	"Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";
const ANDROID = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/126.0 Mobile Safari/537.36";
const DESKTOP = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15";
const ELECTRON = `${DESKTOP} Electron/44.0.0`;

const base = { enabled: true, cookie: undefined, userAgent: DESKTOP, chMobile: null } as const;

describe("formFactorFromRequest", () => {
	it("Electron is always desktop even with a mobile cookie", () => {
		assert.equal(formFactorFromRequest({ ...base, userAgent: ELECTRON, cookie: "mobile", chMobile: "?1" }), "desktop");
	});
	it("disabled flag is always desktop", () => {
		assert.equal(formFactorFromRequest({ ...base, enabled: false, userAgent: IPHONE, cookie: "mobile" }), "desktop");
	});
	it("a valid lh_ff cookie wins over the user agent", () => {
		assert.equal(formFactorFromRequest({ ...base, userAgent: IPHONE, cookie: "desktop" }), "desktop");
		assert.equal(formFactorFromRequest({ ...base, userAgent: DESKTOP, cookie: "mobile" }), "mobile");
	});
	it("an invalid cookie value is ignored", () => {
		assert.equal(formFactorFromRequest({ ...base, userAgent: IPHONE, cookie: "tablet" }), "mobile");
		assert.equal(formFactorFromRequest({ ...base, userAgent: DESKTOP, cookie: "" }), "desktop");
	});
	it("Sec-CH-UA-Mobile ?1 gives mobile", () => {
		assert.equal(formFactorFromRequest({ ...base, chMobile: "?1" }), "mobile");
		assert.equal(formFactorFromRequest({ ...base, userAgent: IPHONE, chMobile: "?0" }), "desktop");
	});
	it("iPhone Safari user agent gives mobile", () => {
		assert.equal(formFactorFromRequest({ ...base, userAgent: IPHONE }), "mobile");
		assert.equal(formFactorFromRequest({ ...base, userAgent: ANDROID }), "mobile");
	});
	it("iPad user agent gives desktop", () => {
		assert.equal(formFactorFromRequest({ ...base, userAgent: IPAD }), "desktop");
		assert.equal(formFactorFromRequest({ ...base, userAgent: "Mozilla/5.0 (Linux; Android 14; Tab) Safari/537.36" }), "desktop");
	});
});

describe("formFactorCookie", () => {
	it("sets Path=/, SameSite=Lax and a 400-day Max-Age", () => {
		const c = formFactorCookie("mobile");
		assert.ok(c.startsWith(`${FORM_FACTOR_COOKIE}=mobile`));
		assert.ok(c.includes("Path=/"));
		assert.ok(c.includes("SameSite=Lax"));
		assert.ok(c.includes(`Max-Age=${400 * 24 * 60 * 60}`));
		assert.ok(!c.includes("HttpOnly"));
	});
});
