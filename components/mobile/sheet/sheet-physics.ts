// Pure sheet physics. No React, no DOM. Offsets are px below the large rest position.

export type Detent = "medium" | "large"

export type ReleaseDecision =
	| { readonly kind: "dismiss" }
	| { readonly kind: "snap"; readonly detent: Detent; readonly spring: "snap" | "fling" }

export interface ReleaseInput {
	/** Drag distance from the current detent's rest position; positive is down. */
	readonly offsetY: number
	/** Release velocity in px/s; positive is down. */
	readonly velocityY: number
	/** Height of the large panel. */
	readonly sheetHeight: number
	readonly detents: readonly Detent[]
	readonly current: Detent
	/** Distance between the large and medium rest positions. */
	readonly mediumOffset?: number
}

export interface VelocitySample {
	readonly y: number
	readonly t: number
}

// Dismiss when dragged past this share of the visible sheet, or flung down faster than this.
export const DISMISS_FRACTION = 0.25
export const DISMISS_VELOCITY = 900
export const FLING_VELOCITY = 500
export const LARGE_TOP_INSET = 12
export const MEDIUM_FRACTION = 0.55
// Medium shows about 60% of the large panel when the viewport is not known.
const FALLBACK_MEDIUM_OFFSET_RATIO = 0.4
const VELOCITY_WINDOW_MS = 100
const RUBBER_CONSTANT = 0.55

export function detentY(detent: Detent, viewportHeight: number, safeTop: number): number {
	const large = safeTop + LARGE_TOP_INSET
	if (detent === "large") return large
	return Math.max(large, viewportHeight * (1 - MEDIUM_FRACTION))
}

export function detentTravel(viewportHeight: number, safeTop: number): number {
	return detentY("medium", viewportHeight, safeTop) - detentY("large", viewportHeight, safeTop)
}

// Resistance grows with distance; the result approaches but never reaches `dimension`.
export function rubberBand(overscroll: number, dimension: number): number {
	if (!Number.isFinite(overscroll) || !Number.isFinite(dimension) || dimension <= 0) return 0
	const o = Math.abs(overscroll)
	const banded = (o * dimension * RUBBER_CONSTANT) / (dimension + RUBBER_CONSTANT * o)
	return overscroll < 0 ? -banded : banded
}

// 1:1 below the top rest position, rubber-banded above it.
export function dragPosition(originY: number, dy: number, topRest: number, dimension: number): number {
	const raw = originY + dy
	return raw >= topRest ? raw : topRest - rubberBand(topRest - raw, dimension)
}

export function estimateVelocity(samples: readonly VelocitySample[], now: number): number {
	const last = samples[samples.length - 1]
	if (!last || now - last.t > VELOCITY_WINDOW_MS) return 0
	const first = samples.find((s) => last.t - s.t <= VELOCITY_WINDOW_MS)
	if (!first || last.t === first.t) return 0
	return ((last.y - first.y) / (last.t - first.t)) * 1000
}

interface Rest {
	readonly detent: Detent
	readonly pos: number
}

function restsFor(detents: readonly Detent[], travel: number): readonly Rest[] {
	const unique = Array.from(new Set(detents))
	return unique
		.map((detent): Rest => ({ detent, pos: detent === "large" ? 0 : travel }))
		.sort((a, b) => a.pos - b.pos)
}

function nearest(rests: readonly Rest[], y: number): Rest | undefined {
	return rests.reduce<Rest | undefined>(
		(best, r) => (best === undefined || Math.abs(r.pos - y) < Math.abs(best.pos - y) ? r : best),
		undefined,
	)
}

export function releaseDecision(input: ReleaseInput): ReleaseDecision {
	const { offsetY, velocityY, sheetHeight, current } = input
	const travel = input.mediumOffset ?? sheetHeight * FALLBACK_MEDIUM_OFFSET_RATIO
	const rests = restsFor(input.detents.length > 0 ? input.detents : [current], travel)
	const lowest = rests[rests.length - 1]
	const index = rests.findIndex((r) => r.detent === current)
	const here = rests[index] ?? { detent: current, pos: current === "large" ? 0 : travel }
	if (!lowest) return { kind: "snap", detent: current, spring: "snap" }

	const final = here.pos + offsetY
	const visible = sheetHeight - lowest.pos
	if (velocityY > DISMISS_VELOCITY && here.detent === lowest.detent) return { kind: "dismiss" }
	if (final - lowest.pos > DISMISS_FRACTION * visible) return { kind: "dismiss" }

	if (Math.abs(velocityY) > FLING_VELOCITY) {
		const step = velocityY > 0 ? 1 : -1
		const target = rests[index + step] ?? here
		return { kind: "snap", detent: target.detent, spring: "fling" }
	}
	return { kind: "snap", detent: (nearest(rests, final) ?? here).detent, spring: "snap" }
}
