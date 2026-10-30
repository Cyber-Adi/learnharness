import { HAPTIC, type HapticEvent, type HapticKind } from "./motion.ts"

// Semantic boundary: tests mock this, native shells may swap it.
export interface HapticsAdapter {
	trigger(kind: HapticKind): void
}

export const noopHapticsAdapter: HapticsAdapter = Object.freeze({
	trigger(): void {},
})

const VIBRATE_MS: Readonly<Record<HapticKind, number>> = Object.freeze({
	selection: 5,
	impactLight: 10,
	impactMedium: 20,
	notificationWarning: 30,
	notificationError: 50,
})

// iOS Safari has no navigator.vibrate; staying silent there is expected.
export const navigatorVibrateAdapter: HapticsAdapter = Object.freeze({
	trigger(kind: HapticKind): void {
		if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return
		navigator.vibrate(VIBRATE_MS[kind])
	},
})

export function hapticFor(event: HapticEvent): HapticKind {
	return HAPTIC[event]
}
