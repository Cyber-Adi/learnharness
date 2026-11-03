"use client"

import { type CSSProperties } from "react"
import { Toaster, type ToasterProps } from "sonner"
import type { FormFactor } from "../shell/form-factor.ts"

const SCOPE = "[[data-lh-mobile]_&]:"
const scoped = (classes: string): string =>
	classes
		.split(/\s+/)
		.filter(Boolean)
		.map((c) => `${SCOPE}${c}`)
		.join(" ")

// Sonner's own rules win the cascade, so every utility is important (trailing !).
// All of them sit under [data-lh-mobile]; Sonner is mounted inside the shell root.
export const toastClassNames = Object.freeze({
	toast: scoped("min-h-11! py-2! text-[15px]! duration-200! motion-reduce:transition-none! motion-reduce:animate-none!"),
	title: scoped("text-[15px]! font-medium! leading-snug!"),
	description: scoped("text-[13px]! leading-snug!"),
})

const OFFSET = "calc(var(--lh-m-safe-top, env(safe-area-inset-top, 0px)) + 8px)"

// Opaque surface tokens: no blur here, the sheet and tab bar own the two blur slots.
const TOASTER_STYLE = Object.freeze({
	"--normal-bg": "var(--lh-m-surface-raised)",
	"--normal-text": "var(--foreground)",
	"--normal-border": "var(--lh-m-hairline)",
	"--border-radius": "var(--lh-m-radius-control, 12px)",
} as CSSProperties)

export const TOASTER_PROPS = Object.freeze({
	position: "top-center",
	offset: OFFSET,
	mobileOffset: OFFSET,
	visibleToasts: 3,
	duration: 4000,
	theme: "system",
	closeButton: false,
	toastOptions: Object.freeze({ classNames: toastClassNames }),
	style: TOASTER_STYLE,
} as const satisfies ToasterProps)

interface Props {
	/** The shell mounts this only in the mobile tree; "desktop" renders nothing as a guard. */
	readonly formFactor?: FormFactor
}

export function MobileToaster({ formFactor = "mobile" }: Props) {
	if (formFactor === "desktop") return null
	return <Toaster {...TOASTER_PROPS} toastOptions={{ classNames: { ...toastClassNames } }} />
}
