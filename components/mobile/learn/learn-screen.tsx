"use client"

import { useEffect, useState } from "react"
import type { ChatListItem } from "@/src/core"
import { useReducedMotion } from "../reduced-motion.tsx"
import { LearnView } from "./learn-view.tsx"
import { useChatList } from "./use-chat-list.ts"

const CLOCK_TICK_MS = 60_000

interface Props {
	readonly initialChats: readonly ChatListItem[]
	// Injected for tests and screenshots; defaults to the wall clock.
	readonly now?: number
}

export function LearnScreen({ initialChats, now }: Props) {
	const list = useChatList(initialChats)
	const reduced = useReducedMotion()
	// Starts at the server-provided instant so hydration matches, then follows the wall clock.
	const [clock, setClock] = useState(() => now ?? Date.now())
	useEffect(() => {
		setClock(Date.now())
		const timer = setInterval(() => setClock(Date.now()), CLOCK_TICK_MS)
		return () => clearInterval(timer)
	}, [list.chats])
	return (
		<LearnView
			chats={list.chats}
			online={list.online}
			hasList={list.hasList}
			now={clock}
			freshIds={list.freshIds}
			reduced={reduced}
			onRetry={list.refresh}
		/>
	)
}
