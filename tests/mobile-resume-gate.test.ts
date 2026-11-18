import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { RESUME_BUDGET_MS, ROUTE_JS_BUDGET_BYTES, SLOW_4G, formatGate, judge, summarize } from "../e2e/support/resume-gate.ts"

describe("resume gate budget", () => {
	it("the budget is the PRD's 3 s", () => {
		assert.equal(RESUME_BUDGET_MS, 3000)
	})
	it("phone routes ship at most CLAUDE.md's 250 KB of gzipped JS", () => {
		assert.equal(ROUTE_JS_BUDGET_BYTES, 256_000)
	})
	it("throttles to Lighthouse's Slow 4G: 150 ms RTT, 1.6 Mbps down, 750 Kbps up, 4x CPU", () => {
		assert.deepEqual(SLOW_4G, { latency: 150, downloadThroughput: 200_000, uploadThroughput: 93_750, cpuSlowdown: 4 })
	})
})

describe("summarize", () => {
	it("reports count, median and worst", () => {
		assert.deepEqual(summarize([900, 1200, 1000, 2900, 1100]), { n: 5, median: 1100, worst: 2900 })
	})
	it("the median of an even count is the mean of the middle two", () => {
		assert.deepEqual(summarize([1000, 3000, 2000, 4000]), { n: 4, median: 2500, worst: 4000 })
	})
	it("does not reorder the caller's samples", () => {
		const samples = [3, 1, 2]
		summarize(samples)
		assert.deepEqual(samples, [3, 1, 2])
	})
	it("refuses an empty run", () => {
		assert.throws(() => summarize([]), /no samples/)
	})
	it("refuses a missing or negative sample instead of hiding it", () => {
		assert.throws(() => summarize([1000, Number.NaN]), /invalid sample/)
		assert.throws(() => summarize([1000, -1]), /invalid sample/)
		assert.throws(() => summarize([1000, Number.POSITIVE_INFINITY]), /invalid sample/)
	})
})

describe("judge", () => {
	it("passes when the worst sample is at or under budget", () => {
		assert.equal(judge([1000, 3000], 3000).pass, true)
	})
	it("fails when any sample is over budget, even if the median is fine", () => {
		const v = judge([800, 900, 3001], 3000)
		assert.equal(v.pass, false)
		assert.equal(v.median, 900)
		assert.equal(v.worst, 3001)
	})
})

describe("formatGate", () => {
	it("prints a one-line verdict with median, worst and budget", () => {
		assert.equal(formatGate("warm", judge([1000, 1400, 1200], 3000)), "resume warm: PASS median 1200 ms, worst 1400 ms of 3 (budget 3000 ms)")
		assert.equal(formatGate("cold", judge([3500], 3000)), "resume cold: FAIL median 3500 ms, worst 3500 ms of 1 (budget 3000 ms)")
	})
})
