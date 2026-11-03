import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { LhMessage } from "../src/core/native-messages.ts";
import { newAnswerResult } from "../src/core/native-messages.ts";
import { answerOutcome } from "../src/server/remote/answers.ts";
import { SessionModel } from "../components/session-core.ts";
import { chatAsking, chatStore, engineAsking, gradedAnswer, post, factory, send, resultsFor, drainTurn, handleChatRequest } from "./mobile-answers-fixture.ts";

const asked = (...ids: string[]): LhMessage =>
	({
		id: "a1",
		role: "assistant",
		content: ids.map((id) => ({ type: "toolCall", id, name: "quiz", arguments: {} })),
		stopReason: "toolUse",
		timestamp: 1,
	}) as unknown as LhMessage;
const user = { id: "u1", role: "user", content: "hi", timestamp: 0 } as unknown as LhMessage;

describe("answerOutcome (SYNC-3)", () => {
	it("is pending for the dangling question", () => {
		assert.deepEqual(answerOutcome([user, asked("c1")], "c1"), { kind: "pending" });
	});

	it("is duplicate with the stored result for an answered call", () => {
		const result = newAnswerResult("c1", "quiz", { kind: "quiz", values: ["x"] });
		const out = answerOutcome([user, asked("c1"), result], "c1");
		assert.equal(out.kind, "duplicate");
		if (out.kind === "duplicate") assert.equal(out.result, result);
	});

	it("is unknown for an id never posed", () => {
		assert.deepEqual(answerOutcome([user, asked("c1")], "nope"), { kind: "unknown" });
	});

	it("keeps a sibling pending while its twin is answered", () => {
		const result = newAnswerResult("c1", "quiz", { kind: "quiz", values: ["x"] });
		const msgs = [user, asked("c1", "c2"), result];
		assert.equal(answerOutcome(msgs, "c1").kind, "duplicate");
		assert.equal(answerOutcome(msgs, "c2").kind, "pending");
	});
});

describe("handleChatRequest answer idempotency (SYNC-3)", () => {
	it("a second answer to the same question returns 409 already_answered with the canonical result", async () => {
		const engine = engineAsking(["c1"]);
		const chat = await chatAsking(engine, "dup");
		assert.equal((await send(engine, chat.id, { type: "answer", toolCallId: "c1", answer: gradedAnswer("c1") })).status, 200);
		const stored = resultsFor(chat.id, "c1");
		assert.equal(stored.length, 1);
		const res = await send(engine, chat.id, { type: "answer", toolCallId: "c1", answer: gradedAnswer("c1", ["Venus"]) });
		assert.equal(res.status, 409);
		assert.equal(res.headers.get("cache-control"), "no-store");
		const body = (await res.json()) as { ok: boolean; error: { code: string; message: string }; canonical: unknown };
		assert.equal(body.ok, false);
		assert.equal(body.error.code, "already_answered");
		assert.equal(body.error.message, "This question was already answered.");
		assert.deepEqual(body.canonical, JSON.parse(JSON.stringify(stored[0])));
		assert.equal(resultsFor(chat.id, "c1").length, 1);
	});

	it("an answer to an unknown toolCallId still returns 400 as before", async () => {
		const engine = engineAsking(["c1"]);
		const chat = await chatAsking(engine, "unknown");
		const res = await send(engine, chat.id, { type: "answer", toolCallId: "never-posed", answer: gradedAnswer("c1") });
		assert.equal(res.status, 400);
		assert.deepEqual(await res.json(), { error: "answer input targets no pending question call" });
	});

	it("a duplicate answer during a running turn gets already_answered", async () => {
		const engine = engineAsking(["c1"]);
		const chat = await chatAsking(engine, "running");
		const first = await send(engine, chat.id, { type: "answer", toolCallId: "c1", answer: gradedAnswer("c1") }, false);
		assert.equal(first.status, 200);
		// The reaction turn has not been drained: it is still registered as running.
		const dup = await send(engine, chat.id, { type: "answer", toolCallId: "c1", answer: gradedAnswer("c1", ["Venus"]) }, false);
		assert.equal(dup.status, 409);
		assert.equal(((await dup.json()) as { error: { code: string } }).error.code, "already_answered");
		// Control: a different input during the same running turn keeps the turn-running 409.
		const busy = await handleChatRequest(post(chat.id, { type: "text", text: "hello" }), factory(engine));
		assert.equal(busy.status, 409);
		assert.deepEqual(await busy.json(), { error: "A turn is already running for this session" });
		await drainTurn(chat.id);
		assert.equal(resultsFor(chat.id, "c1").length, 1);
		assert.ok(chatStore.getChat(chat.id));
	});
});

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

describe("session-core postInputEvent 409 handling", () => {
	const input = { type: "answer", toolCallId: "c1", answer: gradedAnswer("c1") } as const;

	it("the retry loop stops on already_answered", async () => {
		let posts = 0;
		const body = { ok: false, error: { code: "already_answered", message: "x" }, canonical: { id: "m" } };
		const model = new SessionModel({
			chatId: "c", initialMessages: [], pollMs: 1, waitMaxMs: 50,
			fetch: async (url) => {
				if (String(url).startsWith("/api/jobs")) return json(200, { turnInFlight: false });
				posts++;
				return json(409, body);
			},
		});
		const res = await model.postInputEvent(input);
		assert.equal(posts, 1);
		assert.equal(res.status, 409);
		assert.deepEqual(await res.json(), body);
	});

	it("the retry loop still retries a turn-running 409", async () => {
		let posts = 0;
		const model = new SessionModel({
			chatId: "c", initialMessages: [], pollMs: 1, waitMaxMs: 50,
			fetch: async (url) => {
				if (String(url).startsWith("/api/jobs")) return json(200, { turnInFlight: false });
				posts++;
				return posts < 3 ? json(409, { error: "A turn is already running for this session" }) : json(200, { ok: true });
			},
		});
		const res = await model.postInputEvent(input);
		assert.equal(posts, 3);
		assert.equal(res.status, 200);
	});
});

describe("handleChatRequest duplicate check ordering (SYNC-3)", () => {
	it("a duplicate answer gets already_answered even when no provider key is configured", async () => {
		const engine = engineAsking(["c1"]);
		const chat = await chatAsking(engine, "nokey");
		assert.equal((await send(engine, chat.id, { type: "answer", toolCallId: "c1", answer: gradedAnswer("c1") })).status, 200);
		const saved = process.env.OPENROUTER_API_KEY;
		delete process.env.OPENROUTER_API_KEY;
		try {
			const res = await send(engine, chat.id, { type: "answer", toolCallId: "c1", answer: gradedAnswer("c1", ["Venus"]) });
			assert.equal(res.status, 409);
			assert.equal(((await res.json()) as { error: { code: string } }).error.code, "already_answered");
		} finally {
			process.env.OPENROUTER_API_KEY = saved;
		}
	});
});
