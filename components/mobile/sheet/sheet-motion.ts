"use client"

import { animate, type AnimationPlaybackControls, type MotionValue, useMotionValue, useTransform } from "motion/react"
import { type RefObject, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react"
import { type HapticsAdapter, hapticFor } from "../haptics.ts"
import { SPRING, type SpringKind } from "../motion.ts"
import { type Detent, LARGE_TOP_INSET, detentTravel, releaseDecision } from "./sheet-physics.ts"

// Far below any viewport, so the first paint of a mounting sheet is off screen.
const OFFSCREEN_Y = 10000

export interface SheetMotionArgs {
	readonly open: boolean
	readonly reduced: boolean
	readonly detents: readonly Detent[]
	readonly haptics: HapticsAdapter
	readonly onOpenChange: (open: boolean) => void
	readonly panelRef: RefObject<HTMLElement | null>
}

export interface SheetMotion {
	readonly visible: boolean
	readonly y: MotionValue<number>
	readonly overlayOpacity: MotionValue<number>
	readonly detent: Detent
	readonly topDetent: Detent
	readonly height: number
	readonly rest: (d: Detent) => number
	readonly onGrab: () => void
	readonly onRelease: (r: { offsetY: number; velocityY: number }) => void
}

interface Geometry {
	readonly height: number
	readonly travel: number
}

function measure(el: HTMLElement | null): Geometry | null {
	if (!el) return null
	const vh = window.innerHeight
	const height = el.offsetHeight
	// The panel's top is pinned at safeTop + inset, so its height gives the safe inset.
	const safeTop = Math.max(0, vh - height - LARGE_TOP_INSET)
	return { height, travel: detentTravel(vh, safeTop) }
}

export function useSheetMotion(args: SheetMotionArgs): SheetMotion {
	const { open, reduced, detents, haptics, onOpenChange, panelRef } = args
	const hasMedium = detents.includes("medium")
	const initial: Detent = hasMedium ? "medium" : "large"
	const topDetent: Detent = detents.includes("large") || !hasMedium ? "large" : "medium"

	const [detent, setDetent] = useState<Detent>(initial)
	const [exiting, setExiting] = useState(false)
	const [geo, setGeo] = useState<Geometry>({ height: 0, travel: 0 })
	const y = useMotionValue(OFFSCREEN_Y)
	const controls = useRef<AnimationPlaybackControls | null>(null)
	const entered = useRef(false)
	const closeToken = useRef(0)
	const exitVelocity = useRef(0)
	const detentRef = useRef(detent)
	const heightRef = useRef(0)
	const visible = reduced ? open : open || exiting

	const overlayOpacity = useTransform(y, (v) => (heightRef.current > 0 ? Math.min(1, Math.max(0, 1 - v / heightRef.current)) : 1))
	const rest = useCallback((d: Detent) => (d === "large" ? 0 : geo.travel), [geo.travel])
	const play = useCallback(
		(target: number, kind: SpringKind, velocity = 0) => {
			controls.current?.stop()
			controls.current = animate(y, target, { ...SPRING[kind], velocity })
		},
		[y],
	)

	useEffect(() => {
		detentRef.current = detent
		heightRef.current = geo.height
	})

	useLayoutEffect(() => {
		if (!visible || reduced) return
		const update = () => {
			const next = measure(panelRef.current)
			if (next) setGeo((prev) => (prev.height === next.height && prev.travel === next.travel ? prev : next))
		}
		update()
		window.addEventListener("resize", update)
		return () => window.removeEventListener("resize", update)
	}, [visible, reduced, panelRef])

	useLayoutEffect(() => {
		if (!open || reduced || geo.height === 0) return
		closeToken.current += 1
		controls.current?.stop()
		if (entered.current) {
			y.set(rest(detentRef.current))
			return
		}
		entered.current = true
		y.set(geo.height)
		play(rest(detentRef.current), "sheet")
	}, [open, reduced, geo.height, rest, y, play])

	useEffect(() => {
		if (open || reduced || !entered.current) return
		entered.current = false
		const token = ++closeToken.current
		setExiting(true)
		controls.current?.stop()
		const run = animate(y, geo.height, { ...SPRING.sheet, velocity: exitVelocity.current })
		controls.current = run
		run.then(() => {
			if (closeToken.current !== token) return
			setExiting(false)
			setDetent(initial)
		})
	}, [open, reduced, geo.height, y, initial])

	const onGrab = useCallback(() => controls.current?.stop(), [])
	const onRelease = useCallback(
		({ offsetY, velocityY }: { offsetY: number; velocityY: number }) => {
			const d = releaseDecision({
				offsetY,
				velocityY,
				sheetHeight: geo.height,
				detents,
				current: detentRef.current,
				mediumOffset: geo.travel,
			})
			if (d.kind === "dismiss") {
				exitVelocity.current = velocityY
				onOpenChange(false)
				return
			}
			if (d.detent !== detentRef.current) {
				setDetent(d.detent)
				haptics.trigger(hapticFor("select"))
			}
			play(rest(d.detent), d.spring, velocityY)
		},
		[geo.height, geo.travel, detents, haptics, onOpenChange, play, rest],
	)

	return { visible, y, overlayOpacity, detent, topDetent, height: geo.height, rest, onGrab, onRelease }
}
