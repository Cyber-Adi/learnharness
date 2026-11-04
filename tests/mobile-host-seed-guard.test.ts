import assert from "node:assert/strict"
import * as os from "node:os"
import * as path from "node:path"
import { test } from "node:test"
import { insideTmp } from "../e2e/fixtures/seed-guard.ts"

const tmp = os.tmpdir()

test("the seed refuses a data dir outside tmp", () => {
	assert.equal(insideTmp(path.join(tmp, "lh-e2e-abc")), true)
	assert.equal(insideTmp(path.join(os.homedir(), "LMobile", "data")), false)
	assert.equal(insideTmp(path.join(tmp, "..", "etc")), false)
	assert.equal(insideTmp(tmp), false, "tmp itself is shared, not scratch")
	assert.equal(insideTmp(`${tmp}-evil/x`), false)
	assert.equal(insideTmp(""), false)
})
