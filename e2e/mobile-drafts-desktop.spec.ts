import { type Browser, type BrowserContext, type Page, expect, test } from "@playwright/test"
import { readFileSync } from "node:fs"
import { z } from "zod"

// SYNC-4 across two real browsers on one host: the desktop dock and the phone sheet.
test.skip(process.env.LH_E2E_MOBILE !== "1", "set LH_E2E_MOBILE=1 (seeded data + mobile shell)")

const seedSchema = z.object({ drafts: z.tuple([z.string(), z.string(), z.string(), z.string()]) })
const readSeed = () => seedSchema.parse(JSON.parse(readFileSync(process.env.LH_E2E_SEED_FILE ?? "", "utf8")))

const IPHONE_UA =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
const phoneContext = (browser: Browser): Promise<BrowserContext> =>
	browser.newContext({ viewport: { width: 390, height: 844 }, userAgent: IPHONE_UA, isMobile: true, hasTouch: true, deviceScaleFactor: 3 })
const desktopContext = (browser: Browser): Promise<BrowserContext> => browser.newContext({ viewport: { width: 1440, height: 900 } })

// The idle send is 1 s after the last edit (plus the dock's 300 ms report debounce): wait for the PUT itself.
// 20 s: under a full parallel run next dev may still be compiling the draft route on its first use.
const draftPut = (page: Page, chatId: string) =>
	page.waitForResponse((r) => r.request().method() === "PUT" && r.url().includes(`/api/chats/${chatId}/draft`) && r.ok(), { timeout: 20_000 })

async function openDesktopDock(page: Page, chatId: string) {
	await page.goto(`/chat/${chatId}`)
	const dock = page.getByTestId("question-dock")
	await expect(dock).toBeVisible({ timeout: 30_000 })
	return dock
}

async function openPhoneSheet(page: Page, chatId: string) {
	await page.goto(`/chat/${chatId}`)
	await page.getByRole("button", { name: "Answer", exact: true }).click()
	const sheet = page.getByRole("dialog", { name: "Your answer" })
	await expect(sheet).toBeVisible()
	return sheet
}

test.beforeEach(({ page: _page }, info) => {
	test.skip(info.project.name !== "desktop", "drives its own desktop and phone contexts")
	// Two browsers, and next dev compiles both chat routes on first visit.
	test.setTimeout(90_000)
})

test("a draft started on the desktop opens on the phone with Draft from Desktop", async ({ browser }) => {
	const chatId = readSeed().drafts[0]
	const desktop = await desktopContext(browser)
	const phone = await phoneContext(browser)
	try {
		const deskPage = await desktop.newPage()
		const dock = await openDesktopDock(deskPage, chatId)
		const put = draftPut(deskPage, chatId)
		await dock.getByRole("radio", { name: /Mercury/ }).click()
		await dock.getByTestId("thinking-field").getByRole("textbox").fill("closest orbit, from the laptop")
		await put

		const sheet = await openPhoneSheet(await phone.newPage(), chatId)
		await expect(sheet.getByText("Draft from Desktop")).toBeVisible()
		await expect(sheet.getByLabel("Your thinking")).toHaveValue("closest orbit, from the laptop")
		await expect(sheet.getByRole("radio", { name: "Mercury" })).toHaveAttribute("aria-checked", "true")
	} finally {
		await desktop.close()
		await phone.close()
	}
})

test("a draft typed on the phone seeds an untouched desktop dock", async ({ browser }) => {
	const chatId = readSeed().drafts[1]
	const desktop = await desktopContext(browser)
	const phone = await phoneContext(browser)
	try {
		const phonePage = await phone.newPage()
		const sheet = await openPhoneSheet(phonePage, chatId)
		const put = draftPut(phonePage, chatId)
		await sheet.getByLabel("Your thinking").fill("typed on the bus")
		await put

		const dock = await openDesktopDock(await desktop.newPage(), chatId)
		// The desktop field is a contenteditable: it has text, not a value.
		await expect(dock.getByTestId("thinking-field").getByRole("textbox")).toHaveText("typed on the bus")
	} finally {
		await desktop.close()
		await phone.close()
	}
})

test("after a desktop reload the newest draft wins, even when the phone wrote it", async ({ browser }) => {
	const chatId = readSeed().drafts[2]
	const desktop = await desktopContext(browser)
	const phone = await phoneContext(browser)
	try {
		const deskPage = await desktop.newPage()
		const dock = await openDesktopDock(deskPage, chatId)
		const deskPut = draftPut(deskPage, chatId)
		await dock.getByTestId("thinking-field").getByRole("textbox").fill("my desk notes")
		await deskPut

		// The phone writes a newer draft afterwards.
		const phonePage = await phone.newPage()
		const sheet = await openPhoneSheet(phonePage, chatId)
		await expect(sheet.getByLabel("Your thinking")).toHaveValue("my desk notes")
		const phonePut = draftPut(phonePage, chatId)
		await sheet.getByLabel("Your thinking").fill("newer, from the phone")
		await phonePut

		// Last writer wins (SYNC-4): the reloaded desktop shows the phone's newer text.
		await deskPage.reload()
		await expect(deskPage.getByTestId("thinking-field").getByRole("textbox")).toHaveText("newer, from the phone", { timeout: 30_000 })
	} finally {
		await desktop.close()
		await phone.close()
	}
})

test("the desktop's own draft survives a desktop reload", async ({ browser }) => {
	const chatId = readSeed().drafts[3]
	const desktop = await desktopContext(browser)
	try {
		const deskPage = await desktop.newPage()
		const dock = await openDesktopDock(deskPage, chatId)
		const put = draftPut(deskPage, chatId)
		await dock.getByTestId("thinking-field").getByRole("textbox").fill("half a thought")
		await put
		await deskPage.reload()
		await expect(deskPage.getByTestId("thinking-field").getByRole("textbox")).toHaveText("half a thought", { timeout: 30_000 })
	} finally {
		await desktop.close()
	}
})
