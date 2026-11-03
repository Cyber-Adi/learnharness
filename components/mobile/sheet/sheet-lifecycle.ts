export interface EnterInput {
	readonly entered: boolean
	readonly exiting: boolean
	readonly currentY: number
	readonly height: number
}

export type EnterPlan = { readonly kind: "snap" } | { readonly kind: "animate"; readonly from: number }

// Reopening mid-exit continues from where the sheet is, so it never jumps.
export function enterPlan(i: EnterInput): EnterPlan {
	if (i.entered) return { kind: "snap" }
	return { kind: "animate", from: i.exiting ? i.currentY : i.height }
}

// Stops the running animation and invalidates any pending exit completion.
export function cancelMotion(controls: { stop(): void } | null, token: number): number {
	controls?.stop()
	return token + 1
}
