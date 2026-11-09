import React from "react"
;(globalThis as Record<string, unknown>).React = React
import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import { questionDataOf } from "../components/mobile/session/question-model.ts"
import { QuestionSheet } from "../components/mobile/session/question-sheet.tsx"
import { SessionView } from "../components/mobile/session/session-view.tsx"
import type { SessionViewProps } from "../components/mobile/session/session-view.tsx"
import { draftFromForm, emptyForm } from "../components/mobile/session/sheet-draft.ts"
import type { SheetDraft } from "../components/mobile/session/sheet-draft.ts"
import { makeAnsweredElsewhere, draftAnnouncement } from "../components/mobile/session/session-logic.ts"
import { parseServerRecord } from "../components/mobile/session/server-record.ts"

const NOW = () => new Date("2026-01-01T00:00:00.000Z")
const noop = () => {}
const QUIZ = { question: "Closest planet?", options: [{ label: "Venus" }, { label: "Mercury" }, { label: "Mars" }], correctAnswer: "Mercury", explanation: "Innermost." }
const quizQd = () => questionDataOf({ tool: "quiz", toolCallId: "c1", input: QUIZ }, NOW)!
const multiQd = () => questionDataOf({ tool: "quiz", toolCallId: "c2", input: { ...QUIZ, multiSelect: true, correctAnswer: "Mercury" } }, NOW)!
const askQd = () => questionDataOf({ tool: "ask_user_question", toolCallId: "c3", input: { question: "Which?", options: [{ label: "A" }, { label: "B" }] } }, NOW)!

function view(props: Partial<SessionViewProps> = {}): string {
	return renderToStaticMarkup(<SessionView title="Planets" messages={[]} status="ready" hasPending={false} turnRunning={false} onOpenAnswer={noop} {...props} />)
}

function sheet(qd = quizQd(), initial: SheetDraft | null = null, origin: "desktop" | "phone" | null = null): string {
	return renderToStaticMarkup(<QuestionSheet open onOpenChange={noop} qd={qd} initial={initial} origin={origin} onDraftChange={noop} onSubmit={noop} portal={false} reducedMotion />)
}

const submitDisabled = (html: string) => /<button[^>]*disabled=""[^>]*>Submit<\/button>/.test(html)
const draftWith = (patch: Partial<ReturnType<typeof emptyForm>> & { selected?: number[] }): SheetDraft => {
	const base = emptyForm()
	const { selected, ...rest } = patch
	return draftFromForm({ ...base, ...rest, selection: { ...base.selection, ...(rest.selection ?? {}), selected: selected ?? [] } })
}

describe("answer bar", () => {
	it("a pending question shows the Answer bar", () => {
		assert.match(view({ hasPending: true }), /<button[^>]*>Answer<\/button>/)
	})
	it("no pending question shows no Answer bar", () => {
		assert.doesNotMatch(view(), /<button[^>]*>Answer<\/button>/)
	})
})

describe("question sheet", () => {
	it("renders the question, options, confidence rail and thinking field", () => {
		const html = sheet()
		assert.match(html, /Closest planet\?/)
		for (const o of ["Venus", "Mercury", "Mars"]) assert.match(html, new RegExp(o))
		assert.match(html, /role="radiogroup"[^>]*aria-labelledby="lh-m-confidence-label"/)
		assert.match(html, /Your thinking/)
		assert.match(html, /<textarea/)
	})
	it("the confidence rail defaults to the default stop and every stop is at least 44px", () => {
		const html = sheet()
		assert.match(html, /role="radio"[^>]*aria-checked="true"[^>]*data-stop="50"/)
		assert.equal((html.match(/data-stop="/g) ?? []).length, 6)
		assert.equal((html.match(/data-stop="[^"]*"[^>]*style="[^"]*min-height:44px[^"]*min-width:44px/g) ?? []).length, 6)
		assert.match(html, /data-testid="confidence-value"[^>]*>50%/)
	})
	it("options are at least 48px rows", () => {
		assert.ok((sheet().match(/min-height:48px/g) ?? []).length >= 3)
	})
	it("Submit is disabled until a valid answer is chosen", () => {
		assert.equal(submitDisabled(sheet()), true)
		assert.equal(submitDisabled(sheet(quizQd(), draftWith({ selected: [1] }))), false, "single")
		assert.equal(submitDisabled(sheet(multiQd(), draftWith({ selected: [0, 2] }))), false, "multi")
		assert.equal(submitDisabled(sheet(quizQd(), draftWith({ selection: { selected: [], otherSelected: false, dontKnow: true } }))), false, "i dont know")
		const other = (text: string) => draftWith({ other: text, selection: { selected: [], otherSelected: true, dontKnow: false } })
		assert.equal(submitDisabled(sheet(askQd(), other(""))), true, "other without text")
		assert.equal(submitDisabled(sheet(askQd(), other("mine"))), false, "other with text")
	})
	it("a desktop draft seeds the sheet and shows Draft from Desktop", () => {
		const html = sheet(quizQd(), draftWith({ selected: [1], thinking: "from the laptop", confidenceIndex: 4 }), "desktop")
		assert.match(html, /Draft from Desktop/)
		assert.match(html, /from the laptop/)
		assert.match(html, /aria-checked="true"[^>]*data-stop="90"/)
		assert.equal((html.match(/role="radio" aria-checked="true"/g) ?? []).length >= 2, true)
	})
	it("a phone draft shows no desktop chip", () => {
		assert.doesNotMatch(sheet(quizQd(), draftWith({ selected: [1] }), "phone"), /Draft from Desktop/)
	})
	it("ask questions offer Other and no confidence rail", () => {
		const html = sheet(askQd())
		assert.match(html, />Other</)
		assert.doesNotMatch(html, /data-stop=/)
	})
	it("text-mode questions render an answer field", () => {
		const html = sheet(questionDataOf({ tool: "ask_user_question", toolCallId: "t", input: { question: "Why?" } }, NOW)!)
		assert.match(html, /Your answer/)
		assert.doesNotMatch(html, /Your thinking/)
	})
})

describe("session view chrome", () => {
	it("practice sessions show the Practice label", () => {
		assert.match(view({ kind: "practice" }), />Practice</)
		assert.doesNotMatch(view({ kind: "teach" }), />Practice</)
	})
	it("the back link goes to / and is 44px", () => {
		const html = view()
		const link = html.match(/<a [^>]*>Learn<\/a>/)?.[0] ?? ""
		assert.match(link, /href="\/"/)
		assert.match(link, /min-height:44px;min-width:44px/)
	})
	it("a session without a pending question shows a reply box instead of a desktop notice", () => {
		const html = view({ onReply: async () => true })
		assert.match(html, /<textarea[^>]*aria-label="Reply"/)
		assert.doesNotMatch(html, /Continue this session/)
	})
	it("a pending question shows the Answer bar and no reply box", () => {
		assert.doesNotMatch(view({ hasPending: true, onReply: async () => true }), /aria-label="Reply"/)
	})
	it("the reply box is set up for iOS dictation and keyboard", () => {
		const box = view({ onReply: async () => true }).match(/<textarea[^>]*>/)?.[0] ?? ""
		assert.match(box, /enterKeyHint="send"|enterkeyhint="send"/i)
		assert.match(box, /autoCapitalize="sentences"|autocapitalize="sentences"/i)
		assert.doesNotMatch(box, /autocomplete="off"|autocorrect="off"|spellcheck="false"/i)
		// Under 16px iOS zooms the page on focus.
		assert.match(box, /font-size:17px/)
	})
	it("Send is disabled while the box is empty and is a 44px target", () => {
		const send = view({ onReply: async () => true }).match(/<button[^>]*>Send<\/button>/)?.[0] ?? ""
		assert.match(send, /disabled=""/)
		assert.match(send, /min-height:44px;min-width:44px/)
	})
	it("the reply box stays mounted while a turn runs so a dictated reply is not lost", () => {
		assert.match(view({ turnRunning: true, status: "streaming", onReply: async () => true }), /aria-label="Reply"/)
	})
	it("shows the Thinking placeholder while submitted", () => {
		assert.match(view({ status: "submitted", turnRunning: true }), /data-testid="thinking"/)
		assert.doesNotMatch(view({ status: "ready" }), /data-testid="thinking"/)
	})
	it("Jump to latest appears only when scrolled up", () => {
		assert.match(view({ atBottom: false, onJumpLatest: noop }), /Jump to latest/)
		assert.doesNotMatch(view({ atBottom: true, onJumpLatest: noop }), /Jump to latest/)
	})
	it("no desktop-only controls render", () => {
		const html = view({ onReply: async () => true })
		assert.doesNotMatch(html, /contenteditable|Steer|Stop|Model|<input|type="file"|Attach/i)
	})
})

describe("session wiring helpers", () => {
	it("answered elsewhere closes the sheet and toasts Answered on Desktop", () => {
		const calls: string[] = []
		makeAnsweredElsewhere({ close: () => calls.push("close"), notifier: { answeredElsewhere: () => calls.push("toast") } })()
		assert.deepEqual(calls, ["close", "toast"])
	})
	it("announces a desktop draft once per question", () => {
		assert.equal(draftAnnouncement("desktop", null, "q1"), "desktop")
		assert.equal(draftAnnouncement("desktop", "q1", "q1"), null)
		assert.equal(draftAnnouncement("phone", null, "q1"), null)
		assert.equal(draftAnnouncement(null, null, "q1"), null)
	})
	it("treats a malformed record as a failed fetch", () => {
		assert.equal(parseServerRecord({ messages: "x" }), null)
		assert.equal(parseServerRecord({ messages: [{ role: "user" }], turnInFlight: true })?.turnInFlight, true)
		assert.equal(parseServerRecord({ messages: [] })?.turnInFlight, false)
	})
})
