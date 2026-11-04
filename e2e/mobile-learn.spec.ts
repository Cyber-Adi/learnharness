import fs from "node:fs"
import { expect, test } from "@playwright/test"
import { z } from "zod"

test.skip(process.env.LH_E2E_MOBILE !== "1", "set LH_E2E_MOBILE=1 (lead runs this with the shell on)")

const seedSchema = z.object({ pending: z.string(), finished: z.string(), pendingCallId: z.string() })

function readSeed() {
	const file = process.env.LH_E2E_SEED_FILE
	if (!file) throw new Error("LH_E2E_SEED_FILE is not set")
	return seedSchema.parse(JSON.parse(fs.readFileSync(file, "utf8")))
}

const cases = [
	{ project: "iphone-13", label: "390x844" },
	{ project: "iphone-se", label: "375x667" },
] as const

for (const c of cases) {
	test.describe(`Learn tab at ${c.label}`, () => {
		test.beforeEach(async ({ page: _page }, info) => {
			test.skip(info.project.name !== c.project, `runs on ${c.project} only`)
		})

		test("lists seeded sessions and shows the pending one as Your turn", async ({ page }) => {
			const seed = readSeed()
			await page.goto("/")
			await expect(page.getByRole("heading", { name: "Learn", level: 1 })).toBeVisible()
			const pending = page.locator(`a[href="/chat/${seed.pending}"]`)
			await expect(pending).toBeVisible()
			await expect(pending).toContainText("Planets quiz")
			await expect(pending).toContainText("Your turn")
			await expect(page.locator(`a[href="/chat/${seed.finished}"]`)).toContainText("Inner planets overview")
			const box = await pending.boundingBox()
			expect(box?.height ?? 0).toBeGreaterThanOrEqual(56)
		})

		test("tapping a row opens the session", async ({ page }) => {
			const seed = readSeed()
			await page.goto("/")
			await page.locator(`a[href="/chat/${seed.finished}"]`).tap()
			// next dev compiles /chat/[id] on first visit (several seconds); timing is gated on a prod build.
			await expect(page).toHaveURL(new RegExp(`/chat/${seed.finished}$`), { timeout: 20_000 })
		})

		test("has no horizontal overflow", async ({ page }) => {
			await page.goto("/")
			await expect(page.getByRole("heading", { name: "Learn", level: 1 })).toBeVisible()
			const widths = await page.evaluate(() => ({
				scrollWidth: document.documentElement.scrollWidth,
				innerWidth: window.innerWidth,
			}))
			expect(widths.scrollWidth).toBeLessThanOrEqual(widths.innerWidth)
		})
	})
}
