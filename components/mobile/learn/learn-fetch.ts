import { parseChatList, type FetchResult } from "./learn-model.ts"

const FAILED: FetchResult = Object.freeze({ ok: false })

// Never throws: every failure mode collapses to { ok: false }.
export async function fetchChatList(fetchImpl: typeof fetch = fetch): Promise<FetchResult> {
	try {
		const res = await fetchImpl("/api/chats", { cache: "no-store" })
		if (!res.ok) return FAILED
		const chats = parseChatList(await res.json())
		return chats ? { ok: true, chats } : FAILED
	} catch {
		return FAILED
	}
}
