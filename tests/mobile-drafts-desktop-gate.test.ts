import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDesktopBridge, desktopDraftSyncMode } from "../components/mobile/drafts/desktop-bridge.ts";
import type { FetchLike } from "../components/mobile/drafts/draft-client.ts";
import { SessionModel } from "../components/session-core.ts";
import { newAnswerResult, type LhMessage } from "../src/core/native-messages.ts";
import { fakeClock } from "./mobile-drafts-client-helpers.ts";

const question = {
	id: "a1", role: "assistant",
	content: [{ type: "toolCall", id: "c1", name: "quiz", arguments: { question: "Q?" } }],
	stopReason: "toolUse", timestamp: 1,
} as unknown as LhMessage;
const answered = [question, newAnswerResult("c1", "quiz", { kind: "quiz", values: ["Venus"] })];
const form = { selection: { selected: new Set<number>(), otherSelected: false, dontKnow: false }, thinking: "t", other: "", text: "", confidenceIndex: 4 };

describe("desktop draft bridge gate (SYNC-4)", () => {
	it("with the shell flag off the desktop never calls the draft route", () => {
		assert.equal(desktopDraftSyncMode(undefined), undefined);
		assert.equal(desktopDraftSyncMode("0"), undefined);
		assert.equal(desktopDraftSyncMode(""), undefined);
		assert.equal(desktopDraftSyncMode("1"), "desktop");
	});

	it("saving a draft when no question is pending sends nothing", async () => {
		let calls = 0;
		const f: FetchLike = async () => (calls++, new Response("{}"));
		const clock = fakeClock();
		const bridge = createDesktopBridge({ chatId: "c", fetchFn: f, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
		const model = new SessionModel({ chatId: "c", initialMessages: answered });
		model.onQuestionDraft = bridge.onQuestionDraft;
		model.saveQuestionDraft("c1", { form });
		clock.advance(2000);
		await new Promise((r) => setImmediate(r));
		assert.equal(calls, 0);
	});

	it("an accepted desktop answer clears its server draft", async () => {
		const calls: Array<{ url: string; method?: string }> = [];
		const f: FetchLike = async (url, init) => (calls.push({ url, method: init?.method }), new Response(JSON.stringify({ ok: true, data: null })));
		const clock = fakeClock();
		const bridge = createDesktopBridge({ chatId: "chat 1", fetchFn: f, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
		await bridge.clearDraft("c1");
		assert.deepEqual(calls, [{ url: "/api/chats/chat%201/draft?toolCallId=c1", method: "DELETE" }]);
	});
});
