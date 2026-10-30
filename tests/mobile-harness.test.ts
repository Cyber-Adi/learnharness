import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { clampPercent } from "./mobile-harness-demo.ts"

describe("mobile harness demo", () => {
	it("clampPercent keeps values within 0..100", () => {
		assert.equal(clampPercent(-5), 0)
		assert.equal(clampPercent(42), 42)
		assert.equal(clampPercent(250), 100)
	})

	it("clampPercent rejects NaN with a typed error", () => {
		assert.throws(() => clampPercent(Number.NaN), RangeError)
	})
})
