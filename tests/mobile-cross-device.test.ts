import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { SessionModel } from "../components/session-core.ts";
import {
	chatAsking, chatStore, drainTurn, engineAsking, factory, gradedAnswer, handleChatRequest, post, resultsFor,
} from "./mobile-answers-fixture.ts";

// Gate 1: two clients race answers against one host; the record keeps exactly
// one answer per toolCallId and every later attempt gets the canonical record.
const RUNS = 60;

/** Deterministic PRNG (mulberry32): the interleavings are seeded, never wall-clock. */
function rng(seed: number): () => number {
	let a = seed >>> 0;
	return () => {
		a = (a + 0x6d2b79f5) >>> 0;
		let t = a;
		t = Math.imul(t ^ (t >>> 15), t | 1);
		t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}
const pick = <T>(r: () => number, xs: readonly T[]): T => xs[Math.floor(r() * xs.length)]!;
async function yields(n: number): Promise<void> {
	for (let i = 0; i < n; i++) await Promise.resolve();
}

type Device = "desktop" | "phone";
interface Attempt { readonly device: Device; readonly callId: string; readonly value: string }
interface Outcome { readonly attempt: Attempt; readonly status: number; readonly body: Record<string, unknown> }

const VALUE: Record<Device, string> = { desktop: "Mercury", phone: "Venus" };

/** Fire attempts concurrently, each after a seeded number of microtask yields. */
async function race(engine: ReturnType<typeof engineAsking>, chatId: string, attempts: readonly Attempt[], r: () => number): Promise<Outcome[]> {
	const out = await Promise.all(
		attempts.map(async (attempt) => {
			await yields(Math.floor(r() * 12));
			const res = await handleChatRequest(
				post(chatId, { type: "answer", toolCallId: attempt.callId, answer: gradedAnswer(attempt.callId, [attempt.value]) }),
				factory(engine),
			);
			const body = res.headers.get("content-type")?.includes("json") ? ((await res.json()) as Record<string, unknown>) : {};
			return { attempt, status: res.status, body };
		}),
	);
	await drainTurn(chatId);
	return out;
}

/** The option values the stored result recorded. */
const chosen = (m: unknown): unknown =>
	((m as { details?: { answers?: Array<{ value: string }> } }).details?.answers ?? []).map((a) => a.value);
const canonicalOf = (chatId: string, callId: string) => JSON.parse(JSON.stringify(resultsFor(chatId, callId)[0]));
const codeOf = (o: Outcome): unknown => (o.body.error as { code?: unknown } | undefined)?.code;

function assertLaterAttemptsGetCanonical(chatId: string, callId: string, outcomes: readonly Outcome[]): void {
	for (const o of outcomes) {
		assert.equal(o.status, 409);
		assert.equal(codeOf(o), "already_answered");
		assert.deepEqual(o.body.canonical, canonicalOf(chatId, callId));
	}
}

describe("cross-device answers (gate 1)", () => {
	it("racing answers leave exactly one result per toolCallId over 50 seeded runs", async () => {
		for (let seed = 1; seed <= RUNS; seed++) {
			const r = rng(seed);
			const engine = engineAsking(["c1"]);
			const chat = await chatAsking(engine, `race ${seed}`);
			const devices: Device[] = r() < 0.5 ? ["desktop", "phone"] : ["phone", "desktop"];
			const attempts: Attempt[] = [...devices, pick(r, devices)].map((device) => ({ device, callId: "c1", value: VALUE[device] }));
			const outcomes = await race(engine, chat.id, attempts, r);

			const winners = outcomes.filter((o) => o.status === 200);
			assert.equal(winners.length, 1, `seed ${seed}: exactly one attempt wins`);
			assert.equal(resultsFor(chat.id, "c1").length, 1, `seed ${seed}: one result`);
			const stored = resultsFor(chat.id, "c1")[0]!;
			const win = winners[0]!.attempt;
			assert.deepEqual(chosen(stored), [win.value], `seed ${seed}: the winning answer is the stored one`);
			assertLaterAttemptsGetCanonical(chat.id, "c1", outcomes.filter((o) => o.status !== 200));

			// A late attempt from either device, after the turn finished.
			const late = await race(engine, chat.id, [{ device: "phone", callId: "c1", value: "Venus" }, { device: "desktop", callId: "c1", value: "Mercury" }], r);
			assertLaterAttemptsGetCanonical(chat.id, "c1", late);
			assert.equal(resultsFor(chat.id, "c1").length, 1);
		}
	});

	it("a retried answer after a dropped response gets the canonical record", async () => {
		for (let seed = 1; seed <= RUNS; seed++) {
			const r = rng(1000 + seed);
			const engine = engineAsking(["c1"]);
			const chat = await chatAsking(engine, `drop ${seed}`);
			const answer = gradedAnswer("c1", ["Mercury"]);
			const input = { type: "answer", toolCallId: "c1", answer } as const;

			// The request lands; its response never reaches the phone.
			const landed = await handleChatRequest(post(chat.id, input), factory(engine));
			assert.equal(landed.status, 200);
			if (r() < 0.5) await drainTurn(chat.id); // retry arrives mid-turn or after it

			// The phone retries through the real client loop against the real handler.
			let posts = 0;
			const phone = new SessionModel({
				chatId: chat.id, initialMessages: [], pollMs: 1, waitMaxMs: 20,
				fetch: async (url, init) => {
					if (String(url).startsWith("/api/jobs")) return Response.json({ turnInFlight: false });
					posts++;
					return handleChatRequest(new Request("http://test/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: String(init?.body) }), factory(engine));
				},
			});
			const retry = await phone.postInputEvent(input);
			await drainTurn(chat.id);
			assert.equal(posts, 1, `seed ${seed}: the loop did not hammer the host`);
			assert.equal(retry.status, 409);
			const body = (await retry.json()) as Record<string, unknown>;
			assert.equal((body.error as { code: string }).code, "already_answered");
			assert.deepEqual(body.canonical, canonicalOf(chat.id, "c1"));
			assert.equal(resultsFor(chat.id, "c1").length, 1);
			assert.deepEqual(chosen(resultsFor(chat.id, "c1")[0]), ["Mercury"]);
		}
	});

	it("parallel sibling questions answered from two devices are all kept", async () => {
		for (let seed = 1; seed <= RUNS; seed++) {
			const r = rng(5000 + seed);
			const engine = engineAsking(["c1", "c2"]);
			const chat = await chatAsking(engine, `siblings ${seed}`);
			const attempt = async (device: Device, callId: string) => {
				const res = await handleChatRequest(post(chat.id, { type: "answer", toolCallId: callId, answer: gradedAnswer(callId, [VALUE[device]]) }), factory(engine));
				const body = res.headers.get("content-type")?.includes("json") ? ((await res.json()) as Record<string, unknown>) : {};
				return { status: res.status, body };
			};

			// The phone sometimes jumps ahead to c2: refused (the dock is ordered), nothing stored, nothing lost.
			if (r() < 0.5) {
				const early = await attempt("phone", "c2");
				assert.equal(early.status, 400, `seed ${seed}: out-of-order answer is refused`);
				assert.equal(resultsFor(chat.id, "c2").length, 0);
			}
			const first = await attempt("desktop", "c1");
			assert.equal(first.status, 200);
			assert.equal(resultsFor(chat.id, "c1").length, 1);
			const second = await attempt("phone", "c2");
			assert.equal(second.status, 200);
			await drainTurn(chat.id);

			assert.deepEqual(chosen(resultsFor(chat.id, "c1")[0]), ["Mercury"]);
			assert.deepEqual(chosen(resultsFor(chat.id, "c2")[0]), ["Venus"]);
			const stray: Array<readonly [Device, string]> = [["phone", "c1"], ["desktop", "c2"], ["desktop", "c1"], ["phone", "c2"]];
			for (const [device, callId] of stray) {
				const dup = await attempt(device, callId);
				assert.equal(dup.status, 409);
				assert.equal((dup.body.error as { code: string }).code, "already_answered");
				assert.deepEqual(dup.body.canonical, canonicalOf(chat.id, callId));
			}
			const record = chatStore.getChat(chat.id)!.messages;
			assert.equal(record.filter((m) => m.role === "toolResult").length, 2, `seed ${seed}: both answers kept, none duplicated`);
		}
	});
});
