"use client"

import type { MotionValue } from "motion/react"
import { type PointerEvent as ReactPointerEvent, type RefObject, useEffect, useMemo, useRef } from "react"
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
	readonly originClientY: number
	readonly originY: number
	readonly samples: readonly VelocitySample[]
}

export interface DragController {
	readonly active: boolean
	begin(clientY: number, t: number): void
	move(clientY: number, t: number): void
	end(t: number): void
}

export function createDragController(get: () => GestureOptions): DragController {
	let state: DragState | null = null
	return {
		get active() {
			return state !== null
		},
		begin(clientY, t) {
			const o = get()
			o.onGrab()
			// Start from the live on-screen value so grabbing mid-spring never jumps.
			state = { originClientY: clientY, originY: o.y.get(), samples: [{ y: clientY, t }] }
		},
		move(clientY, t) {
			if (!state) return
			const o = get()
			state = { ...state, samples: [...state.samples.slice(-(MAX_SAMPLES - 1)), { y: clientY, t }] }
			o.y.set(dragPosition(state.originY, clientY - state.originClientY, o.topRest, o.dimension))
		},
		end(t) {
			if (!state) return
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
}

function bindContent(el: HTMLElement, controller: DragController, get: () => GestureOptions): () => void {
	let startY = 0
	const onStart = (e: TouchEvent) => {
		startY = e.touches[0]?.clientY ?? 0
	}
	const onMove = (e: TouchEvent) => {
		const touch = e.touches[0]
		const o = get()
		if (!touch || !o.enabled) return
		if (!controller.active) {
			const dy = touch.clientY - startY
			const pullDown = dy > HYSTERESIS_PX && el.scrollTop <= 0
			const pullUp = dy < -HYSTERESIS_PX && o.canExpand
			if (!pullDown && !pullUp) return
			controller.begin(touch.clientY, e.timeStamp)
		}
		if (e.cancelable) e.preventDefault()
		controller.move(touch.clientY, e.timeStamp)
	}
	const onEnd = (e: TouchEvent) => controller.end(e.timeStamp)
	el.addEventListener("touchstart", onStart, { passive: true })
	el.addEventListener("touchmove", onMove, { passive: false })
	el.addEventListener("touchend", onEnd)
	el.addEventListener("touchcancel", onEnd)
	return () => {
		el.removeEventListener("touchstart", onStart)
		el.removeEventListener("touchmove", onMove)
		el.removeEventListener("touchend", onEnd)
		el.removeEventListener("touchcancel", onEnd)
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

	return useMemo<HeaderHandlers>(
		() => ({
			onPointerDown(e) {
				if (!optsRef.current.enabled || (e.target as HTMLElement).closest("button")) return
				e.currentTarget.setPointerCapture(e.pointerId)
				controller.begin(e.clientY, e.timeStamp)
			},
			onPointerMove(e) {
				controller.move(e.clientY, e.timeStamp)
			},
			onPointerUp(e) {
				controller.end(e.timeStamp)
			},
			onPointerCancel(e) {
				controller.end(e.timeStamp)
			},
		}),
		[controller],
	)
}
