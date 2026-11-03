import { readFileSync } from "node:fs"
import { expect, test } from "@playwright/test"

// Needs the seeded records and the mobile shell: the lead runs it with LH_E2E_MOBILE=1.
test.skip(process.env.LH_E2E_MOBILE !== "1", "set LH_E2E_MOBILE=1 (seeded data + mobile shell)")

interface Seed {
	readonly pending: string
	readonly finished: string
	readonly pendingCallId: string
}

function readSeed(): Seed {
	const file = process.env.LH_E2E_SEED_FILE
	if (!file) throw new Error("LH_E2E_SEED_FILE is not set")
	return JSON.parse(readFileSync(file, "utf8")) as Seed
}

const PHONES = ["iphone-13", "iphone-se"]

for (const project of PHONES) {
	test(`answer a pending quiz and keep the draft across rotation on ${project}`, async ({ page }, info) => {
		test.skip(info.project.name !== project, `runs on ${project} only`)
		const seed = readSeed()
		const start = page.viewportSize()
		if (!start) throw new Error("no viewport")

		await page.goto(`/chat/${seed.pending}`)
		const answer = page.getByRole("button", { name: "Answer", exact: true })
		await expect(answer).toBeVisible()
		await answer.click()

		const dialog = page.getByRole("dialog", { name: "Your answer" })
		await expect(dialog).toBeVisible()
		await dialog.getByRole("radio", { name: "Mercury" }).click()
		await dialog.getByRole("radio", { name: "90", exact: true }).click()
		const thinking = dialog.getByLabel("Your thinking")
		await thinking.fill("Mercury orbits closest to the sun")
		// A marker on the live node proves the same element survives, not a remounted twin.
		await thinking.evaluate((el) => {
			;(el as HTMLElement & { lhMark?: number }).lhMark = 1
		})

		await page.setViewportSize({ width: start.height, height: start.width })
		await expect(dialog).toBeVisible()
		await page.setViewportSize(start)
		await expect(dialog).toBeVisible()

		const after = dialog.getByLabel("Your thinking")
		await expect(after).toHaveValue("Mercury orbits closest to the sun")
		expect(await after.evaluate((el) => (el as HTMLElement & { lhMark?: number }).lhMark)).toBe(1)
		await expect(dialog.getByRole("radio", { name: "Mercury" })).toHaveAttribute("aria-checked", "true")
		await expect(dialog.getByRole("radio", { name: "90", exact: true })).toHaveAttribute("aria-checked", "true")

		await dialog.getByRole("button", { name: "Submit" }).click()
		await expect(dialog).toBeHidden()
		// No provider in e2e: assert the optimistic answer, not a teacher reply.
		await expect(page.getByTestId("transcript")).toContainText("Mercury")
	})
}

test("a finished session is read-only", async ({ page }, info) => {
	test.skip(info.project.name !== "iphone-13", "runs on iphone-13 only")
	await page.goto(`/chat/${readSeed().finished}`)
	await expect(page.getByText("Continue this session on your desktop.")).toBeVisible()
	await expect(page.getByRole("button", { name: "Answer", exact: true })).toHaveCount(0)
})
