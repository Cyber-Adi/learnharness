import React from "react"
;(globalThis as Record<string, unknown>).React = React

import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { ChatListItem } from "@/src/core"
import { LearnView, type LearnViewProps } from "../components/mobile/learn/learn-view.tsx"

const NOW = Date.UTC(2026, 10, 3, 12, 0, 0)

function chat(id: string, extra: Partial<ChatListItem> = {}): ChatListItem {
	return {
		id,
		title: `Title ${id}`,
		createdAt: "2026-11-03T08:00:00Z",
		updatedAt: "2026-11-03T08:00:00Z",
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

function render(chats: readonly ChatListItem[], extra: Partial<LearnViewProps> = {}): string {
	return renderToStaticMarkup(
		<LearnView chats={chats} online hasList now={NOW} timeZone="UTC" reduced {...extra} />,
	)
}

describe("learn view rows", () => {
	it("a pending question shows the Your turn pill", () => {
		assert.match(render([chat("a", { pendingQuestion: true })]), /Your turn/)
		assert.doesNotMatch(render([chat("a")]), /Your turn/)
	})

	it("a pending practice problem is also the learner's turn", () => {
		assert.match(render([chat("a", { kind: "practice", pendingProblem: true })]), /Your turn/)
	})

	it("a busy session shows Working", () => {
		assert.match(render([chat("a", { busy: true })]), /Working/)
		assert.doesNotMatch(render([chat("a")]), /Working/)
	})

	it("practice sessions are labelled Practice and still open /chat/<id>", () => {
		const html = render([chat("p1", { kind: "practice" }), chat("t1")])
		assert.equal(html.match(/Practice/g)?.length, 1)
		assert.match(html, /href="\/chat\/p1"/)
	})

	it("every row links to /chat/<id>", () => {
		const html = render([chat("one"), chat("two"), chat("a b")])
		assert.match(html, /href="\/chat\/one"/)
		assert.match(html, /href="\/chat\/two"/)
		assert.match(html, /href="\/chat\/a%20b"/)
		assert.equal(html.match(/<a /g)?.length, 3)
	})

	it("row hit area is at least 56px tall", () => {
		assert.match(render([chat("a")]), /<a [^>]*class="[^"]*\bmin-h-14\b[^"]*\bw-full\b|<a [^>]*class="[^"]*\bw-full\b[^"]*\bmin-h-14\b/)
	})

	it("shows title, relative time and sections", () => {
		const html = render([chat("a"), chat("b", { updatedAt: "2026-10-01T08:00:00Z" })])
		assert.match(html, /Title a/)
		assert.match(html, /4 h/)
		assert.match(html, /Today/)
		assert.match(html, /Earlier/)
		assert.doesNotMatch(html, /This week/)
		assert.match(html, /<h1[^>]*>Learn<\/h1>/)
	})
})

describe("learn view states", () => {
	it("never had a list and offline shows Host offline with Try again", () => {
		const html = render([], { online: false, hasList: false, onRetry: () => {} })
		assert.match(html, /Host offline/)
		assert.match(html, /Your host is not reachable\. Make sure it is running and connected to Tailscale\./)
		assert.match(html, /Try again/)
	})

	it("the Try again button renders only with a retry handler", () => {
		const html = render([], { online: false, hasList: false })
		assert.match(html, /Host offline/)
		assert.doesNotMatch(html, /Try again/)
	})

	it("offline with a last good list keeps the list", () => {
		const html = render([chat("a")], { online: false, hasList: true })
		assert.match(html, /Title a/)
		assert.doesNotMatch(html, /Host offline/)
	})

	it("zero sessions shows the empty state copy exactly", () => {
		const html = render([])
		assert.match(html, />No sessions yet</)
		assert.match(html, />Start a session on your desktop\. It will show up here\.</)
	})

	it("reduced motion renders no animation wrappers", () => {
		const fresh = new Set(["a"])
		const reduced = render([chat("a")], { reduced: true, freshIds: fresh })
		assert.doesNotMatch(reduced, /opacity:\s*0/)
		const animated = render([chat("a")], { reduced: false, freshIds: fresh })
		assert.match(animated, /opacity:\s*0/)
	})

	it("rows already on screen are not re-animated", () => {
		assert.doesNotMatch(render([chat("a")], { reduced: false, freshIds: new Set() }), /opacity:\s*0/)
	})
})
