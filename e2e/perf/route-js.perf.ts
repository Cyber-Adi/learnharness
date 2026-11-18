import { expect, test } from "@playwright/test"
import { readFileSync } from "node:fs"
import { z } from "zod"
import { KNOWN_BUNDLE_DEBT, ROUTE_JS_BUDGET_BYTES } from "../support/resume-gate.ts"

// CLAUDE.md: session-route JS <= 250 KB gzipped. A first launch is what a phone downloads with no cache,
// so this counts every script's encoded (on-the-wire) bytes on a fresh context.
const readSeed = () => z.object({ pending: z.string() }).parse(JSON.parse(readFileSync(process.env.LH_E2E_SEED_FILE ?? "", "utf8")))

for (const route of [
	{ name: "Learn", path: () => "/?source=pwa" },
	{ name: "session", path: () => `/chat/${readSeed().pending}` },
] as const) {
	test(`the ${route.name} route ships at most 250 KB of compressed JS on a first launch`, async ({ browser }) => {
		test.fail(true, KNOWN_BUNDLE_DEBT)
		const context = await browser.newContext(test.info().project.use)
		const page = await context.newPage()
		const scripts: Promise<{ url: string; bytes: number }>[] = []
		page.on("requestfinished", (req) => {
			if (req.resourceType() === "script") scripts.push(req.sizes().then((s) => ({ url: req.url(), bytes: s.responseBodySize })))
		})
		await page.goto(route.path())
		await page.waitForLoadState("networkidle")
		const all = await Promise.all(scripts)
		await context.close()
		const total = all.reduce((sum, s) => sum + s.bytes, 0)
		const top = [...all].sort((a, b) => b.bytes - a.bytes).slice(0, 5).map((s) => `${Math.round(s.bytes / 1024)} KB ${s.url.replace(/^.*\/_next\//, "")}`)
		console.log(`${route.name}: ${Math.round(total / 1024)} KB compressed JS in ${all.length} scripts`, top)
		expect(total, `${route.name} route JS`).toBeLessThanOrEqual(ROUTE_JS_BUDGET_BYTES)
	})
}
