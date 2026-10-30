import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
	MOBILE_MAX_WIDTH,
	detectElectron,
	resolveFormFactor,
} from "../components/mobile/shell/form-factor.ts";

const base = { enabled: true, width: 1200, coarsePointer: false, standalone: false, electron: false };

describe("resolveFormFactor", () => {
	it("767px wide is mobile and 768px is desktop", () => {
		assert.equal(MOBILE_MAX_WIDTH, 767);
		assert.equal(resolveFormFactor({ ...base, width: 767 }), "mobile");
		assert.equal(resolveFormFactor({ ...base, width: 768 }), "desktop");
	});
	it("a coarse pointer counts as mobile only in standalone mode", () => {
		assert.equal(resolveFormFactor({ ...base, coarsePointer: true }), "desktop");
		assert.equal(resolveFormFactor({ ...base, standalone: true }), "desktop");
		assert.equal(resolveFormFactor({ ...base, coarsePointer: true, standalone: true }), "mobile");
	});
	it("Electron is always desktop even when narrow", () => {
		assert.equal(resolveFormFactor({ ...base, width: 400, electron: true }), "desktop");
		assert.equal(
			resolveFormFactor({ ...base, coarsePointer: true, standalone: true, electron: true }),
			"desktop",
		);
	});
	it("a disabled flag is always desktop", () => {
		assert.equal(resolveFormFactor({ ...base, enabled: false, width: 320 }), "desktop");
	});
	it("detectElectron matches the upstream includes rule", () => {
		assert.equal(detectElectron("Mozilla/5.0 Electron/30.0.0 Safari/537.36"), true);
		assert.equal(detectElectron("Mozilla/5.0 (iPhone) Safari"), false);
	});
});
