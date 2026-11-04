import type { ChatListItem } from "@/src/core"
import { z } from "zod"

export type SectionId = "today" | "week" | "earlier"

export interface Section {
	readonly id: SectionId
	readonly label: string
	readonly chats: readonly ChatListItem[]
}

export type FetchResult = { readonly ok: true; readonly chats: readonly ChatListItem[] } | { readonly ok: false }

export interface ListState {
	readonly chats: readonly ChatListItem[]
	readonly online: boolean
	// True once any list (even an empty one) was seen; drives offline vs empty.
	readonly hasList: boolean
}

export type OnlineEffect = "hostOffline" | "hostOnline" | null

const SECTION_LABELS: Readonly<Record<SectionId, string>> = Object.freeze({
	today: "Today",
	week: "This week",
	earlier: "Earlier",
})
const SECTION_ORDER = Object.freeze(["today", "week", "earlier"] as const)
const WEEK_DAYS = 7
const MS_PER_MINUTE = 60_000
const MS_PER_HOUR = 3_600_000
const MONTHS = Object.freeze(["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"])

function safeFormatter(timeZone: string | undefined, options: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
	try {
		return new Intl.DateTimeFormat("en-US", { ...options, timeZone })
	} catch {
		return new Intl.DateTimeFormat("en-US", options)
	}
}

// Calendar day number (days since epoch) of an instant in the given zone.
function dayNumber(ms: number, timeZone: string | undefined): number {
	const parts = safeFormatter(timeZone, { year: "numeric", month: "numeric", day: "numeric" }).formatToParts(ms)
	const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value)
	return Math.floor(Date.UTC(pick("year"), pick("month") - 1, pick("day")) / 86_400_000)
}

function sectionFor(updatedMs: number, now: number, timeZone: string | undefined): SectionId {
	if (!Number.isFinite(updatedMs)) return "earlier"
	const age = dayNumber(now, timeZone) - dayNumber(updatedMs, timeZone)
	if (age <= 0) return "today"
	return age < WEEK_DAYS ? "week" : "earlier"
}

export function groupSessions(
	chats: readonly ChatListItem[],
	now: number,
	timeZone?: string,
): readonly Section[] {
	const ordered = [...chats].sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))
	const buckets: Record<SectionId, ChatListItem[]> = { today: [], week: [], earlier: [] }
	for (const c of ordered) buckets[sectionFor(Date.parse(c.updatedAt), now, timeZone)].push(c)
	return SECTION_ORDER.filter((id) => buckets[id].length > 0).map((id) =>
		Object.freeze({ id, label: SECTION_LABELS[id], chats: Object.freeze(buckets[id]) }),
	)
}

export function relativeTime(iso: string, now: number, timeZone?: string): string {
	const ms = Date.parse(iso)
	if (!Number.isFinite(ms)) return ""
	const diff = now - ms
	if (diff < MS_PER_MINUTE) return "now"
	const age = dayNumber(now, timeZone) - dayNumber(ms, timeZone)
	if (age <= 0) {
		return diff < MS_PER_HOUR
			? `${Math.floor(diff / MS_PER_MINUTE)} min`
			: `${Math.floor(diff / MS_PER_HOUR)} h`
	}
	if (age === 1) return "Yesterday"
	if (age < WEEK_DAYS) return safeFormatter(timeZone, { weekday: "short" }).format(ms)
	const parts = safeFormatter(timeZone, { month: "numeric", day: "numeric" }).formatToParts(ms)
	const day = parts.find((p) => p.type === "day")?.value ?? ""
	const month = MONTHS[Number(parts.find((p) => p.type === "month")?.value) - 1] ?? ""
	return `${day} ${month}`
}

const chatItemSchema = z.object({
	id: z.string().min(1),
	title: z.string(),
	createdAt: z.string(),
	updatedAt: z.string(),
	kind: z.enum(["teach", "practice"]).catch("teach"),
	messageCount: z.number().catch(0),
	phase: z.enum(["probe", "plan", "teach"]).catch("probe"),
	pendingQuestion: z.boolean().catch(false),
	pendingProblem: z.boolean().catch(false),
	busy: z.boolean().catch(false),
	compacting: z.boolean().catch(false),
})

const chatListSchema = z.object({ chats: z.array(chatItemSchema) })

// Unknown fields (settings, anything new) are stripped by the schema.
export function parseChatList(json: unknown): ChatListItem[] | null {
	const parsed = chatListSchema.safeParse(json)
	return parsed.success ? parsed.data.chats : null
}

export function nextOnlineState(
	prev: ListState,
	result: FetchResult,
): { readonly state: ListState; readonly effect: OnlineEffect } {
	if (!result.ok) {
		return {
			state: { ...prev, online: false },
			effect: prev.online ? "hostOffline" : null,
		}
	}
	return {
		state: { chats: result.chats, online: true, hasList: true },
		effect: prev.online ? null : "hostOnline",
	}
}

// Rows that appeared since the previous list; an empty previous list is a first load, not news.
export function newIds(prev: readonly ChatListItem[], next: readonly ChatListItem[]): ReadonlySet<string> {
	if (prev.length === 0) return new Set()
	const known = new Set(prev.map((c) => c.id))
	return new Set(next.filter((c) => !known.has(c.id)).map((c) => c.id))
}
