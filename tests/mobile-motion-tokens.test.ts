import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
	DURATION,
	EASE,
	HAPTIC,
	MAX_DURATION_MS,
	PRESS_SCALE,
	SPRING,
	staggerDelay,
	toSeconds,
} from "../components/mobile/motion.ts"
import {
	hapticFor,
	navigatorVibrateAdapter,
	noopHapticsAdapter,
} from "../components/mobile/haptics.ts"

type Spring = { stiffness: number; damping: number; mass: number }

// Semi-implicit Euler at 0.1ms; returns the last time (ms) the spring is outside the band.
function settleMs(s: Spring, tolerance = 0.02): number {
	const dt = 0.0001
	let x = 1
	let v = 0
	let last = 0
	for (let t = 0; t < 2; t += dt) {
		const a = (-s.stiffness * x - s.damping * v) / s.mass
		v += a * dt
		x += v * dt
		if (Math.abs(x) > tolerance) last = t
	}
	return last * 1000
}

describe("mobile motion tokens", () => {
	it("every spring preset settles within 300ms", () => {
		for (const [name, preset] of Object.entries(SPRING)) {
			assert.equal(preset.type, "spring", name)
			const ms = settleMs(preset)
			assert.ok(ms <= MAX_DURATION_MS, `${name} settles in ${ms.toFixed(0)}ms`)
		}
	})

	it("every duration is at most MAX_DURATION_MS", () => {
		assert.equal(MAX_DURATION_MS, 300)
		for (const [name, ms] of Object.entries(DURATION)) {
			assert.ok(ms >= 0 && ms <= MAX_DURATION_MS, name)
		}
	})

	it("staggerDelay is capped at max for any item count", () => {
		for (const n of [0, 1, 5, 1000]) {
			assert.ok(staggerDelay(n) <= 150, `index ${n}`)
		}
		assert.equal(staggerDelay(5), 150)
		assert.equal(staggerDelay(2), 60)
		assert.equal(staggerDelay(1000, { step: 30, max: 90 }), 90)
	})

	it("staggerDelay is zero for negative or NaN indices", () => {
		assert.equal(staggerDelay(-1), 0)
		assert.equal(staggerDelay(Number.NaN), 0)
		assert.equal(staggerDelay(-100, { step: 50, max: 200 }), 0)
	})

	it("the exit easing mirrors the enter easing", () => {
		const [a, b, c, d] = EASE.enter
		assert.deepEqual([...EASE.exit], [1 - c, 1 - d, 1 - a, 1 - b])
		assert.equal(EASE.move.length, 4)
		assert.equal(PRESS_SCALE, 0.97)
	})

	it("motion tokens are frozen and serialisable", () => {
		for (const t of [SPRING, DURATION, EASE, HAPTIC]) {
			assert.ok(Object.isFrozen(t))
			assert.deepEqual(JSON.parse(JSON.stringify(t)), t)
		}
		for (const s of Object.values(SPRING)) assert.ok(Object.isFrozen(s))
		assert.equal(toSeconds(200), 0.2)
	})

	it("every haptic event maps to a known kind", () => {
		const kinds = [
			"selection",
			"impactLight",
			"impactMedium",
			"notificationWarning",
			"notificationError",
		]
		for (const event of Object.keys(HAPTIC) as (keyof typeof HAPTIC)[]) {
			assert.ok(kinds.includes(HAPTIC[event]), event)
			assert.equal(hapticFor(event), HAPTIC[event])
		}
		assert.equal(Object.keys(HAPTIC).length, 5)
	})

	it("the vibrate adapter is silent without navigator.vibrate", () => {
		const original = Object.getOwnPropertyDescriptor(globalThis, "navigator")
		Object.defineProperty(globalThis, "navigator", { value: {}, configurable: true })
		try {
			assert.doesNotThrow(() => navigatorVibrateAdapter.trigger("selection"))
			const calls: unknown[] = []
			Object.defineProperty(globalThis, "navigator", {
				value: { vibrate: (p: unknown) => calls.push(p) },
				configurable: true,
			})
			navigatorVibrateAdapter.trigger("impactLight")
			assert.equal(calls.length, 1)
			assert.doesNotThrow(() => noopHapticsAdapter.trigger("selection"))
		} finally {
			if (original) Object.defineProperty(globalThis, "navigator", original)
			else Reflect.deleteProperty(globalThis, "navigator")
		}
	})
})

// Review fix: the analytic 2% check passed while the real library, with its
// absolute 0.5px rest threshold, took 370-445ms on a sheet-sized move.
it("every spring preset settles within 300ms in motion for travel up to 400px", async () => {
	const { spring } = await import("motion");
	for (const [name, p] of Object.entries(SPRING)) {
		for (const travel of [20, 120, 400]) {
			const gen = spring({ keyframes: [0, travel], stiffness: p.stiffness, damping: p.damping, mass: p.mass });
			let t = 0;
			while (!gen.next(t).done && t <= MAX_DURATION_MS) t += 1;
			assert.ok(t <= MAX_DURATION_MS, `${name} took ${t}ms over ${travel}px`);
		}
	}
});
