// Pure toast rules: ids, copy, and repeat suppression. No React, no Sonner.

export type ToastEvent = "answeredElsewhere" | "draftRestored" | "hostOffline" | "hostOnline" | "error"

export const SUPPRESS_WINDOW_MS = 1500
export const BACK_ONLINE_MS = 2000

export const TOAST_COPY = Object.freeze({
	answeredElsewhere: "Answered on Desktop",
	draftFromDesktop: "Draft from Desktop",
	draftFromPhone: "Draft from phone",
	hostOffline: "Host offline. Reconnecting...",
	hostOnline: "Back online",
	genericError: "Something went wrong",
} as const)

const ID_PREFIX = "lh-m-toast:"

// Fixed ids: a repeated event updates its toast instead of stacking a new one.
// Online shares the offline id so "Back online" replaces the persistent toast.
export function toastIdFor(event: ToastEvent): string {
	return event === "hostOnline" ? `${ID_PREFIX}hostOffline` : `${ID_PREFIX}${event}`
}

// Events with a detail (an error message, a draft device) are only repeats of the same detail.
export function dedupeKey(event: ToastEvent, detail?: string): string {
	const id = toastIdFor(event)
	return detail === undefined ? id : `${id}:${detail}`
}

export function shouldShow(
	_event: ToastEvent,
	lastShownAt: number | null | undefined,
	now: number,
): boolean {
	if (lastShownAt === null || lastShownAt === undefined) return true
	const elapsed = now - lastShownAt
	// A clock that moved backwards must not suppress forever.
	return elapsed < 0 || elapsed >= SUPPRESS_WINDOW_MS
}
