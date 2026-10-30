// Pure motion data and helpers. No React. All exports are frozen and JSON-safe.

export const MAX_DURATION_MS = 300

export const SPRING = Object.freeze({
	// Tuned against motion's own spring generator (0.5px rest delta) for 20-400px
	// travel; worst-case settle in ms noted per preset. See tests/mobile-motion-tokens.
	// zeta=1.0 (critical): no overshoot; worst 280ms
	settle: Object.freeze({ type: "spring", stiffness: 1650, damping: 81, mass: 1 }),
	// zeta=0.85: slight overshoot reads as a physical sheet; worst 277ms
	sheet: Object.freeze({ type: "spring", stiffness: 1500, damping: 66, mass: 1 }),
	// zeta=0.8: lively tail for released velocity; worst 275ms
	fling: Object.freeze({ type: "spring", stiffness: 1350, damping: 59, mass: 1 }),
	// zeta=1.0 (critical): stiffer than settle for small snaps; worst < 260ms
	snap: Object.freeze({ type: "spring", stiffness: 2000, damping: 89, mass: 1 }),
} as const)

export type SpringKind = keyof typeof SPRING

export const DURATION = Object.freeze({ instant: 0, fast: 120, base: 200, slow: 300 } as const)

// Standard ease-out cubic (easeOutCubic-like); exit is its point mirror, i.e. ease-in.
export const EASE = Object.freeze({
	enter: Object.freeze([0.215, 0.61, 0.355, 1] as const),
	exit: Object.freeze([0.645, 0, 0.785, 0.39] as const),
	move: Object.freeze([0.645, 0.045, 0.355, 1] as const),
})

export const PRESS_SCALE = 0.97

export const HAPTIC = Object.freeze({
	select: "selection",
	confirm: "impactLight",
	warn: "notificationWarning",
	error: "notificationError",
	sheetSnap: "impactMedium",
} as const)

export type HapticEvent = keyof typeof HAPTIC
export type HapticKind = (typeof HAPTIC)[HapticEvent]

export function toSeconds(ms: number): number {
	return ms / 1000
}

export function staggerDelay(
	index: number,
	{ step = 30, max = 150 }: { step?: number; max?: number } = {},
): number {
	if (!Number.isFinite(index) || index < 0) return 0
	return Math.min(Math.max(0, Math.round(index * step)), Math.max(0, Math.round(max)))
}
