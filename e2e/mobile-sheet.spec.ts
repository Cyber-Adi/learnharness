import fs from "node:fs"
import { expect, test } from "@playwright/test"

// Real-DOM sheet behaviour the unit tests cannot see (docs/LESSONS.md: "done" only when visible).
test.skip(process.env.LH_E2E_MOBILE !== "1", "needs the mobile shell and seeded data")

const readSeed = (): { pending: string } => JSON.parse(fs.readFileSync(process.env.LH_E2E_SEED_FILE ?? "", "utf8"))

for (const project of ["iphone-13", "iphone-se"] as const) {
	test(`an opened sheet slides on screen on ${project}`, async ({ page }, info) => {
		test.skip(info.project.name !== project, `runs on ${project} only`)
		await page.goto(`/chat/${readSeed().pending}`)
		await page.getByRole("button", { name: "Answer", exact: true }).click()
		const dialog = page.getByRole("dialog")
		await expect(dialog).toBeVisible()
		const vh = page.viewportSize()?.height ?? 0
		await expect
			.poll(async () => (await dialog.boundingBox())?.y ?? Number.POSITIVE_INFINITY, { timeout: 2000 })
			.toBeLessThan(vh)
		// Hit-test only once the entry spring has settled: a mid-flight box is stale by the time it is probed.
		let last = Number.NaN
		await expect
			.poll(async () => {
				const y = (await dialog.boundingBox())?.y ?? Number.NaN
				const settled = y === last
				last = y
				return settled
			}, { timeout: 2000, intervals: [50] })
			.toBe(true)
		// The first option is hit-testable at its centre (no layer swallows the tap).
		const option = dialog.getByRole("radio").first()
		const box = await option.boundingBox()
		expect(box).not.toBeNull()
		if (!box) return
		const hit = await page.evaluate(
			([x, y]) => document.elementFromPoint(x, y)?.closest('[role="radio"]') !== null,
			[box.x + box.width / 2, box.y + box.height / 2] as const,
		)
		expect(hit).toBe(true)
	})
}

for (const project of ["iphone-13", "iphone-se"] as const) {
	test(`the answer sheet's Submit is reachable without dragging on ${project}`, async ({ page }, info) => {
		test.skip(info.project.name !== project, `runs on ${project} only`)
		await page.goto(`/chat/${readSeed().pending}`)
		await page.getByRole("button", { name: "Answer", exact: true }).click()
		const submit = page.getByRole("dialog").getByRole("button", { name: "Submit" })
		await submit.scrollIntoViewIfNeeded()
		const vh = page.viewportSize()?.height ?? 0
		await expect.poll(async () => {
			const b = await submit.boundingBox()
			return b ? b.y + b.height : Number.POSITIVE_INFINITY
		}, { timeout: 2000 }).toBeLessThanOrEqual(vh)
	})
}
