import { expect, test } from "@playwright/test"

// The composer is a contenteditable (PathInput) whose placeholder is its aria-label.
const PLACEHOLDER = "What do you want to learn?"

const cases = [
	{ project: "iphone-13", title: "home loads at 390x844 without horizontal overflow", overflow: true },
	{ project: "iphone-se", title: "home loads at 375x667 without horizontal overflow", overflow: true },
	{ project: "desktop", title: "home loads on desktop 1440x900", overflow: false },
] as const

for (const c of cases) {
	test(c.title, async ({ page }, info) => {
		test.skip(info.project.name !== c.project, `runs on ${c.project} only`)

		const response = await page.goto("/")
		expect(response?.status()).toBe(200)

		if (c.overflow) {
			const widths = await page.evaluate(() => ({
				scrollWidth: document.documentElement.scrollWidth,
				innerWidth: window.innerWidth,
			}))
			expect(widths.scrollWidth).toBeLessThanOrEqual(widths.innerWidth)
		}

		await expect(page.getByRole("textbox", { name: PLACEHOLDER })).toBeVisible()
	})
}
