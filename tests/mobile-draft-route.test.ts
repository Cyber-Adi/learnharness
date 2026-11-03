import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, describe, it } from "node:test";

const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "lh-draft-route-"));
process.env.LH_DATA_DIR = path.join(scratch, "data");
const { GET, PUT, DELETE } = await import("../app/api/chats/[id]/draft/route.ts");
after(() => fs.rmSync(scratch, { recursive: true, force: true }));

const ctx = (id: string) => ({ params: Promise.resolve({ id }) });
const url = (q = "toolCallId=call-1") => `http://test/api/chats/chat-1/draft?${q}`;
const body = (over: Record<string, unknown> = {}) => ({
	toolCallId: "call-1",
	text: "private thinking",
	confidence: 50,
	selection: null,
	clientUpdatedAt: "2026-03-01T11:59:00.000Z",
	deviceLabel: "phone",
	...over,
});
const put = (b: unknown, id = "chat-1") =>
	PUT(new Request(url(""), { method: "PUT", body: typeof b === "string" ? b : JSON.stringify(b) }), ctx(id));

describe("draft route (SYNC-4)", () => {
	it("GET, PUT, DELETE round trip", async () => {
		const empty = await GET(new Request(url()), ctx("chat-1"));
		assert.deepEqual(await empty.json(), { ok: true, data: null });

		const saved = await put(body());
		assert.equal(saved.status, 200);
		assert.equal(saved.headers.get("cache-control"), "no-store");
		const savedJson = (await saved.json()) as { ok: true; data: { draft: { text: string; savedAt: string }; stale: boolean } };
		assert.equal(savedJson.data.stale, false);
		assert.equal(savedJson.data.draft.text, "private thinking");

		const read = (await (await GET(new Request(url()), ctx("chat-1"))).json()) as { data: { text: string } };
		assert.equal(read.data.text, "private thinking");
		const other = (await (await GET(new Request(url("toolCallId=other")), ctx("chat-1"))).json()) as { data: unknown };
		assert.equal(other.data, null);

		const stale = (await (await put(body({ text: "older", clientUpdatedAt: "2026-03-01T11:00:00.000Z" }))).json()) as {
			data: { stale: boolean; draft: { text: string } };
		};
		assert.equal(stale.data.stale, true);
		assert.equal(stale.data.draft.text, "private thinking");

		const del = await DELETE(new Request(url(), { method: "DELETE" }), ctx("chat-1"));
		assert.deepEqual(await del.json(), { ok: true, data: { cleared: true } });
		const after = (await (await GET(new Request(url()), ctx("chat-1"))).json()) as { data: unknown };
		assert.equal(after.data, null);
	});

	it("bad body returns invalid_input without echoing input", async () => {
		const secret = "hunter2-super-secret-draft";
		const cases: Array<Response> = [
			await put(body({ text: 123, extra: secret })),
			await put(`{"toolCallId": "${secret}"`),
			await put(body({ deviceLabel: secret })),
			await put(body(), "bad.id"),
			await put("x".repeat(70000)),
			await GET(new Request(url("")), ctx("chat-1")),
			await DELETE(new Request(url(""), { method: "DELETE" }), ctx("chat-1")),
			await GET(new Request(url(`toolCallId=${"z".repeat(300)}`)), ctx("chat-1")),
		];
		for (const res of cases) {
			assert.equal(res.status, 400);
			const text = await res.text();
			assert.ok(!text.includes(secret) && !text.includes("zzzz"));
			assert.deepEqual(JSON.parse(text), {
				ok: false,
				error: { code: "invalid_input", message: "The request was not valid." },
			});
		}
	});
});
