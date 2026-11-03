import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SessionModel } from "../components/session-core.ts";
import type { ChatInput } from "../src/core/input-events.ts";
import type { LhMessage } from "../src/core/native-messages.ts";
import { newAnswerResult } from "../src/core/native-messages.ts";

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const question = {
	id: "a1",
	role: "assistant",
	content: [{ type: "toolCall", id: "c1", name: "quiz", arguments: { question: "Q?" } }],
	stopReason: "toolUse",
	timestamp: 1,
} as unknown as LhMessage;
const canonicalResult = { ...newAnswerResult("c1", "quiz", { kind: "quiz", values: ["Mercury"] } as never), id: "canon-1" };
const answerInput: ChatInput = { type: "answer", toolCallId: "c1", answer: { kind: "quiz", values: ["Venus"] } as never };
const ALREADY = { ok: false, error: { code: "already_answered", message: "This question was already answered." }, canonical: canonicalResult };

interface Harness {
	readonly model: SessionModel;
	readonly posts: ChatInput[];
	readonly gets: () => number;
	readonly elsewhere: () => number;
}

function harness(record: () => Response | Promise<Response>): Harness {
	const posts: ChatInput[] = [];
	let gets = 0;
	let elsewhere = 0;
	const model = new SessionModel({
		chatId: "c",
		initialMessages: [question],
		pollMs: 1,
		waitMaxMs: 20,
		fetch: async (url, init) => {
			const u = String(url);
			if (u === "/api/chat") {
				const body = JSON.parse(String(init?.body)) as { input: ChatInput };
				posts.push(body.input);
				return body.input.type === "answer" ? json(409, ALREADY) : json(200, { ok: true });
			}
			if (u === "/api/chats/c") {
				gets++;
				return record();
			}
			if (u.endsWith("/stream")) return new Response("data: [DONE]\n\n", { status: 200 });
			return json(200, { turnInFlight: false });
		},
	});
	model.onAnsweredElsewhere = () => { elsewhere++; };
	return { model, posts, gets: () => gets, elsewhere: () => elsewhere };
}

const answeredRecord = () => json(200, { messages: [question, canonicalResult], turnInFlight: false });

describe("duplicate answer in SessionModel.send (SYNC-3)", () => {
	it("a duplicate answer does not show a turn-running error", async () => {
		const h = harness(answeredRecord);
		assert.equal(await h.model.send(answerInput), false);
		assert.equal(h.model.getState().error, null);
		assert.equal(h.model.status, "ready");
	});

	it("a duplicate answer adopts the canonical record", async () => {
		const h = harness(answeredRecord);
		await h.model.send(answerInput);
		const ids = h.model.getState().nativeMessages.map((m) => (m as { id?: string }).id);
		assert.deepEqual(ids, ["a1", "canon-1"]);
		assert.equal(h.gets(), 1);
	});

	it("a duplicate answer does not block automatic continuation", async () => {
		const h = harness(answeredRecord);
		await h.model.send(answerInput);
		await h.model.continueIfOwed([question, canonicalResult]);
		assert.deepEqual(h.posts.map((p) => p.type), ["answer", "continue"]);
	});

	it("a duplicate answer calls onAnsweredElsewhere", async () => {
		const h = harness(answeredRecord);
		await h.model.send(answerInput);
		assert.equal(h.elsewhere(), 1);
	});

	it("a duplicate answer with a failed refetch ends ready without an error", async () => {
		const h = harness(() => json(500, { error: "boom" }));
		assert.equal(await h.model.send(answerInput), false);
		assert.equal(h.model.getState().error, null);
		assert.equal(h.model.status, "ready");
		assert.equal(h.model.getState().nativeMessages.length, 1);
	});

	it("a duplicate answer while the canonical turn runs resumes the stream", async () => {
		const h = harness(() => json(200, { messages: [question, canonicalResult], turnInFlight: true }));
		await h.model.send(answerInput);
		assert.equal(h.model.getState().error, null);
		assert.equal(h.model.status, "ready");
	});
});
