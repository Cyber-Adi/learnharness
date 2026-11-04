import { findPendingToolCall, pendingQuestionOf } from "@/src/core"
import type { LhMessage, LhViewMessage, PendingQuestion } from "@/src/core"
import type { SheetSelection } from "./sheet-draft.ts"

const STICK_THRESHOLD_PX = 48

// Same authority the desktop dock uses: the native scan names the occurrence, the view supplies the part.
export function pendingFor(view: readonly LhViewMessage[], native: readonly LhMessage[]): PendingQuestion | null {
	return findPendingToolCall([...view], pendingQuestionOf(native))
}

// Mirrors the desktop dock's canSubmit rule.
export function answerValid(question: { readonly mode: string }, selection: SheetSelection, otherText: string, optionCount: number = Number.POSITIVE_INFINITY): boolean {
	if (question.mode === "text") return otherText.trim().length > 0
	const listed = selection.selected.filter((i) => i < optionCount).length
	return selection.dontKnow || (selection.otherSelected && otherText.trim().length > 0) || listed > 0
}

export type ForegroundDecision = "adopt" | "adopt-and-resume" | "none"

export interface ForegroundState {
	readonly visible: boolean
	/** Server's turnInFlight from the refetched record; null when the fetch failed. */
	readonly turnInFlight: boolean | null
}

export function onForeground(state: ForegroundState): ForegroundDecision {
	if (!state.visible || state.turnInFlight === null) return "none"
	return state.turnInFlight ? "adopt-and-resume" : "adopt"
}

export function stickToBottom(scrollTop: number, scrollHeight: number, clientHeight: number): boolean {
	return scrollHeight - scrollTop - clientHeight <= STICK_THRESHOLD_PX
}

export interface AnsweredElsewhereDeps {
	readonly close: () => void
	readonly notifier: { answeredElsewhere(): void }
}

// Wired to SessionModel.onAnsweredElsewhere: the other device won, so drop our sheet and say so.
export function makeAnsweredElsewhere({ close, notifier }: AnsweredElsewhereDeps): () => void {
	return () => {
		close()
		notifier.answeredElsewhere()
	}
}

// One "Draft from Desktop" toast per question, however often the draft re-renders.
export function draftAnnouncement(origin: "desktop" | "phone" | null, announcedFor: string | null, questionKey: string): "desktop" | null {
	return origin === "desktop" && announcedFor !== questionKey ? "desktop" : null
}

export type SessionKind = "teach" | "practice"

export function kindLabel(kind: SessionKind | undefined): string | null {
	return kind === "practice" ? "Practice" : null
}

const answeredCalls = (messages: readonly LhMessage[]): Set<string> =>
	new Set(messages.filter((m) => m.role === "toolResult").map((m) => (m as { toolCallId: string }).toolCallId))

// A local answer the server record does not yet hold is still awaiting confirmation: adopting an older record would erase it.
export function shouldAdoptRecord(local: readonly LhMessage[], record: readonly LhMessage[]): boolean {
	const held = answeredCalls(record)
	for (const id of answeredCalls(local)) if (!held.has(id)) return false
	return true
}

export const FETCH_RETRY_BASE_MS = 1000
export const FETCH_MAX_RETRIES = 3

// Backoff 1 s, 2 s, 4 s; stops early when a newer sync has superseded this one.
export async function fetchWithRetry<T>(run: () => Promise<T | null>, sleep: (ms: number) => Promise<void>, live: () => boolean): Promise<T | null> {
	for (let attempt = 0; ; attempt++) {
		const out = await run()
		if (out !== null || attempt >= FETCH_MAX_RETRIES || !live()) return out
		await sleep(FETCH_RETRY_BASE_MS * 2 ** attempt)
		if (!live()) return null
	}
}
