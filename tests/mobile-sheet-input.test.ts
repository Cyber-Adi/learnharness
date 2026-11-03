import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { cancelMotion, enterPlan } from "../components/mobile/sheet/sheet-lifecycle.ts"
import { pickTouch, shouldStartPointer } from "../components/mobile/sheet/sheet-input.ts"

describe("mobile sheet pointer filter", () => {
	it("a right click does not start a drag", () => {
		assert.equal(shouldStartPointer({ isPrimary: true, button: 2 }), false)
	})
	it("a non-primary pointer does not start a drag", () => {
		assert.equal(shouldStartPointer({ isPrimary: false, button: 0 }), false)
	})
	it("a primary main-button pointer starts a drag", () => {
		assert.equal(shouldStartPointer({ isPrimary: true, button: 0 }), true)
	})
})

describe("mobile sheet touch lookup", () => {
	const list = [
		{ identifier: 4, clientY: 10 },
		{ identifier: 9, clientY: 90 },
	]
	it("finds the starting touch by identifier, not by index", () => {
		assert.equal(pickTouch(list, 9)?.clientY, 90)
	})
	it("returns nothing when the starting touch is not in the list", () => {
		assert.equal(pickTouch(list, 7), undefined)
	})
	it("returns nothing before any touch started", () => {
		assert.equal(pickTouch(list, null), undefined)
	})
})

describe("mobile sheet open lifecycle", () => {
	it("reopening mid-exit animates from the current position", () => {
		assert.deepEqual(enterPlan({ entered: false, exiting: true, currentY: 420, height: 800 }), { kind: "animate", from: 420 })
	})
	it("a fresh open animates in from below the sheet", () => {
		assert.deepEqual(enterPlan({ entered: false, exiting: false, currentY: 10000, height: 800 }), { kind: "animate", from: 800 })
	})
	it("an already entered sheet snaps to its rest without animating", () => {
		assert.deepEqual(enterPlan({ entered: true, exiting: false, currentY: 0, height: 800 }), { kind: "snap" })
	})
	it("unmount stops the running animation", () => {
		let stops = 0
		cancelMotion({ stop: () => { stops += 1 } }, 3)
		assert.equal(stops, 1)
	})
	it("unmount bumps the close token so a pending exit cannot resolve", () => {
		assert.equal(cancelMotion(null, 3), 4)
	})
})
