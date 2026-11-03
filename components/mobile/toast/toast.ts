import { toast } from "sonner"
import { z } from "zod"
import {
	BACK_ONLINE_MS,
	TOAST_COPY,
	type ToastEvent,
	dedupeKey,
	shouldShow,
	toastIdFor,
} from "./toast-policy.ts"

export interface ToastShowOptions {
	readonly duration?: number
}

// Boundary we own: the notifier talks to this, Sonner sits behind the default sink.
export interface ToastSink {
	show(id: string, message: string, options: ToastShowOptions): void
	dismiss(id: string): void
}

export interface Notifier {
	answeredElsewhere(): void
	draftRestored(device: DraftDevice): void
	hostOffline(): void
	hostOnline(): void
	error(message: string): void
}

export type DraftDevice = "desktop" | "phone"

const MAX_ERROR_LENGTH = 120
const deviceSchema = z.enum(["desktop", "phone"])
const errorMessageSchema = z
	.string()
	.transform((s) => s.trim().slice(0, MAX_ERROR_LENGTH))
	.pipe(z.string().min(1))

export const sonnerSink = Object.freeze<ToastSink>({
	show(id, message, options) {
		toast(message, { id, ...options })
	},
	dismiss(id) {
		toast.dismiss(id)
	},
})

export function createNotifier({
	sink = sonnerSink,
	now = () => Date.now(),
}: { sink?: ToastSink; now?: () => number } = {}): Notifier {
	const lastShown = new Map<string, number>()
	let offline = false

	// Repeats of the same keyed event inside the window are dropped.
	function showOnce(event: ToastEvent, message: string, detail?: string, options: ToastShowOptions = {}): void {
		const key = dedupeKey(event, detail)
		const t = now()
		if (!shouldShow(event, lastShown.get(key), t)) return
		lastShown.set(key, t)
		sink.show(toastIdFor(event), message, options)
	}

	return {
		answeredElsewhere() {
			showOnce("answeredElsewhere", TOAST_COPY.answeredElsewhere)
		},
		draftRestored(device) {
			const parsed = deviceSchema.safeParse(device)
			if (!parsed.success) return
			const message = parsed.data === "desktop" ? TOAST_COPY.draftFromDesktop : TOAST_COPY.draftFromPhone
			showOnce("draftRestored", message, parsed.data)
		},
		// Connection state, not time, decides these: a quick flap must still end on the true state.
		hostOffline() {
			if (offline) return
			offline = true
			sink.show(toastIdFor("hostOffline"), TOAST_COPY.hostOffline, { duration: Number.POSITIVE_INFINITY })
		},
		hostOnline() {
			if (!offline) return
			offline = false
			const id = toastIdFor("hostOnline")
			sink.dismiss(id)
			sink.show(id, TOAST_COPY.hostOnline, { duration: BACK_ONLINE_MS })
		},
		error(message) {
			const parsed = errorMessageSchema.safeParse(message)
			const text = parsed.success ? parsed.data : TOAST_COPY.genericError
			showOnce("error", text, text)
		},
	}
}

export const notify: Notifier = createNotifier()
