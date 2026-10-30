"use client"

import { MotionConfig } from "motion/react"
import { type ReactNode, useSyncExternalStore } from "react"
import { SPRING, type SpringKind } from "./motion.ts"

const QUERY = "(prefers-reduced-motion: reduce)"

// null means matchMedia is unavailable: assume reduced until we know.
export function resolveReducedMotion(mql: { matches: boolean } | null): boolean {
	return mql === null ? true : mql.matches
}

function getMql(): MediaQueryList | null {
	return typeof window !== "undefined" && typeof window.matchMedia === "function"
		? window.matchMedia(QUERY)
		: null
}

function subscribe(onChange: () => void): () => void {
	const mql = getMql()
	if (!mql) return () => {}
	mql.addEventListener("change", onChange)
	return () => mql.removeEventListener("change", onChange)
}

export function useReducedMotion(): boolean {
	return useSyncExternalStore(
		subscribe,
		() => resolveReducedMotion(getMql()),
		() => true,
	)
}

export function motionTransition(kind: SpringKind, reduced: boolean) {
	return reduced ? ({ duration: 0 } as const) : SPRING[kind]
}

export function ReducedMotionRoot({ children }: { children: ReactNode }) {
	return <MotionConfig reducedMotion="user">{children}</MotionConfig>
}
