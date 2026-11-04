"use client"

import { useEffect, useState } from "react"
import type { ChatListItem } from "@/src/core"
import { useReducedMotion } from "../reduced-motion.tsx"
import { LearnView } from "./learn-view.tsx"
import { deviceZoneChange, resolveTimeZone, tzCookie } from "./time-zone.ts"
import { useChatList } from "./use-chat-list.ts"

const CLOCK_TICK_MS = 60_000

interface Props {
	readonly initialChats: readonly ChatListItem[]
	// Injected for tests and screenshots; defaults to the wall clock.
	readonly now?: number
	// From the lh_tz cookie on the server; the first render on both sides uses it.
	readonly timeZone?: string
}

export function LearnScreen({ initialChats, now, timeZone }: Props) {
	const list = useChatList(initialChats)
	const reduced = useReducedMotion()
	// Starts at the server-provided instant so hydration matches, then follows the wall clock.
	const [clock, setClock] = useState(() => now ?? Date.now())
	useEffect(() => {
		setClock(Date.now())
		const timer = setInterval(() => setClock(Date.now()), CLOCK_TICK_MS)
		return () => clearInterval(timer)
	}, [list.chats])
	const [zone, setZone] = useState(() => resolveTimeZone(timeZone))
	// After mount, adopt the device zone and remember it for the next server render.
	useEffect(() => {
		const device = Intl.DateTimeFormat().resolvedOptions().timeZone
		const next = deviceZoneChange(zone, device)
		if (next === null) return
		const cookie = tzCookie(next)
		if (cookie) document.cookie = cookie
		setZone(next)
	}, [zone])
	return (
		<LearnView
			chats={list.chats}
			online={list.online}
			hasList={list.hasList}
			now={clock}
			timeZone={zone}
			freshIds={list.freshIds}
			reduced={reduced}
			onRetry={list.refresh}
		/>
	)
}
