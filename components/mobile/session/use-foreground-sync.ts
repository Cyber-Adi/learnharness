"use client"

import { useEffect, useRef } from "react"
import type { LhMessage } from "@/src/core"
import { parseServerRecord } from "./server-record.ts"
import { fetchWithRetry, onForeground, shouldAdoptRecord } from "./session-logic.ts"

interface Options {
	readonly chatId: string
	/** The model's current messages, to spot an optimistic answer the server has not confirmed. */
	readonly getLocal: () => readonly LhMessage[]
	readonly setMessages: (record: LhMessage[], turnError?: string) => void
	readonly resumeStream: () => void
	readonly setReattachSettled: (fn: () => void) => void
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function fetchRecord(chatId: string) {
	try {
		const res = await fetch(`/api/chats/${encodeURIComponent(chatId)}`)
		return res.ok ? parseServerRecord(await res.json()) : null
	} catch {
		return null
	}
}

// iOS kills the SSE when the PWA backgrounds: on return, adopt the record and reattach if the turn is still running.
export function useForegroundSync(options: Options): void {
	const latest = useRef(options)
	latest.current = options
	const seq = useRef(0)

	useEffect(() => {
		const sync = async (visible: boolean) => {
			const mine = ++seq.current
			const { chatId } = latest.current
			const record = await fetchWithRetry(() => fetchRecord(chatId), sleep, () => mine === seq.current)
			if (mine !== seq.current) return // a newer sync owns the result
			const decision = onForeground({ visible, turnInFlight: record ? record.turnInFlight : null })
			if (!record || decision === "none") return
			if (!shouldAdoptRecord(latest.current.getLocal(), record.messages)) return // keep the optimistic answer until the server holds it
			latest.current.setMessages(record.messages, record.turnError)
			if (decision === "adopt-and-resume") latest.current.resumeStream()
		}
		const onVisibility = () => {
			if (document.visibilityState === "visible") void sync(true)
		}
		const onPageShow = (e: PageTransitionEvent) => {
			if (e.persisted) void sync(true)
		}
		const onOnline = () => {
			if (document.visibilityState === "visible") void sync(true)
		}
		window.addEventListener("online", onOnline)
		document.addEventListener("visibilitychange", onVisibility)
		window.addEventListener("pageshow", onPageShow)
		// Same seam chat.tsx uses: a reattached stream that settled means the record is current.
		latest.current.setReattachSettled(() => void sync(true))
		return () => {
			document.removeEventListener("visibilitychange", onVisibility)
			window.removeEventListener("pageshow", onPageShow)
			window.removeEventListener("online", onOnline)
		}
	}, [])
}
