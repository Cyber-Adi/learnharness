"use client"

import type { MotionValue } from "motion/react"
import { type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useMemo, useRef } from "react"
import { pickTouch, shouldStartPointer } from "./sheet-input.ts"
import { dragPosition, estimateVelocity, type VelocitySample } from "./sheet-physics.ts"

// Movement before a content touch becomes a sheet drag, so taps and scrolls stay intact.
const HYSTERESIS_PX = 10
const MAX_SAMPLES = 8

export interface GestureOptions {
	readonly y: MotionValue<number>
	readonly enabled: boolean
	/** Smallest rest offset; dragging above it rubber-bands. */
	readonly topRest: number
	readonly dimension: number
	readonly currentRest: number
	/** True when a drag up should grow the sheet (not at the top detent yet). */
	readonly canExpand: boolean
	readonly onGrab: () => void
	readonly onRelease: (release: { offsetY: number; velocityY: number }) => void
}

interface DragState {
	readonly id: number
	readonly originClientY: number
	readonly originY: number
	readonly samples: readonly VelocitySample[]
}

export interface DragController {
	readonly active: boolean
	begin(clientY: number, t: number, id?: number): void
	move(clientY: number, t: number, id?: number): void
	end(t: number, id?: number): void
	/** Gesture interrupted (capture lost, touchcancel): snap back to the current rest. */
	cancel(t: number, id?: number): void
	/** Drop the gesture silently (sheet closed, unmounted, or gesture disabled). */
	abort(): void
}

export function createDragController(get: () => GestureOptions): DragController {
	let state: DragState | null = null
	return {
		get active() {
			return state !== null
		},
		begin(clientY, t, id = 0) {
			// A second contact never restarts a drag in progress.
			if (state) return
			const o = get()
			o.onGrab()
			// Start from the live on-screen value so grabbing mid-spring never jumps.
			state = { id, originClientY: clientY, originY: o.y.get(), samples: [{ y: clientY, t }] }
		},
		move(clientY, t, id = 0) {
			if (!state || state.id !== id) return
			const o = get()
			state = { ...state, samples: [...state.samples.slice(-(MAX_SAMPLES - 1)), { y: clientY, t }] }
			o.y.set(dragPosition(state.originY, clientY - state.originClientY, o.topRest, o.dimension))
		},
		cancel(_t, id = 0) {
			if (!state || state.id !== id) return
			state = null
			get().onRelease({ offsetY: 0, velocityY: 0 })
		},
		abort() {
			state = null
		},
		end(t, id = 0) {
			if (!state || state.id !== id) return
			const s = state
			state = null
			const last = s.samples[s.samples.length - 1]
			const dy = (last?.y ?? s.originClientY) - s.originClientY
			get().onRelease({
				offsetY: s.originY + dy - get().currentRest,
				velocityY: estimateVelocity(s.samples, t),
			})
		},
	}
}

export interface HeaderHandlers {
	readonly onPointerDown: (e: ReactPointerEvent<HTMLElement>) => void
	readonly onPointerMove: (e: ReactPointerEvent<HTMLElement>) => void
	readonly onPointerUp: (e: ReactPointerEvent<HTMLElement>) => void
	readonly onPointerCancel: (e: ReactPointerEvent<HTMLElement>) => void
	readonly onLostPointerCapture: (e: ReactPointerEvent<HTMLElement>) => void
}

function bindContent(el: HTMLElement, controller: DragController, get: () => GestureOptions): () => void {
	let startY = 0
	let touchId: number | null = null
	const onStart = (e: TouchEvent) => {
		if (touchId !== null || controller.active) return
		const t = e.changedTouches[0]
		if (!t) return
		touchId = t.identifier
		startY = t.clientY
	}
	const onMove = (e: TouchEvent) => {
		const touch = pickTouch(e.changedTouches, touchId)
		const o = get()
		if (!touch || touchId === null || !o.enabled) return
		if (!controller.active) {
			const dy = touch.clientY - startY
			const pullDown = dy > HYSTERESIS_PX && el.scrollTop <= 0
			const pullUp = dy < -HYSTERESIS_PX && o.canExpand
			if (!pullDown && !pullUp) return
			controller.begin(touch.clientY, e.timeStamp, touchId)
		}
		if (e.cancelable) e.preventDefault()
		controller.move(touch.clientY, e.timeStamp, touchId)
	}
	const onEnd = (e: TouchEvent) => {
		if (!pickTouch(e.changedTouches, touchId)) return
		controller.end(e.timeStamp, touchId ?? 0)
		touchId = null
	}
	const onCancel = (e: TouchEvent) => {
		if (!pickTouch(e.changedTouches, touchId)) return
		controller.cancel(e.timeStamp, touchId ?? 0)
		touchId = null
	}
	el.addEventListener("touchstart", onStart, { passive: true })
	el.addEventListener("touchmove", onMove, { passive: false })
	el.addEventListener("touchend", onEnd)
	el.addEventListener("touchcancel", onCancel)
	return () => {
		el.removeEventListener("touchstart", onStart)
		el.removeEventListener("touchmove", onMove)
		el.removeEventListener("touchend", onEnd)
		el.removeEventListener("touchcancel", onCancel)
		controller.abort()
	}
}

// Header/grabber drag with pointer events; content drag with non-passive touch events,
// started only from content scrolled to the top (or when the sheet can still expand).
export function useSheetGesture(
	opts: GestureOptions,
	contentRef: RefObject<HTMLElement | null>,
	mounted: boolean,
): HeaderHandlers {
	const optsRef = useRef(opts)
	useEffect(() => {
		optsRef.current = opts
	})
	const controller = useMemo(() => createDragController(() => optsRef.current), [])

	useEffect(() => {
		const el = contentRef.current
		if (!mounted || !el) return
		return bindContent(el, controller, () => optsRef.current)
	}, [mounted, contentRef, controller])

	// Close, disable or unmount drops any in-flight drag so a reopen starts fresh.
	useEffect(() => {
		if (!opts.enabled) controller.abort()
	}, [opts.enabled, controller])
	useEffect(() => () => controller.abort(), [controller])

	return useMemo<HeaderHandlers>(
		() => ({
			onPointerDown(e) {
				if (!optsRef.current.enabled || (e.target as HTMLElement).closest("button")) return
				if (!shouldStartPointer(e) || controller.active) return
				e.currentTarget.setPointerCapture(e.pointerId)
				controller.begin(e.clientY, e.timeStamp, e.pointerId)
			},
			onPointerMove(e) {
				controller.move(e.clientY, e.timeStamp, e.pointerId)
			},
			onPointerUp(e) {
				controller.end(e.timeStamp, e.pointerId)
			},
			onPointerCancel(e) {
				controller.cancel(e.timeStamp, e.pointerId)
			},
			onLostPointerCapture(e) {
				controller.cancel(e.timeStamp, e.pointerId)
			},
		}),
		[controller],
	)
}
