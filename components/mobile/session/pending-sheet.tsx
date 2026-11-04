"use client"

import { useEffect, useMemo, useRef } from "react"
import { notify } from "../toast/toast.ts"
import { useDraftSync } from "../drafts/use-draft-sync.ts"
import { navigatorVibrateAdapter } from "../haptics.ts"
import type { PendingQuestion } from "@/src/core"
import { questionDataOf, submitSheet } from "./question-model.ts"
import type { SubmitAnswerFn } from "./question-model.ts"
import { QuestionSheet } from "./question-sheet.tsx"
import { draftAnnouncement } from "./session-logic.ts"
import type { SheetForm } from "./sheet-draft.ts"

interface Props {
	readonly chatId: string
	readonly pending: PendingQuestion
	readonly open: boolean
	readonly onOpenChange: (open: boolean) => void
	readonly submitAnswer: SubmitAnswerFn
}

// Mounted per question (keyed by the caller): the draft hook and form state are scoped to one toolCallId.
export function PendingSheet({ chatId, pending, open, onOpenChange, submitAnswer }: Props) {
	const draft = useDraftSync({ chatId, toolCallId: pending.toolCallId, deviceLabel: "phone" })
	const qd = useMemo(() => questionDataOf(pending), [pending])
	const announced = useRef<string | null>(null)

	useEffect(() => {
		if (draftAnnouncement(draft.origin, announced.current, pending.key) === null) return
		announced.current = pending.key
		notify.draftRestored("desktop")
	}, [draft.origin, pending.key])

	if (!qd) return null
	const onSubmit = (form: SheetForm) =>
		void submitSheet({
			qd,
			tool: pending.tool,
			toolCallId: pending.toolCallId,
			questionKey: pending.key,
			form,
			draft,
			submitAnswer,
			close: () => onOpenChange(false),
			reopen: () => onOpenChange(true),
		})

	return (
		<QuestionSheet
			open={open}
			onOpenChange={onOpenChange}
			qd={qd}
			initial={draft.initial}
			origin={draft.origin}
			onDraftChange={draft.update}
			onSubmit={onSubmit}
			haptics={navigatorVibrateAdapter}
		/>
	)
}
