import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { buildAnswer } from "../src/core/question-core.ts"
import type { QuestionAnswerData } from "../src/core/question-core.ts"
import { answerRequestOf, questionDataOf, submitSheet } from "../components/mobile/session/question-model.ts"
import { draftFromForm, emptyForm, formFromDraft, toggleDontKnow, toggleListed, toggleOtherRow } from "../components/mobile/session/sheet-draft.ts"

const QUIZ = { question: "Closest planet?", options: [{ label: "Venus" }, { label: "Mercury" }, { label: "Mars" }], correctAnswer: "Mercury", explanation: "Innermost." }
const NOW = () => new Date("2026-01-01T00:00:00.000Z")
const pending = { tool: "quiz", toolCallId: "call-1", input: QUIZ }

describe("questionDataOf", () => {
	it("builds quiz data with a resolved correct answer", () => {
		const qd = questionDataOf(pending, NOW)
		assert.ok(qd)
		assert.equal(qd.mode, "single-select")
		assert.equal(qd.options.length, 3)
		assert.equal(qd.correctIndices?.length, 1)
	})
	it("returns null for malformed input", () => {
		assert.equal(questionDataOf({ tool: "quiz", toolCallId: "x", input: { nope: 1 } }, NOW), null)
	})
	it("uses text mode for an ask question without options", () => {
		const qd = questionDataOf({ tool: "ask_user_question", toolCallId: "a", input: { question: "Why?" } }, NOW)
		assert.equal(qd?.mode, "text")
	})
})

describe("submitSheet", () => {
	function run(formPatch: Partial<ReturnType<typeof emptyForm>> = {}) {
		const qd = questionDataOf(pending, NOW)!
		const idx = qd.options.findIndex((o) => o.label === "Mercury")
		const form = { ...emptyForm(), ...formPatch, selection: { ...emptyForm().selection, selected: [idx] }, thinking: " because " }
		const calls: string[] = []
		const answers: QuestionAnswerData[] = []
		submitSheet({
			qd,
			tool: "quiz",
			toolCallId: "call-1",
			questionKey: "call-1",
			form,
			draft: { flush: (r) => calls.push(`flush:${r}`), clear: () => calls.push("clear") },
			submitAnswer: (_t, _id, out) => {
				calls.push("submit")
				answers.push(out)
			},
			close: () => calls.push("close"),
		})
		return { qd, form, calls, answers }
	}
	it("submits once with the core buildAnswer result", () => {
		const { qd, form, calls, answers } = run()
		assert.equal(calls.filter((c) => c === "submit").length, 1)
		const expected = buildAnswer(qd, answerRequestOf(qd, form), "quiz")
		assert.deepEqual({ ...answers[0], answeredAt: "" }, { ...expected, answeredAt: "" })
		assert.equal(answers[0]?.correct, true)
		assert.equal(answers[0]?.confidence, 50)
		assert.equal(answers[0]?.thinking, "because")
	})
	it("flushes then clears the draft around submit", () => {
		assert.deepEqual(run().calls, ["flush:send", "submit", "clear", "close"])
	})
})

describe("selection transitions", () => {
	it("single-select displaces, multi-select coexists", () => {
		const a = toggleListed("single-select", toggleListed("single-select", emptyForm().selection, 0), 2)
		assert.deepEqual(a.selected, [2])
		const b = toggleListed("multi-select", toggleListed("multi-select", emptyForm().selection, 2), 0)
		assert.deepEqual(b.selected, [0, 2])
	})
	it("Other and I don't know displace listed picks in single-select", () => {
		const base = toggleListed("single-select", emptyForm().selection, 1)
		assert.equal(toggleOtherRow("single-select", base).selected.length, 0)
		assert.equal(toggleDontKnow(base).dontKnow, true)
		assert.equal(toggleDontKnow(toggleDontKnow(base)).dontKnow, false)
	})
})

describe("draft mapping", () => {
	it("round-trips a form", () => {
		const form = { ...emptyForm(), thinking: "hm", other: "o", confidenceIndex: 4, selection: { ...emptyForm().selection, selected: [1] } }
		assert.deepEqual(formFromDraft(draftFromForm(form)), { ...form, selection: { ...form.selection, other: "o", text: "" } })
	})
	it("ignores a malformed selection and clamps confidence", () => {
		const f = formFromDraft({ selection: "garbage", confidenceIndex: 99, thinking: "t" })
		assert.deepEqual(f.selection.selected, [])
		assert.equal(f.confidenceIndex, 5)
		assert.equal(formFromDraft(null).confidenceIndex, 2)
	})
})
