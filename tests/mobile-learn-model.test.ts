import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { ChatListItem } from "@/src/core"
import {
	groupSessions,
	nextOnlineState,
	parseChatList,
	relativeTime,
	type ListState,
} from "../components/mobile/learn/learn-model.ts"

// Tue 3 Nov 2026 12:00 UTC.
const NOW = Date.UTC(2026, 10, 3, 12, 0, 0)

function chat(id: string, updatedAt: string, extra: Partial<ChatListItem> = {}): ChatListItem {
	return {
		id,
		title: id,
		createdAt: updatedAt,
		updatedAt,
		kind: "teach",
		messageCount: 2,
		phase: "teach",
		pendingQuestion: false,
		pendingProblem: false,
		busy: false,
		compacting: false,
		...extra,
	}
}

const ids = (cs: readonly ChatListItem[]) => cs.map((c) => c.id)

describe("learn model: groupSessions", () => {
	it("groups sessions into Today, This week and Earlier in the device timezone", () => {
		const sections = groupSessions(
			[
				chat("a", "2026-11-03T08:00:00Z"),
				chat("b", "2026-10-30T08:00:00Z"),
				chat("c", "2026-10-01T08:00:00Z"),
			],
			NOW,
			"UTC",
		)
		assert.deepEqual(
			sections.map((s) => [s.label, ids(s.chats)]),
			[
				["Today", ["a"]],
				["This week", ["b"]],
				["Earlier", ["c"]],
			],
		)
	})

	it("a session from 23:30 yesterday is not Today across a timezone boundary", () => {
		const c = chat("x", "2026-11-02T23:30:00Z")
		// Now is 00:30 on 3 Nov in UTC: 23:30 UTC is yesterday there.
		const now = Date.UTC(2026, 10, 3, 0, 30, 0)
		assert.equal(groupSessions([c], now, "UTC")[0]?.label, "This week")
		// In Tokyo (UTC+9) both instants are on 3 Nov: Today.
		assert.equal(groupSessions([c], now, "Asia/Tokyo")[0]?.label, "Today")
		// In Los Angeles both are on 2 Nov: Today.
		assert.equal(groupSessions([c], now, "America/Los_Angeles")[0]?.label, "Today")
	})

	it("empty sections are not rendered", () => {
		const sections = groupSessions([chat("c", "2026-09-01T08:00:00Z")], NOW, "UTC")
		assert.deepEqual(sections.map((s) => s.id), ["earlier"])
		assert.deepEqual(groupSessions([], NOW, "UTC"), [])
	})

	it("rows are newest first inside a section", () => {
		const input = [
			chat("old", "2026-11-03T01:00:00Z"),
			chat("new", "2026-11-03T11:00:00Z"),
			chat("mid", "2026-11-03T06:00:00Z"),
		]
		const before = ids(input)
		const sections = groupSessions(input, NOW, "UTC")
		assert.deepEqual(ids(sections[0]?.chats ?? []), ["new", "mid", "old"])
		assert.deepEqual(ids(input), before)
	})
})

describe("learn model: relativeTime", () => {
	const t = (iso: string) => relativeTime(iso, NOW, "UTC")
	it("relativeTime covers now, minutes, hours, yesterday, weekday and date", () => {
		assert.equal(t("2026-11-03T11:59:40Z"), "now")
		assert.equal(t("2026-11-03T11:55:00Z"), "5 min")
		assert.equal(t("2026-11-03T09:00:00Z"), "3 h")
		assert.equal(t("2026-11-02T20:00:00Z"), "Yesterday")
		assert.equal(t("2026-11-02T01:00:00Z"), "Yesterday")
		assert.equal(t("2026-11-01T10:00:00Z"), "Sun")
		assert.equal(t("2026-10-12T10:00:00Z"), "12 Oct")
	})

	it("treats future and invalid timestamps safely", () => {
		assert.equal(t("2026-11-03T12:05:00Z"), "now")
		assert.equal(t("not a date"), "")
	})
})

describe("learn model: parseChatList", () => {
	it("parseChatList rejects a malformed response and keeps unknown fields out", () => {
		assert.equal(parseChatList(null), null)
		assert.equal(parseChatList({}), null)
		assert.equal(parseChatList({ chats: "nope" }), null)
		assert.equal(parseChatList({ chats: [{ id: 1 }] }), null)
		const parsed = parseChatList({
			chats: [{ ...chat("a", "2026-11-03T08:00:00Z"), secret: "x", settings: { model: {} } }],
		})
		assert.ok(parsed)
		assert.equal(parsed.length, 1)
		assert.equal("secret" in (parsed[0] ?? {}), false)
		assert.equal(parsed[0]?.id, "a")
	})

	it("fills defaults for fields older hosts omit", () => {
		const parsed = parseChatList({
			chats: [{ id: "a", title: "t", createdAt: "2026-11-03T08:00:00Z", updatedAt: "2026-11-03T08:00:00Z" }],
		})
		assert.equal(parsed?.[0]?.kind, "teach")
		assert.equal(parsed?.[0]?.busy, false)
		assert.equal(parsed?.[0]?.pendingQuestion, false)
	})
})

describe("learn model: nextOnlineState", () => {
	const good: ListState = { chats: [chat("a", "2026-11-03T08:00:00Z")], online: true, hasList: true }

	it("a failed refresh keeps the last good list and reports host offline", () => {
		const { state, effect } = nextOnlineState(good, { ok: false })
		assert.equal(state.chats, good.chats)
		assert.equal(state.online, false)
		assert.equal(state.hasList, true)
		assert.equal(effect, "hostOffline")
	})

	it("a recovered refresh reports host online once", () => {
		const down = nextOnlineState(good, { ok: false }).state
		const up = nextOnlineState(down, { ok: true, chats: [] })
		assert.equal(up.effect, "hostOnline")
		assert.equal(up.state.online, true)
		assert.deepEqual(up.state.chats, [])
		assert.equal(nextOnlineState(up.state, { ok: true, chats: [] }).effect, null)
	})

	it("repeated failures report offline once", () => {
		const down = nextOnlineState(good, { ok: false })
		assert.equal(nextOnlineState(down.state, { ok: false }).effect, null)
	})

	it("never having a list is tracked", () => {
		const start: ListState = { chats: [], online: true, hasList: false }
		assert.equal(nextOnlineState(start, { ok: false }).state.hasList, false)
		assert.equal(nextOnlineState(start, { ok: true, chats: [] }).state.hasList, true)
	})
})

describe("groupSessions week boundary", () => {
	it("a session 6 days back is This week and 7 days back is Earlier", () => {
		const six = chat("six", "2026-10-28T12:00:00.000Z")
		const seven = chat("seven", "2026-10-27T12:00:00.000Z")
		const sections = groupSessions([six, seven], NOW, "UTC")
		assert.deepEqual(
			sections.map((s) => [s.id, s.chats.map((c) => c.id)]),
			[["week", ["six"]], ["earlier", ["seven"]]],
		)
	})
})
