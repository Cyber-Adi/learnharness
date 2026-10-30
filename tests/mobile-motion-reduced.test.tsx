import React from "react"
;(globalThis as Record<string, unknown>).React = React

import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import {
	ReducedMotionRoot,
	motionTransition,
	resolveReducedMotion,
} from "../components/mobile/reduced-motion.tsx"
import { SPRING } from "../components/mobile/motion.ts"

describe("mobile reduced motion", () => {
	it("resolveReducedMotion is true without matchMedia (first render is safe)", () => {
		assert.equal(resolveReducedMotion(null), true)
	})

	it("resolveReducedMotion follows the media query", () => {
		assert.equal(resolveReducedMotion({ matches: true }), true)
		assert.equal(resolveReducedMotion({ matches: false }), false)
	})

	it("motionTransition collapses to zero duration when reduced", () => {
		assert.deepEqual(motionTransition("settle", true), { duration: 0 })
		assert.deepEqual(motionTransition("sheet", false), SPRING.sheet)
	})

	it("ReducedMotionRoot renders its children", () => {
		const html = renderToStaticMarkup(
			<ReducedMotionRoot>
				<p>hello</p>
			</ReducedMotionRoot>,
		)
		assert.equal(html, "<p>hello</p>")
	})
})
