import React from "react"
;(globalThis as Record<string, unknown>).React = React

import assert from "node:assert/strict"
import { describe, it } from "node:test"
import { renderToStaticMarkup } from "react-dom/server"
import type { ChatListItem } from "@/src/core"
import { ServerEventsProvider, type NotifySource } from "../components/server-events.tsx"
import { LearnScreen } from "../components/mobile/learn/learn-screen.tsx"
import { TZ_COOKIE, deviceZoneChange, resolveTimeZone, tzCookie } from "../components/mobile/learn/time-zone.ts"

// 10:00Z and 20:00Z on the same UTC day: one day apart in Auckland (UTC+13).
const NOW = Date.UTC(2026, 10, 3, 20, 0, 0)
const inert: () => NotifySource = () => ({ close() {}, onOpen() {}, onEvent() {} })

function chat(id: string): ChatListItem {
	return {
		id,
		title: `Title ${id}`,
		createdAt: "2026-11-03T10:00:00Z",
		updatedAt: "2026-11-03T10:00:00Z",
		kind: "teach",
		messageCount: 2,
		phase: "teach",
		pendingQuestion: false,
		pendingProblem: false,
		busy: false,
		compacting: false,
	}
}

const render = (timeZone?: string) =>
	renderToStaticMarkup(
		<ServerEventsProvider connect={inert}>
			<LearnScreen initialChats={[chat("a")]} now={NOW} timeZone={timeZone} />
		</ServerEventsProvider>,
	)

describe("learn time zone", () => {
	it("server and first client render use the same timezone", () => {
		const auckland = render("Pacific/Auckland")
		assert.match(auckland, /This week/, "the passed zone decides the grouping, not the process zone")
		assert.equal(render("Pacific/Auckland"), auckland)
		assert.match(render("UTC"), /Today/)
	})

	it("a missing tz cookie falls back to UTC on both sides", () => {
		assert.equal(resolveTimeZone(undefined), "UTC")
		assert.equal(resolveTimeZone(""), "UTC")
		assert.equal(resolveTimeZone("Not/AZone"), "UTC")
		assert.equal(resolveTimeZone("Pacific/Auckland"), "Pacific/Auckland")
		assert.equal(render(undefined), render("UTC"))
	})

	it("the device zone replaces the cookie zone only when valid and different", () => {
		assert.equal(deviceZoneChange("UTC", "Europe/Paris"), "Europe/Paris")
		assert.equal(deviceZoneChange("Europe/Paris", "Europe/Paris"), null)
		assert.equal(deviceZoneChange("UTC", "nonsense"), null)
		assert.equal(deviceZoneChange("UTC", undefined), null)
	})

	it("the cookie is lax, root-scoped, 400 days and carries only a valid zone", () => {
		const c = tzCookie("Europe/Paris")
		assert.ok(c?.startsWith(`${TZ_COOKIE}=Europe%2FParis`))
		assert.match(c ?? "", /Path=\//)
		assert.match(c ?? "", /SameSite=Lax/)
		assert.match(c ?? "", /Max-Age=34560000/)
		assert.equal(tzCookie("bad zone;"), null)
	})
})
