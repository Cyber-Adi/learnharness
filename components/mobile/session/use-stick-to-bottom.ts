"use client"

import { useCallback, useLayoutEffect, useRef, useState } from "react"
import { stickToBottom } from "./session-logic.ts"

// Follow the stream unless the learner scrolled up; expose a way back.
export function useStickToBottom(changeKey: unknown) {
	const ref = useRef<HTMLDivElement>(null)
	const stuck = useRef(true)
	const [atBottom, setAtBottom] = useState(true)

	const onScroll = useCallback(() => {
		const el = ref.current
		if (!el) return
		stuck.current = stickToBottom(el.scrollTop, el.scrollHeight, el.clientHeight)
		setAtBottom(stuck.current)
	}, [])

	useLayoutEffect(() => {
		const el = ref.current
		if (el && stuck.current) el.scrollTop = el.scrollHeight
	}, [changeKey])

	const jump = useCallback(() => {
		const el = ref.current
		if (!el) return
		stuck.current = true
		el.scrollTop = el.scrollHeight
		setAtBottom(true)
	}, [])

	return { ref, onScroll, atBottom, jump }
}
