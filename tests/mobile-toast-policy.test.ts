import assert from "node:assert/strict"
import { describe, it } from "node:test"
import {
	SUPPRESS_WINDOW_MS,
	TOAST_COPY,
	dedupeKey,
	shouldShow,
	toastIdFor,
} from "../components/mobile/toast/toast-policy.ts"

describe("mobile toast policy", () => {
	it("toastIdFor gives the same id for repeated answeredElsewhere events", () => {
		assert.equal(toastIdFor("answeredElsewhere"), toastIdFor("answeredElsewhere"))
		assert.notEqual(toastIdFor("answeredElsewhere"), toastIdFor("draftRestored"))
	})

	it("host offline and online share one id so online replaces offline", () => {
		assert.equal(toastIdFor("hostOffline"), toastIdFor("hostOnline"))
	})

	it("ids are namespaced strings", () => {
		for (const e of ["answeredElsewhere", "draftRestored", "hostOffline", "hostOnline", "error"] as const) {
			assert.match(toastIdFor(e), /^lh-m-toast:/)
		}
	})

	it("the same event within 1500 ms is suppressed", () => {
		assert.equal(SUPPRESS_WINDOW_MS, 1500)
		assert.equal(shouldShow("answeredElsewhere", 1000, 1000 + 1499), false)
		assert.equal(shouldShow("answeredElsewhere", 1000, 1000 + 1500), true)
		assert.equal(shouldShow("answeredElsewhere", undefined, 5), true)
		assert.equal(shouldShow("answeredElsewhere", null, 5), true)
	})

	it("a clock that moved backwards does not suppress forever", () => {
		assert.equal(shouldShow("error", 5000, 100), true)
	})

	it("dedupeKey separates errors by message and merges other events by id", () => {
		assert.equal(dedupeKey("error", "a"), dedupeKey("error", "a"))
		assert.notEqual(dedupeKey("error", "a"), dedupeKey("error", "b"))
		assert.equal(dedupeKey("answeredElsewhere"), toastIdFor("answeredElsewhere"))
		assert.notEqual(dedupeKey("draftRestored", "desktop"), dedupeKey("draftRestored", "phone"))
	})

	it("copy strings match exactly", () => {
		assert.equal(TOAST_COPY.answeredElsewhere, "Answered on Desktop")
		assert.equal(TOAST_COPY.draftFromDesktop, "Draft from Desktop")
		assert.equal(TOAST_COPY.draftFromPhone, "Draft from phone")
		assert.equal(TOAST_COPY.hostOffline, "Host offline. Reconnecting...")
		assert.equal(TOAST_COPY.hostOnline, "Back online")
	})
})
