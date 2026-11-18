import { type BrowserContext, type Page, expect, request, test } from "@playwright/test"
import { readFileSync } from "node:fs"
import { z } from "zod"
import { COLD_RUNS, RESUME_BUDGET_MS, SLOW_4G, formatGate, judge } from "../support/resume-gate.ts"

const seedSchema = z.object({
	pending: z.string(),
	warm: z.array(z.object({ chatId: z.string(), callId: z.string(), dismissal: z.record(z.string(), z.unknown()) })),
})
const readSeed = () => seedSchema.parse(JSON.parse(readFileSync(process.env.LH_E2E_SEED_FILE ?? "", "utf8")))

type Marks = Record<string, number>
declare global {
	interface Window {
		__lhMarks?: Marks
	}
}

async function throttle(page: Page): Promise<void> {
	const cdp = await page.context().newCDPSession(page)
	await cdp.send("Network.enable")
	await cdp.send("Network.emulateNetworkConditions", {
		offline: false,
		latency: SLOW_4G.latency,
		downloadThroughput: SLOW_4G.downloadThroughput,
		uploadThroughput: SLOW_4G.uploadThroughput,
	})
	await cdp.send("Emulation.setCPUThrottlingRate", { rate: SLOW_4G.cpuSlowdown })
}

// Page-side probe: each frame, check the resume conditions; a mark is the frame AFTER the
// condition first holds (rAF runs before paint, so the next frame means it was painted).
// Times are performance.now(), i.e. ms since this document's navigation started.
async function installProbe(context: BrowserContext, pendingId: string): Promise<void> {
	await context.addInitScript((pending: string) => {
		const marks: Record<string, number> = {}
		window.__lhMarks = marks
		const once = (name: string, holds: () => boolean) => {
			if (marks[name] === undefined && holds()) requestAnimationFrame(() => (marks[name] ??= performance.now()))
		}
		const answerBar = () => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Answer")
		document.addEventListener("click", (e) => {
			const row = (e.target as Element | null)?.closest?.(`a[href="/chat/${pending}"]`)
			if (row) marks.tap ??= e.timeStamp
		}, true)
		const tick = () => {
			once("learn", () => (document.querySelector(`a[href="/chat/${pending}"]`)?.textContent ?? "").includes("Your turn"))
			once("session", () => document.querySelector('[data-testid="mobile-session"]') !== null && answerBar())
			requestAnimationFrame(tick)
		}
		requestAnimationFrame(tick)
	}, pendingId)
}

const marksOf = (page: Page) => page.evaluate(() => ({ ...(window.__lhMarks ?? {}) }))

async function coldLaunch(page: Page, pendingId: string): Promise<number> {
	await throttle(page)
	await page.goto("/?source=pwa")
	await expect.poll(async () => (await marksOf(page)).learn, { timeout: 30_000 }).toBeGreaterThan(0)
	await page.locator(`a[href="/chat/${pendingId}"]`).click()
	await expect.poll(async () => (await marksOf(page)).session, { timeout: 30_000 }).toBeGreaterThan(0)
	const m = await marksOf(page)
	const learn = m.learn ?? Number.NaN
	const tap = m.tap ?? Number.NaN
	const session = m.session ?? Number.NaN
	// System time only: launch to Learn painted, plus tap to the session painted (the learner's think time is not ours).
	return learn + (session - tap)
}

test.describe.configure({ mode: "serial" })

test("cold resume, installed (cache warm from an earlier launch)", async ({ browser }) => {
	const { pending } = readSeed()
	const context = await browser.newContext(test.info().project.use)
	await installProbe(context, pending)
	const prime = await context.newPage()
	await prime.goto("/?source=pwa")
	await prime.locator(`a[href="/chat/${pending}"]`).waitFor()
	await prime.goto(`/chat/${pending}`)
	await prime.getByRole("button", { name: "Answer", exact: true }).waitFor()
	await prime.close()
	const samples: number[] = []
	for (let i = 0; i < COLD_RUNS; i++) {
		const page = await context.newPage()
		samples.push(await coldLaunch(page, pending))
		await page.close()
	}
	await context.close()
	const v = judge(samples)
	console.log(formatGate("cold (installed)", v), JSON.stringify(samples.map(Math.round)))
	expect(v.worst, formatGate("cold (installed)", v)).toBeLessThanOrEqual(RESUME_BUDGET_MS)
})

test("cold resume, first launch (no cache)", async ({ browser }) => {
	const { pending } = readSeed()
	const samples: number[] = []
	for (let i = 0; i < COLD_RUNS; i++) {
		const context = await browser.newContext(test.info().project.use)
		await installProbe(context, pending)
		samples.push(await coldLaunch(await context.newPage(), pending))
		await context.close()
	}
	const v = judge(samples)
	console.log(formatGate("cold (first launch)", v), JSON.stringify(samples.map(Math.round)))
	expect(v.worst, formatGate("cold (first launch)", v)).toBeLessThanOrEqual(RESUME_BUDGET_MS)
})

test("warm resume: the desktop settled the question while the PWA was backgrounded", async ({ browser, baseURL }) => {
	const { warm } = readSeed()
	const desktop = await request.newContext({ baseURL })
	const samples: number[] = []
	for (const w of warm) {
		const context = await browser.newContext(test.info().project.use)
		await installProbe(context, w.chatId)
		const page = await context.newPage()
		await throttle(page)
		await page.goto(`/chat/${w.chatId}`)
		await page.getByRole("button", { name: "Answer", exact: true }).waitFor({ timeout: 30_000 })
		// Background the PWA.
		await page.evaluate(() => {
			Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" })
			document.dispatchEvent(new Event("visibilitychange"))
		})
		// The desktop dismisses the question through its dock's wire (turn-less, so no model key),
		// then we wait until the host's record holds it.
		const res = await desktop.post(`/api/chats/${w.chatId}/dismiss`, { data: { input: { type: "dismiss", toolCallId: w.callId, answer: w.dismissal } } })
		expect(res.ok(), await res.text()).toBe(true)
		await expect
			.poll(async () => {
				const r = await desktop.get(`/api/chats/${w.chatId}`)
				const body = (await r.json()) as { messages?: { role?: string; toolCallId?: string }[] }
				return (body.messages ?? []).some((m) => m.role === "toolResult" && m.toolCallId === w.callId)
			})
			.toBe(true)
		// Foreground: time from visibilitychange to the resynced transcript painted (Answer bar gone, reply box shown).
		const ms = await page.evaluate(
			() =>
				new Promise<number>((resolve, reject) => {
					Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" })
					const start = performance.now()
					const deadline = start + 30_000
					const answerBar = () => [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "Answer")
					const tick = () => {
						if (!answerBar() && document.querySelector('textarea[aria-label="Reply"]')) {
							requestAnimationFrame(() => resolve(performance.now() - start))
							return
						}
						if (performance.now() > deadline) return reject(new Error("warm resume never resynced"))
						requestAnimationFrame(tick)
					}
					document.dispatchEvent(new Event("visibilitychange"))
					requestAnimationFrame(tick)
				}),
		)
		samples.push(ms)
		await context.close()
	}
	await desktop.dispose()
	const v = judge(samples)
	console.log(formatGate("warm", v), JSON.stringify(samples.map(Math.round)))
	expect(v.worst, formatGate("warm", v)).toBeLessThanOrEqual(RESUME_BUDGET_MS)
})
