"use client"

import { useCallback, useEffect, useRef, useState } from "react"
import type { ChatListItem } from "@/src/core"
import { useServerEvent, useServerResync } from "@/components/server-events"
import { notify } from "../toast/toast.ts"
import { fetchChatList } from "./learn-fetch.ts"
import { newIds, nextOnlineState, type ListState } from "./learn-model.ts"

export interface ChatListView extends ListState {
	readonly freshIds: ReadonlySet<string>
	readonly refresh: () => void
}

const NO_IDS: ReadonlySet<string> = new Set()

// Notify-then-fetch: events only trigger a refetch, their payloads are never read.
export function useChatList(initialChats: readonly ChatListItem[]): ChatListView {
	const [state, setState] = useState<ListState>({ chats: initialChats, online: true, hasList: initialChats.length > 0 })
	const [freshIds, setFreshIds] = useState<ReadonlySet<string>>(NO_IDS)
	const stateRef = useRef(state)
	const seq = useRef(0)

	const refresh = useCallback(() => {
		const mine = ++seq.current
		void fetchChatList().then((result) => {
			if (mine !== seq.current) return
			const { state: next, effect } = nextOnlineState(stateRef.current, result)
			if (result.ok) setFreshIds(newIds(stateRef.current.chats, result.chats))
			stateRef.current = next
			setState(next)
			if (effect === "hostOffline") notify.hostOffline()
			if (effect === "hostOnline") notify.hostOnline()
		})
	}, [])

	useEffect(
		() => () => {
			seq.current += 1
		},
		[],
	)

	useServerEvent("chats-changed", refresh)
	useServerEvent("turn-started", refresh)
	useServerEvent("turn-settled", refresh)
	useServerEvent("record-changed", refresh)
	useServerResync(refresh)

	return { ...state, freshIds, refresh }
}
