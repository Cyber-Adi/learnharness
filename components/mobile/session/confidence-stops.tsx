"use client"

import { CONFIDENCE_STOPS } from "@/src/core"
import { CONFIDENCE_COLORS } from "@/components/confidence-rail"
import { hapticFor } from "../haptics.ts"
import type { HapticsAdapter } from "../haptics.ts"

const HIT = 44

interface Props {
	readonly index: number
	readonly onChange: (index: number) => void
	readonly haptics?: HapticsAdapter
}

// Six stops from the core, laid out as a radiogroup of 44pt buttons (a drag slider is unreliable under a thumb).
export function ConfidenceStops({ index, onChange, haptics }: Props) {
	const value = CONFIDENCE_STOPS[index]
	return (
		<div>
			<div className="flex items-baseline justify-between">
				<span id="lh-m-confidence-label" className="text-[15px] font-medium">
					Confidence
				</span>
				<span data-testid="confidence-value" className="text-[15px] tabular-nums" aria-live="polite">
					{value}%
				</span>
			</div>
			<div role="radiogroup" aria-labelledby="lh-m-confidence-label" className="mt-2 flex gap-2">
				{CONFIDENCE_STOPS.map((stop, i) => {
					const checked = i === index
					return (
						<button
							key={stop}
							type="button"
							role="radio"
							aria-checked={checked}
							data-stop={stop}
							className="flex-1 rounded-[var(--lh-m-radius-control,12px)] border text-[15px] tabular-nums"
							style={{
								minHeight: HIT,
								minWidth: HIT,
								borderColor: checked ? CONFIDENCE_COLORS[i] : undefined,
								backgroundColor: checked ? CONFIDENCE_COLORS[i] : undefined,
								color: checked ? "#141414" : undefined,
								fontWeight: checked ? 600 : 400,
							}}
							onClick={() => {
								if (!checked) haptics?.trigger(hapticFor("select"))
								onChange(i)
							}}
						>
							{stop}
						</button>
					)
				})}
			</div>
		</div>
	)
}
