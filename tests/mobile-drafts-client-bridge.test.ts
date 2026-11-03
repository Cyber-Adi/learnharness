import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDesktopBridge } from "../components/mobile/drafts/desktop-bridge.ts";
import type { FetchLike } from "../components/mobile/drafts/draft-client.ts";
import { SessionModel } from "../components/session-core.ts";
import type { LhMessage } from "../src/core/native-messages.ts";
import type { QuestionDraft } from "../src/core/question-core.ts";
import { fakeClock } from "./mobile-drafts-client-helpers.ts";

const AT = "2026-03-01T12:00:00.000Z";
const question = {
	id: "a1", role: "assistant",
	content: [{ type: "toolCall", id: "c1", name: "quiz", arguments: { question: "Q?" } }],
	stopReason: "toolUse", timestamp: 1,
} as unknown as LhMessage;
const form: QuestionDraft = {
	form: { selection: { selected: new Set([1]), otherSelected: false, dontKnow: false }, thinking: "desk", other: "", text: "", confidenceIndex: 4 },
};
const stored = (deviceLabel: string) => ({ toolCallId: "c1", text: "from phone", confidence: 30, selection: null, clientUpdatedAt: AT, deviceLabel, savedAt: AT });

function setup(fetchFn: FetchLike) {
	const clock = fakeClock();
	const bridge = createDesktopBridge({ chatId: "chat-1", fetchFn, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
	const model = new SessionModel({ chatId: "chat-1", initialMessages: [question] });
	model.onQuestionDraft = bridge.onQuestionDraft;
	return { clock, bridge, model };
}

describe("desktop draft bridge (SYNC-4)", () => {
	it("the desktop bridge saves a desktop draft with deviceLabel desktop", async () => {
		const puts: Array<{ url: string; body: Record<string, unknown> }> = [];
		const f: FetchLike = async (url, init) => (puts.push({ url, body: JSON.parse(String(init?.body)) }), new Response(JSON.stringify({ ok: true, data: {} })));
		const { clock, model } = setup(f);
		model.saveQuestionDraft("c1", form);
		model.saveQuestionDraft("c1", { readingThinking: "r" });
		clock.advance(1000);
		await new Promise((r) => setImmediate(r));
		assert.equal(puts.length, 1);
		assert.equal(puts[0]?.body.deviceLabel, "desktop");
		assert.equal(puts[0]?.body.toolCallId, "c1");
		assert.equal(puts[0]?.body.text, "desk");
		assert.equal(puts[0]?.body.confidence, 90);
		assert.equal(model.questionDraft("c1")?.form?.thinking, "desk");
	});

	it("a draft for a key that is not the pending question is not synced", async () => {
		let calls = 0;
		const { clock, model } = setup(async () => (calls++, new Response("{}")));
		model.saveQuestionDraft("other", form);
		clock.advance(2000);
		await new Promise((r) => setImmediate(r));
		assert.equal(calls, 0);
	});

	it("a phone draft seeds the desktop dock when the desktop has none", async () => {
		const puts: string[] = [];
		const { clock, bridge, model } = setup(async (_u, init) => (init?.method === "PUT" && puts.push("put"), new Response(JSON.stringify({ ok: true, data: stored("phone") }))));
		const seeded = await bridge.seed({ key: "c1", toolCallId: "c1", get: (k) => model.questionDraft(k), save: (k, d) => model.saveQuestionDraft(k, d) });
		assert.equal(seeded, true);
		assert.equal(model.questionDraft("c1")?.form?.thinking, "from phone");
		assert.equal(model.questionDraft("c1")?.form?.confidenceIndex, 1);
		const again = await bridge.seed({ key: "c1", toolCallId: "c1", get: (k) => model.questionDraft(k), save: () => assert.fail("must not overwrite") });
		assert.equal(again, false);
		clock.advance(2000);
		await new Promise((r) => setImmediate(r));
		assert.deepEqual(puts, [], "seeding is not echoed back to the server");
	});

	it("a draft that came from the desktop never seeds the dock", async () => {
		const puts: string[] = [];
		const f: FetchLike = async (_u, init) => {
			if (init?.method === "PUT") puts.push("put");
			return new Response(JSON.stringify({ ok: true, data: stored("desktop") }));
		};
		const { clock, bridge, model } = setup(f);
		const seeded = await bridge.seed({ key: "c1", toolCallId: "c1", get: (k) => model.questionDraft(k), save: (k, d) => model.saveQuestionDraft(k, d) });
		assert.equal(seeded, false);
		assert.equal(model.questionDraft("c1"), undefined);
		clock.advance(2000);
		await new Promise((r) => setImmediate(r));
		assert.deepEqual(puts, []);
	});
});
