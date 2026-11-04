import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { defineConfig } from "@playwright/test"

const PORT = 3418
// Fresh data dir per run so e2e never touches real learner data. Playwright re-evaluates
// this config in every worker, so the dir is created once and shared through the env.
process.env.LH_E2E_DATA_DIR ??= fs.mkdtempSync(path.join(os.tmpdir(), "lh-e2e-"))
const dataDir = process.env.LH_E2E_DATA_DIR
// LH_E2E_MOBILE=1: the mobile shell on, plus real seeded records (e2e/fixtures/seed.ts).
const MOBILE = process.env.LH_E2E_MOBILE === "1"
const seedFile = path.join(dataDir, "e2e-seed.json")
const authFile = path.join(dataDir, "auth.json")
process.env.LH_E2E_SEED_FILE = seedFile
const IPHONE_UA =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"
const seedCommand = `NODE_ENV=test LH_DATA_DIR=${dataDir} LH_AUTH_FILE=${authFile} LH_E2E_SEED_FILE=${seedFile} npx tsx e2e/fixtures/seed.ts && `

export default defineConfig({
	testDir: "e2e",
	outputDir: "test-results",
	reporter: [["list"], ["html", { outputFolder: "playwright-report", open: "never" }]],
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 1 : 0,
	use: {
		baseURL: `http://localhost:${PORT}`,
		trace: "retain-on-failure",
	},
	webServer: {
		command: `${MOBILE ? seedCommand : ""}npx next dev -p ${PORT}`,
		url: `http://localhost:${PORT}`,
		// A reused dev server would run against someone else's data dir, not the seeded scratch one.
		reuseExistingServer: !process.env.CI && !MOBILE,
		timeout: 120_000,
		env: {
			LH_DATA_DIR: dataDir,
			LH_AUTH_FILE: authFile,
			NEXT_TELEMETRY_DISABLED: "1",
			...(MOBILE ? { NEXT_PUBLIC_LH_MOBILE_SHELL: "1" } : {}),
		},
	},
	projects: [
		{
			name: "iphone-13",
			use: {
				browserName: "chromium",
				viewport: { width: 390, height: 844 },
				userAgent: IPHONE_UA,
				isMobile: true,
				hasTouch: true,
				deviceScaleFactor: 3,
			},
		},
		{
			name: "iphone-se",
			use: {
				browserName: "chromium",
				viewport: { width: 375, height: 667 },
				userAgent: IPHONE_UA,
				isMobile: true,
				hasTouch: true,
				deviceScaleFactor: 2,
			},
		},
		{
			name: "desktop",
			use: { browserName: "chromium", viewport: { width: 1440, height: 900 } },
		},
	],
})
