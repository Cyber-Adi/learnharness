import assert from "node:assert/strict"
import * as fs from "node:fs"
import * as os from "node:os"
import * as path from "node:path"
import { test } from "node:test"
import { adminTokenFile, ensureDataDir, removeAdminToken, tokenFileProblem, writeAdminToken } from "../scripts/host-config.mjs"

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "lh-host-"))

test("the data dir is created 0700", () => {
	const dir = path.join(tmp(), "data")
	ensureDataDir(dir)
	assert.equal(fs.statSync(dir).mode & 0o777, 0o700)
})

test("a group-writable data dir is refused", () => {
	const dir = tmp()
	fs.chmodSync(dir, 0o770)
	assert.throws(() => ensureDataDir(dir))
	fs.chmodSync(dir, 0o755)
	assert.doesNotThrow(() => ensureDataDir(dir), "readable but not writable is fine")
})

test("the token is written with a random tmp name and never follows a planted file", () => {
	const dir = tmp()
	const file = adminTokenFile(dir)
	const planted = `${file}.${process.pid}.tmp`
	fs.symlinkSync("/nonexistent/elsewhere", planted)
	writeAdminToken(file, "x".repeat(43))
	assert.equal(fs.readFileSync(file, "utf8"), "x".repeat(43))
	assert.equal(fs.statSync(file).mode & 0o777, 0o600)
	assert.ok(fs.lstatSync(planted).isSymbolicLink(), "planted link untouched")
	assert.deepEqual(fs.readdirSync(dir).filter((n) => n.endsWith(".tmp")), [path.basename(planted)])
})

test("the token file is removed on exit and removal is idempotent", () => {
	const file = adminTokenFile(tmp())
	writeAdminToken(file, "x".repeat(43))
	removeAdminToken(file)
	assert.equal(fs.existsSync(file), false)
	removeAdminToken(file)
})

test("host-pair refuses a token file with loose mode or another owner", () => {
	const file = adminTokenFile(tmp())
	writeAdminToken(file, "x".repeat(43))
	const st = fs.statSync(file)
	assert.equal(tokenFileProblem(st, st.uid), null)
	assert.notEqual(tokenFileProblem(st, st.uid + 1), null)
	fs.chmodSync(file, 0o644)
	assert.notEqual(tokenFileProblem(fs.statSync(file), st.uid), null)
})
