import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { defineConfig } from "@playwright/test"

const PORT = 3418
// Fresh data dir per run so e2e never touches real learner data.
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "lh-e2e-"))

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
		command: `npx next dev -p ${PORT}`,
		url: `http://localhost:${PORT}`,
		reuseExistingServer: !process.env.CI,
		timeout: 120_000,
		env: { LH_DATA_DIR: dataDir, NEXT_TELEMETRY_DISABLED: "1" },
	},
	projects: [
		{
			name: "iphone-13",
			use: {
				browserName: "chromium",
				viewport: { width: 390, height: 844 },
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
