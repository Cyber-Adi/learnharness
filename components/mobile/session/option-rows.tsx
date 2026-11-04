"use client"

import { ToolContentResponse } from "@/components/ai-elements/message"
import type { QuestionData } from "@/src/core"

const ROW = "flex w-full items-center gap-3 rounded-[var(--lh-m-radius-control,12px)] border px-3 text-left text-[17px] aria-checked:border-current aria-checked:font-semibold"
const ROW_STYLE = { minHeight: 48 } as const

interface RowProps {
	readonly role: "radio" | "checkbox"
	readonly checked: boolean
	readonly label: string
	readonly onClick: () => void
}

export function OptionRow({ role, checked, label, onClick }: RowProps) {
	return (
		<button type="button" role={role} aria-checked={checked} className={ROW} style={ROW_STYLE} onClick={onClick}>
			<span aria-hidden="true" className={`inline-block size-5 shrink-0 border ${role === "radio" ? "rounded-full" : "rounded"} ${checked ? "bg-current" : ""}`} />
			<span className="min-w-0 flex-1">{label}</span>
		</button>
	)
}

interface QuestionHeadProps {
	readonly qd: QuestionData
}

export function QuestionHead({ qd }: QuestionHeadProps) {
	return (
		<div className="lh-m-prose" data-testid="sheet-question">
			<ToolContentResponse>{qd.question}</ToolContentResponse>
			{qd.context ? (
				<div className="opacity-70">
					<ToolContentResponse>{qd.context}</ToolContentResponse>
				</div>
			) : null}
		</div>
	)
}
