// The phone's reply box: a plain text reply for open questions, not the desktop composer.
// No model menu, steer, attachments or slash commands; iOS dictation works through the keyboard mic.

export const REPLY_MAX_CHARS = 10_000

export type BottomBar = "answer" | "reply"

export interface TextInput {
	readonly type: "text"
	readonly text: string
}

/** Resolves once the turn settles; calls onAccepted as soon as the server acknowledges the reply. */
export type SendText = (input: TextInput, onAccepted: () => void) => Promise<boolean>

export interface KeyLike {
	readonly key: string
	readonly shiftKey: boolean
	readonly isComposing: boolean
}

export function bottomBar({ hasPending }: { readonly hasPending: boolean }): BottomBar {
	return hasPending ? "answer" : "reply"
}

export function canSend(text: string, busy: boolean): boolean {
	const trimmed = text.trim()
	return !busy && trimmed.length > 0 && trimmed.length <= REPLY_MAX_CHARS
}

// Enter sends; Shift+Enter is a newline; an open composition (IME, dictation) is never cut off.
export function shouldSendOnKey(e: KeyLike): boolean {
	return e.key === "Enter" && !e.shiftKey && !e.isComposing
}

// onAccepted fires at the server's acknowledgement, so the box clears then rather than when the
// turn ends; the result is true only when the reply was accepted.
export async function sendReply(text: string, send: SendText, onAccepted: () => void = () => {}): Promise<boolean> {
	const trimmed = text.trim()
	if (!canSend(trimmed, false)) return false
	try {
		return await send({ type: "text", text: trimmed }, onAccepted)
	} catch {
		return false
	}
}
