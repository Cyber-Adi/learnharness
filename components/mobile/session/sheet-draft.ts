import { toggleOption, toggleOther, DEFAULT_CONFIDENCE_INDEX, CONFIDENCE_STOPS } from "@/src/core"
import type { DockSelection, SelectMode } from "@/src/core"
import { z } from "zod"

// Serializable selection: the desktop DockSelection holds a Set, drafts cross the wire as JSON.
// Same field names as the drafts wire format, so desktop and phone drafts interoperate.
export const sheetSelectionSchema = z.object({
	selected: z.array(z.number().int().min(0)),
	otherSelected: z.boolean(),
	dontKnow: z.boolean(),
	other: z.string().optional(),
	text: z.string().optional(),
})

export type SheetSelection = z.infer<typeof sheetSelectionSchema>

export interface SheetDraft {
	readonly selection: unknown
	readonly confidenceIndex: number | null
	readonly thinking: string
}

export interface SheetForm {
	readonly selection: SheetSelection
	/** Free text behind "Other". */
	readonly other: string
	/** Free-text answer for text-mode questions. */
	readonly text: string
	readonly thinking: string
	readonly confidenceIndex: number
}

export const emptySelection = (): SheetSelection => ({ selected: [], otherSelected: false, dontKnow: false })

export const emptyForm = (): SheetForm => ({
	selection: emptySelection(),
	other: "",
	text: "",
	thinking: "",
	confidenceIndex: DEFAULT_CONFIDENCE_INDEX,
})

const toDock = (s: SheetSelection): DockSelection => ({
	selected: new Set(s.selected),
	otherSelected: s.otherSelected,
	dontKnow: s.dontKnow,
})

const fromDock = (d: DockSelection, prev: SheetSelection): SheetSelection => ({
	...prev,
	selected: [...d.selected].sort((a, b) => a - b),
	otherSelected: d.otherSelected,
	dontKnow: d.dontKnow,
})

// Selection transitions come from the desktop's pure core, so the rules cannot drift.
export function toggleListed(mode: SelectMode, s: SheetSelection, idx: number): SheetSelection {
	return fromDock(toggleOption(mode, toDock(s), idx), s)
}

export function toggleOtherRow(mode: SelectMode, s: SheetSelection): SheetSelection {
	return fromDock(toggleOther(mode, toDock(s)), s)
}

// Quiz "I don't know" displaces every other choice, and toggles off again.
export function toggleDontKnow(s: SheetSelection): SheetSelection {
	return { ...s, selected: [], otherSelected: false, dontKnow: !s.dontKnow }
}

function clampConfidence(index: number | null): number {
	if (index === null || !Number.isInteger(index)) return DEFAULT_CONFIDENCE_INDEX
	return Math.min(Math.max(index, 0), CONFIDENCE_STOPS.length - 1)
}

// A draft is external input (server, other device): parse, never cast.
export function formFromDraft(draft: SheetDraft | null): SheetForm {
	if (!draft) return emptyForm()
	const parsed = sheetSelectionSchema.safeParse(draft.selection)
	const selection = parsed.success ? parsed.data : emptySelection()
	return {
		selection,
		other: selection.other ?? "",
		text: selection.text ?? "",
		thinking: draft.thinking,
		confidenceIndex: clampConfidence(draft.confidenceIndex),
	}
}

export function draftFromForm(form: SheetForm): SheetDraft {
	return {
		selection: { ...form.selection, other: form.other, text: form.text },
		confidenceIndex: form.confidenceIndex,
		thinking: form.thinking,
	}
}
