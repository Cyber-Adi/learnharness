import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { describe, it } from "node:test"

const css = readFileSync(new URL("../components/mobile/mobile.css", import.meta.url), "utf8").replace(
	/\/\*[\s\S]*?\*\//g,
	"",
)

// Selector preludes: text before each "{", excluding at-rule headers.
function selectors(): string[] {
	const out: string[] = []
	for (const m of css.matchAll(/([^{}]+)\{/g)) {
		const prelude = (m[1] ?? "").trim()
		if (!prelude.startsWith("@")) out.push(prelude)
	}
	return out
}

describe("mobile.css", () => {
	it("every mobile.css rule is scoped to [data-lh-mobile]", () => {
		const all = selectors()
		assert.ok(all.length > 10)
		for (const prelude of all) {
			for (const sel of prelude.split(",").map((s) => s.trim())) {
				assert.ok(
					sel.startsWith("[data-lh-mobile]") || sel.startsWith(".dark [data-lh-mobile]"),
					`unscoped selector: ${sel}`,
				)
			}
		}
	})

	it("materials have opaque fallbacks for no-backdrop-filter, more contrast, and reduced transparency", () => {
		assert.match(css, /@supports not \(backdrop-filter: blur\(1px\)\)/)
		assert.match(css, /@media \(prefers-contrast: more\)/)
		assert.match(css, /@media \(prefers-reduced-transparency: reduce\)/)
		assert.match(css, /\.lh-m-glass/)
		assert.match(css, /\.lh-m-scrim/)
		assert.match(css, /blur\(20px\)/)
	})

	it("mobile.css animates only transform and opacity", () => {
		const allowed = new Set(["transform", "opacity", "none", "all"])
		for (const m of css.matchAll(/transition-property\s*:\s*([^;]+);/g)) {
			for (const p of (m[1] ?? "").split(",")) assert.ok(allowed.has(p.trim()) && p.trim() !== "all", p)
		}
		for (const m of css.matchAll(/(?:^|[;{\s])transition\s*:\s*([^;]+);/g)) {
			const first = (m[1] ?? "").trim().split(/\s+/)[0] ?? ""
			assert.ok(["transform", "opacity", "none"].includes(first), `transition: ${m[1]}`)
		}
		assert.doesNotMatch(css, /@keyframes/)
	})
})
