"use client"

import { Sheet } from "../sheet/sheet.tsx"
import type { HapticsAdapter } from "../haptics.ts"
import type { QuestionData } from "@/src/core"
import { ConfidenceStops } from "./confidence-stops.tsx"
import { OptionRow, QuestionHead } from "./option-rows.tsx"
import { answerValid } from "./session-logic.ts"
import { toggleDontKnow, toggleListed, toggleOtherRow } from "./sheet-draft.ts"
import type { SheetDraft, SheetForm } from "./sheet-draft.ts"
import { useSheetForm } from "./use-sheet-form.ts"

export interface QuestionSheetProps {
	readonly open: boolean
	readonly onOpenChange: (open: boolean) => void
	readonly qd: QuestionData
	readonly initial: SheetDraft | null
	readonly origin: "desktop" | "phone" | null
	readonly onDraftChange: (draft: SheetDraft) => void
	readonly onSubmit: (form: SheetForm) => void
	readonly haptics?: HapticsAdapter
	/** Test seams, passed through to Sheet. */
	readonly portal?: boolean
	readonly reducedMotion?: boolean
}

const FIELD = "w-full rounded-[var(--lh-m-radius-control,12px)] border bg-transparent px-3 py-2 text-[17px]"

export function QuestionSheet({ open, onOpenChange, qd, initial, origin, onDraftChange, onSubmit, haptics, portal, reducedMotion }: QuestionSheetProps) {
	const { form, patch } = useSheetForm({ initial, onDraftChange })
	const text = qd.mode === "text"
	const multi = qd.mode === "multi-select"
	const mode = multi ? "multi-select" : "single-select"
	const valid = answerValid(qd, form.selection, text ? form.text : form.other)
	const picked = new Set(form.selection.selected)
	const select = (selection: SheetForm["selection"]) => patch({ selection })

	return (
		<Sheet open={open} onOpenChange={onOpenChange} title="Your answer" detents={["large"]} haptics={haptics} portal={portal} reducedMotion={reducedMotion}>
			<div className="flex flex-col gap-4 pt-2">
				{origin === "desktop" ? (
					<span data-testid="draft-chip" className="self-start rounded-full border px-3 py-1 text-[13px]">
						Draft from Desktop
					</span>
				) : null}
				<QuestionHead qd={qd} />
				{text ? (
					<label className="flex flex-col gap-1 text-[15px] font-medium">
						Your answer
						<textarea className={FIELD} rows={4} value={form.text} onChange={(e) => patch({ text: e.target.value })} />
					</label>
				) : (
					<div role={multi ? "group" : "radiogroup"} aria-label="Options" className="flex flex-col gap-2">
						{qd.options.map((o, i) => (
							<OptionRow key={o.value} role={multi ? "checkbox" : "radio"} checked={picked.has(i)} label={o.label} onClick={() => select(toggleListed(mode, form.selection, i))} />
						))}
						{qd.kind === "ask" ? (
							<OptionRow role={multi ? "checkbox" : "radio"} checked={form.selection.otherSelected} label="Other" onClick={() => select(toggleOtherRow(mode, form.selection))} />
						) : null}
						{qd.kind === "ask" && form.selection.otherSelected ? (
							<input aria-label="Other answer" className={FIELD} style={{ minHeight: 44 }} value={form.other} onChange={(e) => patch({ other: e.target.value })} />
						) : null}
						{qd.kind === "quiz" ? <OptionRow role="radio" checked={form.selection.dontKnow} label="I don't know" onClick={() => select(toggleDontKnow(form.selection))} /> : null}
					</div>
				)}
				{qd.kind === "quiz" ? <ConfidenceStops index={form.confidenceIndex} onChange={(confidenceIndex) => patch({ confidenceIndex })} haptics={haptics} /> : null}
				{text ? null : (
					<label className="flex flex-col gap-1 text-[15px] font-medium">
						Your thinking
						<textarea className={FIELD} rows={3} placeholder="Optional" value={form.thinking} onChange={(e) => patch({ thinking: e.target.value })} />
					</label>
				)}
				<button
					type="button"
					disabled={!valid}
					className="rounded-[var(--lh-m-radius-control,12px)] bg-foreground px-4 text-[17px] font-semibold text-background disabled:opacity-40"
					style={{ minHeight: 48 }}
					onClick={() => onSubmit(form)}
				>
					Submit
				</button>
			</div>
		</Sheet>
	)
}
