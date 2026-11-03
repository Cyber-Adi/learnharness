import React from "react"
;(globalThis as Record<string, unknown>).React = React

import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { ChatListItem } from "@/src/core"
import { ServerEventsProvider, type NotifySource } from "../components/server-events.tsx"
import { LearnScreen } from "../components/mobile/learn/learn-screen.tsx"

const NOW = Date.UTC(2026, 10, 3, 12, 0, 0)
const inert: () => NotifySource = () => ({ close() {}, onOpen() {}, onEvent() {} })

function chat(id: string): ChatListItem {
	return {
		id,
		title: `Title ${id}`,
		createdAt: "2026-11-03T08:00:00Z",
		updatedAt: "2026-11-03T08:00:00Z",
		kind: "teach",
		messageCount: 2,
		phase: "teach",
		pendingQuestion: true,
		pendingProblem: false,
		busy: false,
		compacting: false,
	}
}

describe("learn screen", () => {
	it("first paint renders the server list without a fetch", () => {
		const html = renderToStaticMarkup(
			<ServerEventsProvider connect={inert}>
				<LearnScreen initialChats={[chat("a")]} now={NOW} />
			</ServerEventsProvider>,
		)
		assert.match(html, /Title a/)
		assert.match(html, /href="\/chat\/a"/)
		assert.match(html, /Your turn/)
	})

	it("an empty server list renders the empty state, not offline", () => {
		const html = renderToStaticMarkup(
			<ServerEventsProvider connect={inert}>
				<LearnScreen initialChats={[]} now={NOW} />
			</ServerEventsProvider>,
		)
		assert.match(html, /No sessions yet/)
		assert.doesNotMatch(html, /Host offline/)
	})
})
