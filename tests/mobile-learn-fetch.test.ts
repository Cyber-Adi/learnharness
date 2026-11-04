import assert from "node:assert/strict"
import { describe, it } from "node:test"
import type { ChatListItem } from "@/src/core"
import { fetchChatList } from "../components/mobile/learn/learn-fetch.ts"
import { newIds } from "../components/mobile/learn/learn-model.ts"

const item = {
	id: "a",
	title: "t",
	createdAt: "2026-11-03T08:00:00Z",
	updatedAt: "2026-11-03T08:00:00Z",
}

function reply(body: unknown, status = 200): typeof fetch {
	return (async () => new Response(JSON.stringify(body), { status })) as typeof fetch
}

describe("learn fetch", () => {
	it("returns the parsed list on success", async () => {
		const r = await fetchChatList(reply({ chats: [item] }))
		assert.equal(r.ok, true)
		assert.equal(r.ok && r.chats[0]?.id, "a")
	})

	it("a network error is a failure, not a throw", async () => {
		const boom = (async () => {
			throw new TypeError("offline")
		}) as typeof fetch
		assert.deepEqual(await fetchChatList(boom), { ok: false })
	})

	it("a non-2xx response is a failure", async () => {
		assert.deepEqual(await fetchChatList(reply({ chats: [item] }, 503)), { ok: false })
	})

	it("a malformed body is a failure", async () => {
		assert.deepEqual(await fetchChatList(reply({ nope: 1 })), { ok: false })
	})

	it("a non-JSON body is a failure", async () => {
		const html = (async () => new Response("<html>", { status: 200 })) as typeof fetch
		assert.deepEqual(await fetchChatList(html), { ok: false })
	})

	it("requests the list without caching", async () => {
		let seen: RequestInit | undefined
		const spy = (async (_u: unknown, init?: RequestInit) => {
			seen = init
			return new Response(JSON.stringify({ chats: [] }))
		}) as typeof fetch
		await fetchChatList(spy)
		assert.equal(seen?.cache, "no-store")
	})
})

describe("learn newIds", () => {
	const mk = (id: string) => ({ ...item, id }) as unknown as ChatListItem
	it("returns only ids absent from the previous list", () => {
		assert.deepEqual([...newIds([mk("a")], [mk("a"), mk("b")])], ["b"])
	})
	it("returns nothing when there was no previous list", () => {
		assert.equal(newIds([], [mk("a")]).size, 0)
	})
})
