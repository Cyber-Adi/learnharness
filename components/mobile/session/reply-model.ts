// The phone's reply box: a plain text reply for open questions, not the desktop composer.
// No model menu, steer, attachments or slash commands; iOS dictation works through the keyboard mic.

export const REPLY_MAX_CHARS = 10_000

export type BottomBar = "answer" | "reply"

export interface TextInput {
	readonly type: "text"
	readonly text: string
}

export type SendText = (input: TextInput) => Promise<boolean>

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

// Resolves true only when the server accepted the reply, so the caller clears the box only then.
export async function sendReply(text: string, send: SendText): Promise<boolean> {
	const trimmed = text.trim()
	if (!canSend(trimmed, false)) return false
	try {
		return await send({ type: "text", text: trimmed })
	} catch {
		return false
	}
}
