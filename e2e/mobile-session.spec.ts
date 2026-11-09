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
		// No provider in e2e, so the answer POST is refused after the optimistic append. The draft must
		// survive: the sheet comes back with the typed form intact instead of losing the answer.
		await expect(dialog).toBeVisible()
		await expect(dialog.getByLabel("Your thinking")).toHaveValue("Mercury orbits closest to the sun")
		await expect(dialog.getByRole("radio", { name: "Mercury" })).toHaveAttribute("aria-checked", "true")
	})
}

test("a session with no pending question offers a reply box", async ({ page }, info) => {
	test.skip(info.project.name !== "iphone-13", "runs on iphone-13 only")
	await page.goto(`/chat/${readSeed().finished}`)
	await expect(page.getByRole("button", { name: "Answer", exact: true })).toHaveCount(0)
	await expect(page.getByText("Continue this session on your desktop.")).toHaveCount(0)
	const box = page.getByRole("textbox", { name: "Reply" })
	await expect(box).toBeVisible()
	// Under 16px iOS zooms the page on focus.
	expect(await box.evaluate((el) => Number.parseFloat(getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(16)
	const send = page.getByRole("button", { name: "Send", exact: true })
	await expect(send).toBeDisabled()
	await box.fill("Why is Venus hotter than Mercury?")
	await expect(send).toBeEnabled()
})

for (const project of PHONES) {
	test(`a reply that fails to send keeps the text and adds no phantom message on ${project}`, async ({ page }, info) => {
		test.skip(info.project.name !== project, `runs on ${project} only`)
		await page.route("**/api/chat", (route) => (route.request().method() === "POST" ? route.abort("internetdisconnected") : route.continue()))
		await page.goto(`/chat/${readSeed().finished}`)
		const box = page.getByRole("textbox", { name: "Reply" })
		const text = "Why is Venus hotter than Mercury?"
		await box.fill(text)
		const send = page.getByRole("button", { name: "Send", exact: true })
		const rect = await send.boundingBox()
		if (!rect) throw new Error("Send has no box")
		const viewport = page.viewportSize()
		expect(rect.y + rect.height).toBeLessThanOrEqual(viewport?.height ?? 0)
		await send.click()
		await expect(page.getByText("Not sent. Your reply is still here.")).toBeVisible()
		await expect(box).toHaveValue(text)
		// The box itself holds the text; nothing else in the session may.
		await expect(page.getByTestId("mobile-session").getByText(text, { exact: true }).and(page.locator(":not(textarea)"))).toHaveCount(0)
	})
}

test("an accepted reply clears the box", async ({ page }, info) => {
	test.skip(info.project.name !== "iphone-13", "runs on iphone-13 only")
	const posted: unknown[] = []
	await page.route("**/api/chat", async (route) => {
		if (route.request().method() !== "POST") return route.continue()
		posted.push(route.request().postDataJSON())
		await route.fulfill({ status: 200, contentType: "application/json", body: "{}" })
	})
	const seed = readSeed()
	await page.goto(`/chat/${seed.finished}`)
	const box = page.getByRole("textbox", { name: "Reply" })
	await box.fill("  Why is Venus hotter?  ")
	await box.press("Enter")
	await expect(box).toHaveValue("")
	expect(posted).toEqual([{ chatId: seed.finished, input: { type: "text", text: "Why is Venus hotter?" } }])
})
