import fs from "node:fs"
import os from "node:os"
import path from "node:path"
import { defineConfig } from "@playwright/test"
import { WARM_RUNS } from "./e2e/support/resume-gate.ts"

// Gate 2 (resume <= 3 s on 4G) runs on a production build, never next dev:
// dev compiles routes on first visit and would measure the compiler, not the app.
const PORT = 3419
process.env.LH_E2E_DATA_DIR ??= fs.mkdtempSync(path.join(os.tmpdir(), "lh-perf-"))
const dataDir = process.env.LH_E2E_DATA_DIR
const seedFile = path.join(dataDir, "e2e-seed.json")
const authFile = path.join(dataDir, "auth.json")
process.env.LH_E2E_SEED_FILE = seedFile
const seed = `NODE_ENV=test LH_DATA_DIR=${dataDir} LH_AUTH_FILE=${authFile} LH_E2E_SEED_FILE=${seedFile} LH_E2E_SEED_WARM=${WARM_RUNS} npx tsx e2e/fixtures/seed.ts`
const IPHONE_UA =
	"Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1"

export default defineConfig({
	testDir: "e2e/perf",
	testMatch: "**/*.perf.ts",
	outputDir: "test-results/perf",
	reporter: [["list"]],
	// One at a time: parallel workers would contend for CPU and skew every timing.
	workers: 1,
	fullyParallel: false,
	retries: 0,
	timeout: 180_000,
	use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
	webServer: {
		command: `${seed} && npx next build && npx next start -p ${PORT}`,
		url: `http://localhost:${PORT}`,
		reuseExistingServer: false,
		timeout: 600_000,
		env: {
			LH_DATA_DIR: dataDir,
			LH_AUTH_FILE: authFile,
			NEXT_TELEMETRY_DISABLED: "1",
			NEXT_PUBLIC_LH_MOBILE_SHELL: "1",
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
	],
})
