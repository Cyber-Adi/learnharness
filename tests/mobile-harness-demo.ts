// Tiny pure function that proves the RED -> GREEN and coverage-gate harness.
export function clampPercent(n: number): number {
	if (Number.isNaN(n)) throw new RangeError("clampPercent: NaN is not a percentage")
	return Math.min(100, Math.max(0, n))
}
