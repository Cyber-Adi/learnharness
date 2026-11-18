// Gate 2 (PRD Decisions): resume <= 3 s on 4G, cold and warm measured separately.
// Pure so the verdict math is unit-tested (tests/mobile-resume-gate.test.ts).

export const RESUME_BUDGET_MS = 3000
// CLAUDE.md UI budget: session-route JS <= 250 KB gzipped (held for every phone route).
export const ROUTE_JS_BUDGET_BYTES = 250 * 1024
// Runs per kind; the warm runs each consume one seeded pending question.
export const COLD_RUNS = 5
export const WARM_RUNS = 5

// Lighthouse's mobile "Slow 4G": 150 ms RTT, 1.6 Mbps down, 750 Kbps up (bytes/s), 4x CPU for a mid-range phone.
export const SLOW_4G = Object.freeze({
	latency: 150,
	downloadThroughput: (1.6 * 1_000_000) / 8,
	uploadThroughput: (750 * 1_000) / 8,
	cpuSlowdown: 4,
})

export interface Summary {
	readonly n: number
	readonly median: number
	readonly worst: number
}

export interface Verdict extends Summary {
	readonly pass: boolean
	readonly budget: number
}

export function summarize(samples: readonly number[]): Summary {
	if (samples.length === 0) throw new Error("no samples")
	if (samples.some((s) => !Number.isFinite(s) || s < 0)) throw new Error("invalid sample")
	const sorted = [...samples].sort((a, b) => a - b)
	const at = (i: number): number => sorted[i] ?? Number.NaN
	const mid = Math.floor(sorted.length / 2)
	const median = sorted.length % 2 === 1 ? at(mid) : (at(mid - 1) + at(mid)) / 2
	return { n: sorted.length, median, worst: at(sorted.length - 1) }
}

// The gate is on the worst run, not the median: one slow resume is a resume the learner sat through.
export function judge(samples: readonly number[], budget: number = RESUME_BUDGET_MS): Verdict {
	const s = summarize(samples)
	return { ...s, budget, pass: s.worst <= budget }
}

export function formatGate(kind: string, v: Verdict): string {
	const ms = (x: number) => `${Math.round(x)} ms`
	return `resume ${kind}: ${v.pass ? "PASS" : "FAIL"} median ${ms(v.median)}, worst ${ms(v.worst)} of ${v.n} (budget ${ms(v.budget)})`
}

// Known debt (docs/GATES.md): phone routes ship 616 KB (Learn) and 1050 KB (session) of compressed JS
// because the @/src/core barrel and the root layout's desktop providers reach every route. Tests marked
// with this reason use test.fail(): they pass only while still over budget, so fixing the bundle turns
// them red until they are promoted back to hard gates.
export const KNOWN_BUNDLE_DEBT = "known debt: phone routes over the 250 KB JS budget (docs/GATES.md)"

