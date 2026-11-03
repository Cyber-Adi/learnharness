import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { deleteDraft, loadDraft, putDraft, type FetchLike } from "../components/mobile/drafts/draft-client.ts";
import type { WireDraft } from "../components/mobile/drafts/draft-wire.ts";

const AT = "2026-03-01T12:00:00.000Z";
const server = (over: Record<string, unknown> = {}) => ({
	toolCallId: "call-1", text: "hello", confidence: 70, selection: { a: 1 }, clientUpdatedAt: AT, deviceLabel: "desktop", savedAt: AT, ...over,
});
const reply = (data: unknown, status = 200): Response => new Response(JSON.stringify({ ok: true, data }), { status });

describe("draft client (useDraftSync transport)", () => {
	it("the hook seeds initial and origin from a server draft for the same toolCallId", async () => {
		const urls: string[] = [];
		const f: FetchLike = async (u) => (urls.push(u), reply(server()));
		const out = await loadDraft(f, "chat-1", "call-1");
		assert.equal(urls[0], "/api/chats/chat-1/draft?toolCallId=call-1");
		assert.equal(out.origin, "desktop");
		assert.deepEqual(out.initial, { selection: { a: 1 }, confidenceIndex: 3, thinking: "hello" });
	});

	it("a server draft for another toolCallId is ignored", async () => {
		const out = await loadDraft(async () => reply(server({ toolCallId: "call-2" })), "chat-1", "call-1");
		assert.deepEqual(out, { initial: null, origin: null });
		const none = await loadDraft(async () => reply(null), "chat-1", "call-1");
		assert.deepEqual(none, { initial: null, origin: null });
	});

	it("a failed GET leaves initial null without throwing", async () => {
		const empty = { initial: null, origin: null };
		assert.deepEqual(await loadDraft(async () => { throw new Error("offline"); }, "c", "t"), empty);
		assert.deepEqual(await loadDraft(async () => new Response("nope", { status: 500 }), "c", "t"), empty);
		assert.deepEqual(await loadDraft(async () => reply({ garbage: true }), "c", "t"), empty);
		assert.deepEqual(await loadDraft(async () => new Response("not json"), "c", "t"), empty);
	});

	it("clear deletes the server draft", async () => {
		const seen: Array<[string, string | undefined]> = [];
		const f: FetchLike = async (u, init) => (seen.push([u, init?.method]), reply({ cleared: true }));
		assert.equal(await deleteDraft(f, "chat-1", "call 1"), true);
		assert.deepEqual(seen, [["/api/chats/chat-1/draft?toolCallId=call%201", "DELETE"]]);
		assert.equal(await deleteDraft(async () => { throw new Error("x"); }, "c", "t"), false);
	});

	it("putDraft sends a same-origin JSON PUT with keepalive and reports failure", async () => {
		let captured: RequestInit | undefined;
		let url = "";
		const body: WireDraft = { toolCallId: "call-1", text: "x", confidence: null, selection: null, clientUpdatedAt: AT, deviceLabel: "phone" };
		const f: FetchLike = async (u, init) => ((url = u), (captured = init), reply({ draft: server(), stale: false }));
		assert.equal(await putDraft(f, "chat-1", body, true), true);
		assert.equal(url, "/api/chats/chat-1/draft");
		assert.equal(captured?.method, "PUT");
		assert.equal(captured?.keepalive, true);
		assert.deepEqual(captured?.headers, { "content-type": "application/json" });
		assert.deepEqual(JSON.parse(String(captured?.body)), body);
		assert.equal(await putDraft(async () => new Response("{}", { status: 400 }), "c", body, false), false);
		assert.equal(await putDraft(async () => { throw new Error("x"); }, "c", body, false), false);
	});
});
