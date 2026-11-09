"use client"

import { type ChangeEvent, type KeyboardEvent, useCallback, useRef, useState } from "react"
import { REPLY_MAX_CHARS, canSend, shouldSendOnKey } from "./reply-model.ts"

export interface ReplyBarProps {
	/** A turn is running: the box stays editable, Send waits. */
	readonly busy: boolean
	/** Resolves true once the server accepted the reply. */
	readonly onSend: (text: string) => Promise<boolean>
	readonly onFailed?: () => void
}

const MAX_HEIGHT_PX = 160

// 17px keeps iOS from zooming on focus; autocorrect and spellcheck stay on so dictation reads cleanly.
export function ReplyBar({ busy, onSend, onFailed }: ReplyBarProps) {
	const [text, setText] = useState("")
	const [sending, setSending] = useState(false)
	const ref = useRef<HTMLTextAreaElement | null>(null)
	const ready = canSend(text, busy || sending)

	const grow = useCallback(() => {
		const el = ref.current
		if (!el) return
		el.style.height = "auto"
		el.style.height = `${Math.min(el.scrollHeight, MAX_HEIGHT_PX)}px`
	}, [])

	const submit = useCallback(async () => {
		if (!ready) return
		setSending(true)
		const accepted = await onSend(text)
		setSending(false)
		if (!accepted) {
			onFailed?.()
			return
		}
		setText("")
		requestAnimationFrame(grow)
	}, [ready, onSend, text, onFailed, grow])

	const onChange = (e: ChangeEvent<HTMLTextAreaElement>) => {
		setText(e.target.value)
		grow()
	}
	const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
		if (!shouldSendOnKey({ key: e.key, shiftKey: e.shiftKey, isComposing: e.nativeEvent.isComposing })) return
		e.preventDefault()
		void submit()
	}

	return (
		<form
			className="flex items-end gap-2"
			onSubmit={(e) => {
				e.preventDefault()
				void submit()
			}}
		>
			<textarea
				ref={ref}
				aria-label="Reply"
				placeholder="Reply"
				rows={1}
				value={text}
				maxLength={REPLY_MAX_CHARS}
				onChange={onChange}
				onKeyDown={onKeyDown}
				enterKeyHint="send"
				autoCapitalize="sentences"
				className="min-w-0 flex-1 resize-none rounded-[var(--lh-m-radius-control,12px)] border border-current/15 bg-transparent px-3 py-[11px] leading-[1.35] outline-none"
				style={{ fontSize: 17, minHeight: 44, maxHeight: MAX_HEIGHT_PX }}
			/>
			<button
				type="submit"
				disabled={!ready}
				className="shrink-0 rounded-[var(--lh-m-radius-control,12px)] bg-foreground px-4 text-[17px] font-semibold text-background disabled:opacity-40"
				style={{ minHeight: 44, minWidth: 44 }}
			>
				Send
			</button>
		</form>
	)
}
