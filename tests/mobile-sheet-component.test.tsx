import React from "react"
;(globalThis as Record<string, unknown>).React = React
import assert from "node:assert/strict"
import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { Sheet } from "../components/mobile/sheet/sheet.tsx"

const SHEET_DIR = join(import.meta.dirname, "..", "components", "mobile", "sheet")
const noop = () => {}

function render(props: { reducedMotion?: boolean; description?: string } = {}): string {
	return renderToStaticMarkup(
		<Sheet open onOpenChange={noop} title="Answer the question" portal={false} {...props}>
			<p>body</p>
		</Sheet>,
	)
}

describe("mobile sheet component", () => {
	it("renders the title for screen readers", () => {
		const html = render()
		assert.match(html, /role="dialog"/)
		assert.match(html, /<h2[^>]*>Answer the question<\/h2>/)
		assert.match(html, /<h2 id="[^"]+"/) // Radix links aria-labelledby after mount, once the title registers
	})

	it("renders the description when given and the body content", () => {
		const html = render({ description: "Pick one" })
		assert.match(html, />Pick one</)
		assert.match(html, /<p>body<\/p>/)
	})

	it("renders nothing when closed", () => {
		const html = renderToStaticMarkup(
			<Sheet open={false} onOpenChange={noop} title="t" portal={false}>
				x
			</Sheet>,
		)
		assert.equal(html, "")
	})

	it("renders a visible Close button under reduced motion", () => {
		const html = render({ reducedMotion: true })
		assert.match(html, /<button[^>]*>Close<\/button>/)
		assert.doesNotMatch(html, /data-sheet-grabber/)
	})

	it("keeps the Close button when motion is allowed", () => {
		assert.match(render({ reducedMotion: false }), /<button[^>]*>Close<\/button>/)
	})

	it("the grabber hit area is at least 44px tall", () => {
		const html = render({ reducedMotion: false })
		const m = html.match(/<div[^>]*data-sheet-grabber[^>]*>/)
		assert.ok(m, "grabber rendered")
		const height = m[0].match(/min-height:\s*(\d+)px/)
		assert.ok(height, "grabber has an explicit min-height")
		assert.ok(Number(height[1]) >= 44)
	})

	it("the Close button hit area is at least 44px", () => {
		const m = render().match(/<button[^>]*>Close<\/button>/)
		assert.ok(m)
		assert.match(m[0], /min-height:\s*44px/)
		assert.match(m[0], /min-width:\s*44px/)
	})

	it("uses only SPRING tokens from motion.ts", () => {
		const files = readdirSync(SHEET_DIR).filter((f) => /\.(ts|tsx|css)$/.test(f))
		assert.ok(files.length >= 2)
		for (const f of files) {
			const src = readFileSync(join(SHEET_DIR, f), "utf8")
			assert.doesNotMatch(src, /stiffness/, f)
			assert.doesNotMatch(src, /damping/, f)
		}
	})

	it("all classes and selectors are scoped under the mobile shell", () => {
		const html = render()
		const scope = html.indexOf("data-lh-mobile")
		assert.ok(scope >= 0, "wrapper carries data-lh-mobile")
		assert.ok(html.indexOf("lh-m-glass") > scope)
		assert.ok(html.indexOf("lh-m-scrim") > scope)
		for (const f of readdirSync(SHEET_DIR).filter((n) => n.endsWith(".css"))) {
			const css = readFileSync(join(SHEET_DIR, f), "utf8")
			for (const sel of css.replace(/\/\*[\s\S]*?\*\//g, "").matchAll(/(^|\})\s*([^{}@]+)\{/g)) {
				assert.match((sel[2] ?? "").trim(), /^\[data-lh-mobile\]/, `${f}: ${sel[2]}`)
			}
		}
	})

	it("only animates transform and opacity", () => {
		const src = readFileSync(join(SHEET_DIR, "sheet.tsx"), "utf8")
		assert.doesNotMatch(src, /animate\([^)]*(height|top|bottom|left|right|width)\b/)
	})
})
