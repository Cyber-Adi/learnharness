import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { cookieCorrection, nextFactor } from "../components/mobile/shell/form-factor.ts";

describe("sticky form factor", () => {
	it("does not swap trees after mount when media queries change", () => {
		assert.equal(nextFactor(true, "mobile", "desktop"), "mobile");
		assert.equal(nextFactor(true, "desktop", "mobile"), "desktop");
	});
	it("uses the resolved value only before mount", () => {
		assert.equal(nextFactor(false, "desktop", "mobile"), "mobile");
	});
	it("a disagreeing client resolution produces a cookie correction, not a swap", () => {
		assert.equal(cookieCorrection("mobile", "desktop", true), "desktop");
		assert.equal(cookieCorrection("desktop", "desktop", true), null);
	});
	it("a narrow desktop window does not write a mobile cookie", () => {
		assert.equal(cookieCorrection("desktop", "mobile", false), null);
		assert.equal(cookieCorrection("desktop", "mobile", true), "mobile");
	});
	it("a desktop device that was guessed mobile is still corrected to desktop", () => {
		assert.equal(cookieCorrection("mobile", "desktop", false), "desktop");
	});
});
