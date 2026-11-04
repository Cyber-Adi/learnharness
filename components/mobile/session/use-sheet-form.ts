"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import { draftFromForm, formFromDraft } from "./sheet-draft.ts"
import type { SheetDraft, SheetForm } from "./sheet-draft.ts"

interface Options {
	readonly initial: SheetDraft | null
	readonly optionCount: number
	readonly onDraftChange: (draft: SheetDraft) => void
}

// Form state outlives the sheet's open/close and any rotation: it lives here, above the Sheet.
// A late-arriving draft seeds the form only while the learner has not touched it.
export function useSheetForm({ initial, optionCount, onDraftChange }: Options) {
	const [form, setForm] = useState<SheetForm>(() => formFromDraft(initial, optionCount))
	const touched = useRef(false)
	const seeded = useRef(initial !== null)
	const notify = useRef(onDraftChange)
	notify.current = onDraftChange

	useEffect(() => {
		if (initial === null || touched.current || seeded.current) return
		seeded.current = true
		setForm(formFromDraft(initial, optionCount))
	}, [initial, optionCount])

	const patch = useCallback((next: Partial<SheetForm>) => {
		touched.current = true
		setForm((prev) => ({ ...prev, ...next }))
	}, [])

	useEffect(() => {
		if (touched.current) notify.current(draftFromForm(form))
	}, [form])

	return { form, patch }
}
