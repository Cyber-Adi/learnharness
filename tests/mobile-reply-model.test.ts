import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { REPLY_MAX_CHARS, bottomBar, canSend, sendReply, shouldSendOnKey } from "../components/mobile/session/reply-model.ts"

describe("bottom bar", () => {
	it("a pending question shows the Answer bar, not the reply box", () => {
		assert.equal(bottomBar({ hasPending: true }), "answer")
	})
	it("no pending question shows the reply box", () => {
		assert.equal(bottomBar({ hasPending: false }), "reply")
	})
})

describe("canSend", () => {
	it("blank or whitespace-only text cannot be sent", () => {
		assert.equal(canSend("", false), false)
		assert.equal(canSend("   \n ", false), false)
	})
	it("text can be sent while no turn is running", () => {
		assert.equal(canSend("Why is Venus hotter?", false), true)
	})
	it("nothing can be sent while a turn is running or a send is in flight", () => {
		assert.equal(canSend("Why is Venus hotter?", true), false)
	})
	it("text over the cap cannot be sent", () => {
		assert.equal(canSend("a".repeat(REPLY_MAX_CHARS + 1), false), false)
		assert.equal(canSend("a".repeat(REPLY_MAX_CHARS), false), true)
	})
})

describe("shouldSendOnKey", () => {
	it("Enter sends", () => {
		assert.equal(shouldSendOnKey({ key: "Enter", shiftKey: false, isComposing: false }), true)
	})
	it("Shift+Enter inserts a newline instead", () => {
		assert.equal(shouldSendOnKey({ key: "Enter", shiftKey: true, isComposing: false }), false)
	})
	it("Enter while an IME or dictation composition is open does not send", () => {
		assert.equal(shouldSendOnKey({ key: "Enter", shiftKey: false, isComposing: true }), false)
	})
	it("other keys never send", () => {
		assert.equal(shouldSendOnKey({ key: "a", shiftKey: false, isComposing: false }), false)
	})
})

describe("sendReply", () => {
	it("sends the trimmed text as a plain text input", async () => {
		const sent: unknown[] = []
		const ok = await sendReply("  Why is Venus hotter?  ", async (input) => {
			sent.push(input)
			return true
		})
		assert.equal(ok, true)
		assert.deepEqual(sent, [{ type: "text", text: "Why is Venus hotter?" }])
	})
	it("a refused send reports not accepted so the text is kept", async () => {
		assert.equal(await sendReply("hello", async () => false), false)
	})
	it("a throwing send reports not accepted instead of rejecting", async () => {
		assert.equal(
			await sendReply("hello", async () => {
				throw new Error("network down")
			}),
			false,
		)
	})
	it("blank text is never sent", async () => {
		let calls = 0
		const ok = await sendReply("  ", async () => {
			calls += 1
			return true
		})
		assert.equal(ok, false)
		assert.equal(calls, 0)
	})
	it("reports acceptance as soon as the server acknowledges, before the turn finishes", async () => {
		const events: string[] = []
		const ok = await sendReply(
			"hello",
			async (_input, onAccepted) => {
				onAccepted()
				events.push("acked")
				await Promise.resolve()
				events.push("turn done")
				return true
			},
			() => events.push("accepted"),
		)
		assert.equal(ok, true)
		assert.deepEqual(events, ["accepted", "acked", "turn done"])
	})
	it("a refused send never reports acceptance", async () => {
		let accepted = false
		await sendReply("hello", async () => false, () => {
			accepted = true
		})
		assert.equal(accepted, false)
	})
})
