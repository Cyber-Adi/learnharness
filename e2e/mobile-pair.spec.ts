import { expect, test } from "@playwright/test"

// Under next dev LH_REMOTE_HOSTS is unset, so no real code can be minted (remote_disabled).
// A well-formed but unknown code still renders the page and exercises the failure state;
// the success state is covered by render tests and the lead's host run.
const ENABLED = process.env.LH_E2E_MOBILE === "1"
const FAKE_CODE = "abcdefghijklmnopqrstuA"

test.describe("phone pair page", () => {
	test.skip(!ENABLED, "set LH_E2E_MOBILE=1")

	test("reads the code from the hash, clears it, and shows the failure copy for an unknown code", async ({ page }) => {
		await page.goto(`/pair#${FAKE_CODE}`)
		const name = page.getByLabel("Device name")
		await expect(name).toHaveValue("iPhone")
		await expect.poll(() => page.evaluate(() => window.location.hash)).toBe("")
		await name.fill("Test phone")
		await page.getByRole("button", { name: "Pair this phone" }).click()
		await expect(page.getByText("That code did not work. It may have expired. Get a new code on your desktop.")).toBeVisible()
		await expect(page.getByRole("button", { name: "Try again" })).toBeVisible()
	})

	test("without a code, the short code field gates the button and uppercases input", async ({ page }) => {
		await page.goto("/pair")
		const button = page.getByRole("button", { name: "Pair this phone" })
		await expect(button).toBeDisabled()
		const field = page.getByLabel("Have a code?")
		await field.fill("abc 234")
		await expect(field).toHaveValue("ABC234")
		await expect(button).toBeEnabled()
	})

	test("fits without horizontal overflow", async ({ page }) => {
		await page.goto("/pair")
		const w = await page.evaluate(() => ({ s: document.documentElement.scrollWidth, i: window.innerWidth }))
		expect(w.s).toBeLessThanOrEqual(w.i)
	})
})
