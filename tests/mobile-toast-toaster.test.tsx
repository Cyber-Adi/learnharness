import React from "react"
;(globalThis as Record<string, unknown>).React = React
import assert from "node:assert/strict"
import { readFileSync, readdirSync, statSync } from "node:fs"
import { join, relative } from "node:path"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { MobileToaster, TOASTER_PROPS, toastClassNames } from "../components/mobile/toast/toaster.tsx"

const ROOT = join(import.meta.dirname, "..")

function walk(dir: string, out: string[] = []): string[] {
	for (const name of readdirSync(dir)) {
		if (name === "node_modules" || name === ".next" || name.startsWith(".")) continue
		const p = join(dir, name)
		if (statSync(p).isDirectory()) walk(p, out)
		else if (/\.(ts|tsx)$/.test(name)) out.push(p)
	}
	return out
}

describe("mobile toaster", () => {
	it("MobileToaster renders nothing in the desktop form factor", () => {
		assert.equal(renderToStaticMarkup(<MobileToaster formFactor="desktop" />), "")
	})

	it("MobileToaster renders the notification region in the mobile form factor", () => {
		const html = renderToStaticMarkup(<MobileToaster formFactor="mobile" />)
		assert.match(html, /<section aria-label="Notifications/)
	})

	it("only the mobile shell tree imports sonner", () => {
		const offenders = [join(ROOT, "app"), join(ROOT, "components"), join(ROOT, "src")]
			.flatMap((d) => walk(d))
			.filter((f) => !relative(ROOT, f).startsWith(join("components", "mobile")))
			.filter((f) => /from ["']sonner["']/.test(readFileSync(f, "utf8")))
		assert.deepEqual(offenders, [])
	})

	it("config matches the brief", () => {
		assert.equal(TOASTER_PROPS.position, "top-center")
		assert.equal(TOASTER_PROPS.visibleToasts, 3)
		assert.equal(TOASTER_PROPS.duration, 4000)
		assert.equal(TOASTER_PROPS.theme, "system")
		assert.equal(TOASTER_PROPS.closeButton, false)
		assert.match(String(TOASTER_PROPS.offset), /--lh-m-safe-top/)
		assert.match(String(TOASTER_PROPS.mobileOffset), /--lh-m-safe-top/)
	})

	it("every toast class is scoped under [data-lh-mobile]", () => {
		const tokens = Object.values(toastClassNames).flatMap((v) => v.split(/\s+/)).filter(Boolean)
		assert.ok(tokens.length > 0)
		for (const t of tokens) assert.match(t, /^\[\[data-lh-mobile\]_&\]:/, t)
	})

	it("hit area, text floor and no blur on toasts", () => {
		const all = Object.values(toastClassNames).join(" ")
		assert.match(all, /min-h-11/)
		assert.doesNotMatch(all, /blur|backdrop/)
		for (const m of all.matchAll(/text-\[(\d+)px\]/g)) assert.ok(Number(m[1]) >= 12)
	})
})
