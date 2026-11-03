import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { projectView } from "../src/core/view.ts"
import type { LhMessage } from "../src/core/native-messages.ts"
import { answerValid, onForeground, pendingFor, stickToBottom } from "../components/mobile/session/session-logic.ts"
import { emptySelection } from "../components/mobile/session/sheet-draft.ts"

const usage = { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, totalTokens: 0, cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 } }

function quiz(callId: string): LhMessage {
	return {
		id: "a1",
		role: "assistant",
		content: [{ type: "toolCall", id: callId, name: "quiz", arguments: { question: "Q?", options: [{ label: "A" }, { label: "B" }], correctAnswer: "A", explanation: "x" } }],
		stopReason: "toolUse",
		timestamp: 1,
		api: "openai-completions",
		provider: "fixture",
		model: "fixture",
		usage,
	} as LhMessage
}

describe("pendingFor", () => {
	it("finds the dangling question", () => {
		const native = [quiz("c1")]
		assert.equal(pendingFor(projectView(native), native)?.toolCallId, "c1")
	})
	it("is null without a question", () => {
		assert.equal(pendingFor([], []), null)
	})
})

describe("answerValid", () => {
	const single = { mode: "single-select" as const }
	const multi = { mode: "multi-select" as const }
	it("rejects an empty selection", () => {
		assert.equal(answerValid(single, emptySelection(), ""), false)
	})
	it("accepts a picked option (single and multi)", () => {
		assert.equal(answerValid(single, { ...emptySelection(), selected: [1] }, ""), true)
		assert.equal(answerValid(multi, { ...emptySelection(), selected: [0, 1] }, ""), true)
	})
	it("needs text for Other", () => {
		const sel = { ...emptySelection(), otherSelected: true }
		assert.equal(answerValid(single, sel, "  "), false)
		assert.equal(answerValid(single, sel, "mine"), true)
	})
	it("accepts I don't know", () => {
		assert.equal(answerValid(single, { ...emptySelection(), dontKnow: true }, ""), true)
	})
	it("text mode needs text", () => {
		assert.equal(answerValid({ mode: "text" }, emptySelection(), ""), false)
		assert.equal(answerValid({ mode: "text" }, emptySelection(), "hi"), true)
	})
})

describe("onForeground", () => {
	it("adopts the record when idle", () => {
		assert.equal(onForeground({ visible: true, turnInFlight: false }), "adopt")
	})
	it("adopts and resumes when a turn is in flight", () => {
		assert.equal(onForeground({ visible: true, turnInFlight: true }), "adopt-and-resume")
	})
	it("does nothing while hidden or when the fetch failed", () => {
		assert.equal(onForeground({ visible: false, turnInFlight: true }), "none")
		assert.equal(onForeground({ visible: true, turnInFlight: null }), "none")
	})
})

describe("stickToBottom", () => {
	it("follows when at the bottom", () => {
		assert.equal(stickToBottom(500, 1000, 500), true)
		assert.equal(stickToBottom(470, 1000, 500), true)
	})
	it("stops following when the learner scrolls up", () => {
		assert.equal(stickToBottom(200, 1000, 500), false)
	})
})
