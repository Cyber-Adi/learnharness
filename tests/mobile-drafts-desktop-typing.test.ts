import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDesktopBridge } from "../components/mobile/drafts/desktop-bridge.ts";
import { createDockDraftReporter } from "../components/mobile/drafts/dock-draft-reporter.ts";
import type { FetchLike } from "../components/mobile/drafts/draft-client.ts";
import { SessionModel } from "../components/session-core.ts";
import type { LhMessage } from "../src/core/native-messages.ts";
import type { QuestionFormDraft } from "../src/core/question-core.ts";
import { fakeClock } from "./mobile-drafts-client-helpers.ts";

const AT = "2026-03-01T12:00:00.000Z";
const question = {
	id: "a1", role: "assistant",
	content: [{ type: "toolCall", id: "c1", name: "quiz", arguments: { question: "Q?" } }],
	stopReason: "toolUse", timestamp: 1,
} as unknown as LhMessage;
const typed = (thinking: string): QuestionFormDraft => ({
	selection: { selected: new Set([1]), otherSelected: false, dontKnow: false }, thinking, other: "", text: "", confidenceIndex: 4,
});
const phoneDraft = { toolCallId: "c1", text: "from phone", confidence: 30, selection: null, clientUpdatedAt: AT, deviceLabel: "phone", savedAt: AT };

function setup(fetchFn: FetchLike) {
	const clock = fakeClock();
	const bridge = createDesktopBridge({ chatId: "chat-1", fetchFn, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
	const model = new SessionModel({ chatId: "chat-1", initialMessages: [question] });
	model.onQuestionDraft = bridge.onQuestionDraft;
	const seedReq = { key: "c1", toolCallId: "c1", get: (k: string) => model.questionDraft(k), save: (k: string, d: Parameters<SessionModel["saveQuestionDraft"]>[1]) => model.saveQuestionDraft(k, d) };
	return { clock, bridge, model, seedReq };
}
const flush = () => new Promise((r) => setImmediate(r));

describe("desktop dock typing (SYNC-4)", () => {
	it("typing in the desktop dock saves a draft before submit", async () => {
		const puts: Array<Record<string, unknown>> = [];
		const f: FetchLike = async (_u, init) => (puts.push(JSON.parse(String(init?.body))), new Response(JSON.stringify({ ok: true, data: {} })));
		const { clock, model } = setup(f);
		const reporter = createDockDraftReporter({ save: (form) => model.saveQuestionDraft("c1", { form }), setTimer: clock.setTimer, clearTimer: clock.clearTimer });
		reporter.report(typed("d"));
		assert.equal(model.questionDraft("c1")?.form?.thinking, "d", "the first edit is visible at once");
		reporter.report(typed("de"));
		reporter.report(typed("des"));
		assert.equal(model.questionDraft("c1")?.form?.thinking, "d", "later edits wait for the debounce");
		clock.advance(300);
		assert.equal(model.questionDraft("c1")?.form?.thinking, "des");
		clock.advance(1000);
		await flush();
		assert.equal(puts.length, 1);
		assert.equal(puts[0]?.text, "des");
	});

	it("a phone draft never replaces desktop typing", async () => {
		const f: FetchLike = async (_u, init) =>
			init?.method === "PUT" ? new Response(JSON.stringify({ ok: true, data: {} })) : new Response(JSON.stringify({ ok: true, data: phoneDraft }));
		const { bridge, model, seedReq } = setup(f);
		// The learner starts typing while the seed GET is in flight, then clears the field again.
		const pending = bridge.seed({ ...seedReq, get: () => undefined });
		model.saveQuestionDraft("c1", { form: typed("mine") });
		assert.equal(await pending, false);
		assert.equal(model.questionDraft("c1")?.form?.thinking, "mine");
		// Even an emptied draft entry means the dock was touched: no later seed.
		assert.equal(await bridge.seed({ ...seedReq, get: () => undefined }), false);
	});

	it("a phone draft seeds an untouched dock", async () => {
		const f: FetchLike = async () => new Response(JSON.stringify({ ok: true, data: phoneDraft }));
		const { bridge, model, seedReq } = setup(f);
		assert.equal(await bridge.seed(seedReq), true);
		assert.equal(model.questionDraft("c1")?.form?.thinking, "from phone");
	});
});
