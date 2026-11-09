"use client"

import { useCallback, useMemo, useState } from "react"
import { useChatSession } from "@/components/session"
import type { LhMessage } from "@/src/core"
import { notify } from "../toast/toast.ts"
import { toSubmitAnswerFn } from "./question-model.ts"
import { PendingSheet } from "./pending-sheet.tsx"
import { sendReply } from "./reply-model.ts"
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

export const REPLY_NOT_SENT = "Not sent. Your reply is still here."

type SessionOptions = Parameters<typeof useChatSession>[0]

const onReplyFailed = () => notify.error(REPLY_NOT_SENT)

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
	const send = session.send
	// Passing onAccepted (always defined) puts a refused reply on the opening-message path: its optimistic bubble is
	// removed, so the text lives only in the box (no phantom message, no double on resend).
	const onReply = useCallback((text: string, onAccepted: () => void) => sendReply(text, (input, accepted) => send(input, accepted), onAccepted), [send])
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
			onReply={onReply}
			onReplyFailed={onReplyFailed}
		>
			{pending ? <PendingSheet key={pending.key} chatId={chatId} pending={pending} open={open} onOpenChange={setSheetOpen} submitAnswer={submitAnswer} /> : null}
		</SessionView>
	)
}
