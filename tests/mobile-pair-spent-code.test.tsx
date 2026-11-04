import React from "react"
;(globalThis as Record<string, unknown>).React = React
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { chooseSecret, codeAfterAttempt } from "../components/mobile/pairing/pair-model.ts"
import { DEVICE_REFRESH_MS, type PairCode } from "../components/mobile/pairing/pair-dialog-model.ts"
import { PairDialogBody } from "../components/mobile/pairing/pair-dialog.tsx"

const LONG = `${"x".repeat(21)}A`
const NOW = Date.parse("2026-01-01T12:00:00.000Z")
const expired: PairCode = { shortCode: "ABC234", pairUrl: `https://a.ts.net/pair#${LONG}`, expiresAt: "2026-01-01T11:00:00.000Z" }

describe("pairing single-use code", () => {
	it("after a failure the spent code is not resent", () => {
		const first = chooseSecret("", LONG)
		assert.deepEqual(first, { kind: "code", value: LONG })
		const code = codeAfterAttempt(LONG, first)
		assert.equal(code, null)
		assert.equal(chooseSecret("", code), null, "needs the short code now")
		assert.deepEqual(chooseSecret("ABC234", code), { kind: "short", value: "ABC234" })
	})

	it("a short-code attempt keeps the long code", () => {
		assert.equal(codeAfterAttempt(LONG, { kind: "short", value: "ABC234" }), LONG)
	})
})

describe("pair dialog body", () => {
	const base = { code: expired, now: NOW, busy: false, error: false, onNewCode() {} }
	it("New code is disabled while a code is being minted", () => {
		const html = renderToStaticMarkup(<PairDialogBody {...base} busy />)
		assert.match(html, /<button[^>]*disabled=""[^>]*>New code/)
		assert.doesNotMatch(renderToStaticMarkup(<PairDialogBody {...base} />), /disabled=""/)
	})
	it("a failed refresh shows its error inside the dialog", () => {
		const html = renderToStaticMarkup(<PairDialogBody {...base} error />)
		assert.match(html, /role="alert"[^>]*>Could not get a pairing code/)
	})
	it("the device list refreshes every 5 s while the dialog is open", () => {
		assert.equal(DEVICE_REFRESH_MS, 5000)
	})
})
