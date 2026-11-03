import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
	DISMISS_FRACTION,
	DISMISS_VELOCITY,
	FLING_VELOCITY,
	LARGE_TOP_INSET,
	MEDIUM_FRACTION,
	detentTravel,
	detentY,
	dragPosition,
	estimateVelocity,
	releaseDecision,
	rubberBand,
} from "../components/mobile/sheet/sheet-physics.ts"

const SHEET = 800
const TRAVEL = 300
const both = ["medium", "large"] as const

describe("mobile sheet physics: releaseDecision", () => {
	it("a short slow drag snaps back to the current detent", () => {
		const d = releaseDecision({
			offsetY: 40,
			velocityY: 0,
			sheetHeight: SHEET,
			detents: ["large"],
			current: "large",
		})
		assert.deepEqual(d, { kind: "snap", detent: "large", spring: "snap" })
	})

	it("a drag past 25% of the sheet height dismisses", () => {
		const over = DISMISS_FRACTION * SHEET + 1
		const under = DISMISS_FRACTION * SHEET - 1
		const base = { velocityY: 0, sheetHeight: SHEET, detents: ["large"] as const, current: "large" as const }
		assert.deepEqual(releaseDecision({ ...base, offsetY: over }), { kind: "dismiss" })
		assert.equal(releaseDecision({ ...base, offsetY: under }).kind, "snap")
	})

	it("a fast downward flick dismisses even when short", () => {
		const d = releaseDecision({
			offsetY: 10,
			velocityY: DISMISS_VELOCITY + 1,
			sheetHeight: SHEET,
			detents: ["large"],
			current: "large",
		})
		assert.deepEqual(d, { kind: "dismiss" })
	})

	it("a fast upward flick from medium snaps to large with the fling spring", () => {
		const d = releaseDecision({
			offsetY: -20,
			velocityY: -(FLING_VELOCITY + 100),
			sheetHeight: SHEET,
			detents: both,
			current: "medium",
			mediumOffset: TRAVEL,
		})
		assert.deepEqual(d, { kind: "snap", detent: "large", spring: "fling" })
	})

	it("a slow release between detents snaps to the nearest with the snap spring", () => {
		const base = { velocityY: -50, sheetHeight: SHEET, detents: both, current: "medium" as const, mediumOffset: TRAVEL }
		assert.deepEqual(releaseDecision({ ...base, offsetY: -200 }), { kind: "snap", detent: "large", spring: "snap" })
		assert.deepEqual(releaseDecision({ ...base, offsetY: -100 }), { kind: "snap", detent: "medium", spring: "snap" })
	})

	it("a fast downward flick from large lands on medium, not dismissed, when medium exists", () => {
		const d = releaseDecision({
			offsetY: 30,
			velocityY: DISMISS_VELOCITY + 200,
			sheetHeight: SHEET,
			detents: both,
			current: "large",
			mediumOffset: TRAVEL,
		})
		assert.deepEqual(d, { kind: "snap", detent: "medium", spring: "fling" })
	})

	it("a fast downward flick from the lowest detent dismisses", () => {
		const d = releaseDecision({
			offsetY: 5,
			velocityY: DISMISS_VELOCITY + 200,
			sheetHeight: SHEET,
			detents: both,
			current: "medium",
			mediumOffset: TRAVEL,
		})
		assert.deepEqual(d, { kind: "dismiss" })
	})

	it("dragging medium down past 25% of its visible height dismisses", () => {
		const visible = SHEET - TRAVEL
		const base = { velocityY: 0, sheetHeight: SHEET, detents: both, current: "medium" as const, mediumOffset: TRAVEL }
		assert.equal(releaseDecision({ ...base, offsetY: DISMISS_FRACTION * visible + 1 }).kind, "dismiss")
		assert.equal(releaseDecision({ ...base, offsetY: DISMISS_FRACTION * visible - 1 }).kind, "snap")
	})

	it("a slow flick upward at the top detent springs back to it with the fling spring", () => {
		const d = releaseDecision({
			offsetY: -30,
			velocityY: -(FLING_VELOCITY + 1),
			sheetHeight: SHEET,
			detents: ["large"],
			current: "large",
		})
		assert.deepEqual(d, { kind: "snap", detent: "large", spring: "fling" })
	})

	it("a medium-only sheet uses medium as its only rest position", () => {
		const d = releaseDecision({
			offsetY: -40,
			velocityY: -10,
			sheetHeight: SHEET,
			detents: ["medium"],
			current: "medium",
			mediumOffset: TRAVEL,
		})
		assert.deepEqual(d, { kind: "snap", detent: "medium", spring: "snap" })
	})

	it("falls back to a default medium offset derived from the sheet height", () => {
		const d = releaseDecision({
			offsetY: -(SHEET * 0.4),
			velocityY: 0,
			sheetHeight: SHEET,
			detents: both,
			current: "medium",
		})
		assert.equal(d.kind === "snap" ? d.detent : null, "large")
	})
})

describe("mobile sheet physics: rubberBand", () => {
	it("never exceeds the dimension and is 0 at 0", () => {
		assert.equal(rubberBand(0, 500), 0)
		for (const over of [1, 10, 100, 1000, 1e6, 1e12]) {
			const v = rubberBand(over, 500)
			assert.ok(v > 0 && v <= 500, `${over} -> ${v}`)
		}
	})

	it("is monotonic, sign preserving and safe on bad input", () => {
		assert.ok(rubberBand(50, 500) < rubberBand(100, 500))
		assert.ok(rubberBand(-50, 500) < 0)
		assert.equal(rubberBand(50, 0), 0)
		assert.equal(rubberBand(Number.NaN, 500), 0)
	})
})

describe("mobile sheet physics: geometry", () => {
	it("detentY respects the safe-area top inset", () => {
		assert.equal(detentY("large", 800, 0), LARGE_TOP_INSET)
		assert.equal(detentY("large", 844, 47), 47 + LARGE_TOP_INSET)
		assert.equal(detentY("large", 844, 47) - detentY("large", 844, 0), 47)
	})

	it("medium sits at 45% down so the sheet shows 55% of the viewport", () => {
		assert.equal(MEDIUM_FRACTION, 0.55)
		assert.ok(Math.abs(detentY("medium", 800, 47) - 800 * 0.45) < 1e-9)
	})

	it("medium never rises above large on a tiny viewport", () => {
		assert.equal(detentY("medium", 20, 0), detentY("large", 20, 0))
	})

	it("detentTravel is the distance between the two rest positions", () => {
		assert.ok(Math.abs(detentTravel(844, 47) - (844 * 0.45 - (47 + LARGE_TOP_INSET))) < 1e-9)
		assert.equal(detentTravel(20, 0), 0)
	})
})

describe("mobile sheet physics: constants", () => {
	it("dismiss threshold and fling velocity are exported constants", () => {
		assert.equal(DISMISS_FRACTION, 0.25)
		assert.equal(DISMISS_VELOCITY, 900)
		assert.equal(FLING_VELOCITY, 500)
		assert.equal(LARGE_TOP_INSET, 12)
	})
})

describe("mobile sheet physics: drag helpers", () => {
	it("dragPosition tracks 1:1 below the top rest and rubber-bands above it", () => {
		assert.equal(dragPosition(300, 50, 0, 800), 350)
		assert.equal(dragPosition(300, -300, 0, 800), 0)
		const above = dragPosition(0, -200, 0, 800)
		assert.ok(above < 0 && above > -200)
	})

	it("estimateVelocity uses recent samples only and is 0 when stale", () => {
		const s = [
			{ y: 0, t: 0 },
			{ y: 50, t: 50 },
			{ y: 100, t: 100 },
		]
		assert.equal(estimateVelocity(s, 100), 1000)
		assert.equal(estimateVelocity(s, 400), 0)
		assert.equal(estimateVelocity([{ y: 1, t: 1 }], 1), 0)
		assert.equal(estimateVelocity([], 1), 0)
		assert.equal(estimateVelocity([{ y: 0, t: 5 }, { y: 9, t: 5 }], 5), 0)
	})
})
