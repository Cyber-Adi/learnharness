import { findPendingToolCall, pendingQuestionOf } from "@/src/core"
import type { LhMessage, LhViewMessage, PendingQuestion } from "@/src/core"
import type { SheetSelection } from "./sheet-draft.ts"

const STICK_THRESHOLD_PX = 48

// Same authority the desktop dock uses: the native scan names the occurrence, the view supplies the part.
export function pendingFor(view: readonly LhViewMessage[], native: readonly LhMessage[]): PendingQuestion | null {
	return findPendingToolCall([...view], pendingQuestionOf(native))
}

// Mirrors the desktop dock's canSubmit rule.
export function answerValid(question: { readonly mode: string }, selection: SheetSelection, otherText: string): boolean {
	if (question.mode === "text") return otherText.trim().length > 0
	return selection.dontKnow || (selection.otherSelected && otherText.trim().length > 0) || selection.selected.length > 0
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
