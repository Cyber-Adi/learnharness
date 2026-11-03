import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { motionValue } from "motion"
import { type GestureOptions, createDragController } from "../components/mobile/sheet/sheet-gesture.ts"

function setup(startY = 0) {
	const y = motionValue(startY)
	const releases: { offsetY: number; velocityY: number }[] = []
	let grabs = 0
	const opts: GestureOptions = {
		y,
		enabled: true,
		topRest: 0,
		dimension: 800,
		currentRest: startY,
		canExpand: false,
		onGrab: () => {
			grabs += 1
		},
		onRelease: (r) => releases.push(r),
	}
	return { y, releases, grabs: () => grabs, controller: createDragController(() => opts) }
}

describe("mobile sheet drag controller", () => {
	it("tracks the finger 1:1 from the live value and reports offset and velocity on release", () => {
		const { y, releases, grabs, controller } = setup(100)
		controller.begin(500, 0)
		assert.equal(controller.active, true)
		assert.equal(grabs(), 1)
		controller.move(540, 40)
		controller.move(600, 100)
		assert.equal(y.get(), 200)
		controller.end(100)
		assert.equal(controller.active, false)
		assert.deepEqual(releases, [{ offsetY: 100, velocityY: 1000 }])
	})

	it("rubber-bands above the top rest and still reports the raw offset", () => {
		const { y, releases, controller } = setup(0)
		controller.begin(500, 0)
		controller.move(300, 50)
		assert.ok(y.get() < 0 && y.get() > -200)
		controller.end(2000)
		assert.equal(releases[0]?.offsetY, -200)
		assert.equal(releases[0]?.velocityY, 0)
	})

	it("ignores move and end without a begin", () => {
		const { y, releases, controller } = setup(7)
		controller.move(10, 1)
		controller.end(2)
		assert.equal(y.get(), 7)
		assert.deepEqual(releases, [])
	})
})
