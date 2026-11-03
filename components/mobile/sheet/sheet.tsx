"use client"

import { motion } from "motion/react"
import { Dialog } from "radix-ui"
import { type ReactNode, useRef } from "react"
import { type HapticsAdapter, navigatorVibrateAdapter } from "../haptics.ts"
import { useReducedMotion } from "../reduced-motion.tsx"
import { useSheetGesture } from "./sheet-gesture.ts"
import { useSheetMotion } from "./sheet-motion.ts"
import type { Detent } from "./sheet-physics.ts"

export type { Detent } from "./sheet-physics.ts"

export interface SheetProps {
	readonly open: boolean
	readonly onOpenChange: (open: boolean) => void
	/** Required: it is the dialog's accessible name. */
	readonly title: string
	readonly description?: string
	readonly detents?: readonly Detent[]
	readonly children?: ReactNode
	/** Test seam: false renders inline (a Portal renders nothing on the server). */
	readonly portal?: boolean
	/** Test seam: overrides the system reduced-motion preference. */
	readonly reducedMotion?: boolean
	readonly haptics?: HapticsAdapter
}

const DEFAULT_DETENTS: readonly Detent[] = ["large"]
const SAFE_TOP = "var(--lh-m-safe-top, env(safe-area-inset-top, 0px))"
const SAFE_BOTTOM = "var(--lh-m-safe-bottom, env(safe-area-inset-bottom, 0px))"
const HIT = 44

export function Sheet({
	open,
	onOpenChange,
	title,
	description,
	detents = DEFAULT_DETENTS,
	children,
	portal = true,
	reducedMotion,
	haptics = navigatorVibrateAdapter,
}: SheetProps) {
	const systemReduced = useReducedMotion()
	const reduced = reducedMotion ?? systemReduced
	const panelRef = useRef<HTMLDivElement>(null)
	const contentRef = useRef<HTMLDivElement>(null)
	const m = useSheetMotion({ open, reduced, detents, haptics, onOpenChange, panelRef })
	const handlers = useSheetGesture(
		{
			y: m.y,
			enabled: open && !reduced && m.height > 0,
			topRest: m.rest(m.topDetent),
			dimension: m.height,
			currentRest: m.rest(m.detent),
			canExpand: m.detent !== m.topDetent,
			onGrab: m.onGrab,
			onRelease: m.onRelease,
		},
		contentRef,
		m.visible,
	)

	const layer = (
		<div data-lh-mobile="sheet">
			<Dialog.Overlay asChild forceMount>
				<motion.div
					className="lh-m-scrim fixed inset-0"
					// The shared scrim class has a CSS opacity transition; the drag drives opacity per frame.
					style={{ transition: "none", opacity: reduced ? undefined : m.overlayOpacity }}
				/>
			</Dialog.Overlay>
			<Dialog.Content
				asChild
				forceMount
				{...(description ? {} : { "aria-describedby": undefined })}
			>
				<motion.div
					ref={panelRef}
					className="lh-m-glass fixed inset-x-0 bottom-0 flex flex-col overflow-hidden rounded-t-[var(--lh-m-radius-sheet,16px)] border-t text-foreground outline-none"
					style={{ top: `calc(${SAFE_TOP} + 12px)`, y: reduced ? undefined : m.y }}
				>
					<div className="shrink-0 select-none" style={{ touchAction: "none" }} {...handlers}>
						{reduced ? null : (
							<div data-sheet-grabber="" aria-hidden="true" className="flex items-center justify-center" style={{ minHeight: HIT }}>
								<span className="h-1 w-9 rounded-full bg-current opacity-30" />
							</div>
						)}
						<div className={`flex items-center gap-2 px-4 pb-2 ${reduced ? "pt-2" : ""}`}>
							<div className="min-w-0 flex-1">
								<Dialog.Title className="text-[17px] font-semibold leading-snug">{title}</Dialog.Title>
								{description ? (
									<Dialog.Description className="text-[13px] leading-snug opacity-70">{description}</Dialog.Description>
								) : null}
							</div>
							<Dialog.Close
								className="shrink-0 rounded-[var(--lh-m-radius-control,12px)] px-3 text-[15px] font-medium"
								style={{ minWidth: HIT, minHeight: HIT }}
							>
								Close
							</Dialog.Close>
						</div>
					</div>
					<div
						ref={contentRef}
						className="min-h-0 flex-1 overscroll-contain px-4"
						style={{
							overflowY: m.detent === m.topDetent ? "auto" : "hidden",
							paddingBottom: `calc(${SAFE_BOTTOM} + 16px)`,
						}}
					>
						{children}
					</div>
				</motion.div>
			</Dialog.Content>
		</div>
	)

	return (
		<Dialog.Root open={open} onOpenChange={onOpenChange}>
			{portal ? <Dialog.Portal forceMount>{m.visible ? layer : null}</Dialog.Portal> : m.visible ? layer : null}
		</Dialog.Root>
	)
}
