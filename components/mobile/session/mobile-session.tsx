"use client"

import { useCallback, useMemo, useState } from "react"
import { useChatSession } from "@/components/session"
import type { LhMessage } from "@/src/core"
import { notify } from "../toast/toast.ts"
import { toSubmitAnswerFn } from "./question-model.ts"
import { PendingSheet } from "./pending-sheet.tsx"
import { makeAnsweredElsewhere, pendingFor } from "./session-logic.ts"
import type { SessionKind } from "./session-logic.ts"
import { SessionView } from "./session-view.tsx"
import { useForegroundSync } from "./use-foreground-sync.ts"
import { useStickToBottom } from "./use-stick-to-bottom.ts"

export interface MobileSessionProps {
	readonly chatId: string
	readonly title: string
	readonly kind?: SessionKind
	readonly initialMessages: LhMessage[]
	readonly initialError?: string
	readonly initiallyInFlight?: boolean
}

type SessionOptions = Parameters<typeof useChatSession>[0]

export function MobileSession({ chatId, title, kind, initialMessages, initialError, initiallyInFlight }: MobileSessionProps) {
	const [sheetOpen, setSheetOpen] = useState(false)
	const closeSheet = useCallback(() => setSheetOpen(false), [])
	const options: SessionOptions = {
		chatId,
		initialMessages,
		initialError,
		initiallyInFlight,
		onAnsweredElsewhere: useMemo(() => makeAnsweredElsewhere({ close: closeSheet, notifier: notify }), [closeSheet]),
	}
	const session = useChatSession(options)
	useForegroundSync({ chatId, getLocal: () => session.nativeMessages, setMessages: session.setMessages, resumeStream: session.resumeStream, setReattachSettled: session.setReattachSettled })

	const pending = pendingFor(session.messages, session.nativeMessages)
	const running = session.status === "submitted" || session.status === "streaming"
	const stick = useStickToBottom(session.messages)
	const submitAnswer = useMemo(() => toSubmitAnswerFn(session.submitAnswer), [session.submitAnswer])
	const open = sheetOpen && pending !== null

	return (
		<SessionView
			title={title}
			kind={kind}
			messages={session.messages}
			status={session.status}
			error={session.error ? "error" : null}
			hasPending={pending !== null && !running}
			turnRunning={running}
			onOpenAnswer={() => setSheetOpen(true)}
			scrollRef={stick.ref}
			onScroll={stick.onScroll}
			atBottom={stick.atBottom}
			onJumpLatest={stick.jump}
		>
			{pending ? <PendingSheet key={pending.key} chatId={chatId} pending={pending} open={open} onOpenChange={setSheetOpen} submitAnswer={submitAnswer} /> : null}
		</SessionView>
	)
}
