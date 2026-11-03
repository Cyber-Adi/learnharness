import {
	buildAnswer,
	CONFIDENCE_STOPS,
	normalizeOptions,
	normalizeQuizType,
	parseAskInput,
	parseExplainInput,
	parseQuizInput,
	resolveCorrect,
	seededRandom,
	shuffleOptions,
	toolQuestionKind,
} from "@/src/core"
import type { AnswerRequest, PendingQuestion, QuestionAnswerData, QuestionData, QuestionMode } from "@/src/core"
import type { SheetForm } from "./sheet-draft.ts"

export interface DraftHandle {
	flush(reason: "send"): void
	clear(): void
}

export type SubmitAnswerFn = (tool: string, toolCallId: string, output: QuestionAnswerData, questionKey?: string) => void

// Mirrors the desktop dock's QuestionData assembly (same shuffle seed, so option order matches).
// Returns null for malformed model input, like the dock's quiet fallback.
export function questionDataOf(pending: Pick<PendingQuestion, "tool" | "toolCallId" | "input">, now: () => Date = () => new Date()): QuestionData | null {
	const kind = toolQuestionKind(pending.tool)
	const quiz = kind === "quiz" ? parseQuizInput(pending.input) : undefined
	const ask = kind === "ask" ? parseAskInput(pending.input) : undefined
	const explain = kind === "explain" ? parseExplainInput(pending.input) : undefined
	const parsed = quiz ?? ask ?? explain
	if (!parsed) return null
	const multi = "multiSelect" in parsed && parsed.multiSelect === true
	const options = normalizeOptions(quiz?.options ?? ask?.options ?? [])
	const mode: QuestionMode = kind === "quiz" ? (multi ? "multi-select" : "single-select") : ask?.options?.length ? (multi ? "multi-select" : "single-select") : "text"
	const ordered = kind === "quiz" && options.length > 0 ? shuffleOptions(options, seededRandom(pending.toolCallId)) : options
	const qd: QuestionData = {
		id: pending.toolCallId,
		kind,
		questionType: kind === "quiz" ? normalizeQuizType((pending.input as { type?: unknown }).type) : undefined,
		question: parsed.question,
		context: parsed.details,
		mode,
		options: ordered,
		createdAt: now().toISOString(),
	}
	if (quiz) {
		const resolved = resolveCorrect(quiz.correctAnswer, ordered)
		qd.correctIndices = resolved.indices
		qd.explanation = quiz.explanation
	}
	if (explain) qd.committedAnswer = explain.correctAnswer
	return qd
}

export function answerRequestOf(qd: QuestionData, form: SheetForm): AnswerRequest {
	const text = qd.mode === "text"
	return {
		dontKnow: form.selection.dontKnow,
		values: form.selection.selected.map((i) => qd.options[i]?.value).filter((v): v is string => v !== undefined),
		other: form.selection.otherSelected ? form.other : undefined,
		text: text ? form.text : undefined,
		thinking: text ? undefined : form.thinking.trim() || undefined,
		// Always sent on quiz answers (50 must mean 50); buildAnswer drops it on "I don't know".
		confidence: qd.kind === "quiz" ? CONFIDENCE_STOPS[form.confidenceIndex] : undefined,
	}
}

export interface SubmitDeps {
	readonly qd: QuestionData
	readonly tool: string
	readonly toolCallId: string
	readonly questionKey: string
	readonly form: SheetForm
	readonly draft: DraftHandle
	readonly submitAnswer: SubmitAnswerFn
	readonly close: () => void
}

// flush -> submit -> clear: the last keystrokes reach the server before the draft is deleted.
export function submitSheet(deps: SubmitDeps): void {
	const answer = buildAnswer(deps.qd, answerRequestOf(deps.qd, deps.form), deps.tool)
	deps.draft.flush("send")
	deps.submitAnswer(deps.tool, deps.toolCallId, answer, deps.questionKey)
	deps.draft.clear()
	deps.close()
}
