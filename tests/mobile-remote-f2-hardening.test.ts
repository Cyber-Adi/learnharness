// F2 review fixes: body caps, revoke race, shared pairing store, draft file hygiene (SR4,5,7,8,9).
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, beforeEach, test } from "node:test";
import { handleDraft } from "../src/server/remote/draft-handlers.ts";
import { createDevice, resolveDevice, revokeDevice } from "../src/server/remote/devices.ts";
import { handlePair } from "../src/server/remote/handlers.ts";
import { saveDraft } from "../src/server/remote/drafts.ts";

const roots: string[] = [];
const scratch = (): string => {
	const d = fs.mkdtempSync(path.join(os.tmpdir(), "lh-f2-"));
	roots.push(d);
	return d;
};
after(() => roots.forEach((r) => fs.rmSync(r, { recursive: true, force: true })));

interface Counted {
	readonly body: ReadableStream<Uint8Array>;
	readonly pulls: () => number;
}
/** A body that would be 1 MB if fully read, counting how many chunks were pulled. */
function bigBody(chunks = 1024): Counted {
	let n = 0;
	const body = new ReadableStream<Uint8Array>({
		pull(controller) {
			if (n >= chunks) return controller.close();
			n += 1;
			controller.enqueue(new Uint8Array(1024).fill(32));
		},
	});
	return { body, pulls: () => n };
}
const streamed = (url: string, method: string, c: Counted, headers: Record<string, string> = {}): Request =>
	new Request(url, { method, body: c.body, headers, duplex: "half" } as RequestInit);

test("an oversized pair body is refused without being read fully", async () => {
	const c = bigBody();
	const res = await handlePair(streamed("http://x/api/remote/pair", "POST", c));
	assert.equal(res.status, 400);
	assert.ok(c.pulls() < 16, `pulled ${c.pulls()} chunks`);
});

test("a pair body whose content-length exceeds the cap is refused unread", async () => {
	const c = bigBody();
	const res = await handlePair(streamed("http://x/api/remote/pair", "POST", c, { "content-length": "999999" }));
	assert.equal(res.status, 400);
	assert.ok(c.pulls() <= 1, "only the stream's eager first pull is allowed");
});

test("an oversized draft body is refused without being read fully", async () => {
	const c = bigBody();
	const res = await handleDraft(streamed("http://x/api/chats/c1/draft", "PUT", c), "c1", path.join(scratch(), "d"));
	assert.equal(res.status, 400);
	assert.ok(c.pulls() < 128, `pulled ${c.pulls()} chunks`);
});

test("a draft body whose content-length exceeds the cap is refused unread", async () => {
	const c = bigBody();
	const req = streamed("http://x/api/chats/c1/draft", "PUT", c, { "content-length": "999999" });
	const res = await handleDraft(req, "c1", path.join(scratch(), "d"));
	assert.equal(res.status, 400);
	assert.ok(c.pulls() <= 1, "only the stream's eager first pull is allowed");
});

test("a lastSeen update after revoke keeps the device revoked", () => {
	const file = path.join(scratch(), "devices.json");
	const t0 = Date.parse("2026-03-01T00:00:00.000Z");
	const d = createDevice(file, { name: "Phone", scopes: ["learn"] }, t0);
	const cookie = `${d.record.id}.${d.token}`;
	// The revoke lands between resolveDevice's read and its lastSeen write.
	assert.equal(resolveDevice(file, cookie, t0 + 1, () => revokeDevice(file, d.record.id, t0 + 2)), null);
	assert.equal(resolveDevice(file, cookie, t0 + 3), null);
	const stored = JSON.parse(fs.readFileSync(file, "utf8")) as { devices: { revokedAt?: string }[] };
	assert.ok(stored.devices[0]?.revokedAt);
});

test("two module instances share one pairing store", async () => {
	const dir = scratch();
	const prior = { h: process.env.LH_REMOTE_HOSTS, f: process.env.LH_REMOTE_DEVICES_FILE };
	process.env.LH_REMOTE_HOSTS = "my-mac.tailnet-1234.ts.net";
	process.env.LH_REMOTE_DEVICES_FILE = path.join(dir, "devices.json");
	try {
		type Handlers = typeof import("../src/server/remote/handlers.ts");
		// A cache-busting query loads a second, independent copy of the module.
		const load = (tag: string): Promise<Handlers> => import(`../src/server/remote/handlers.ts?instance=${tag}`) as Promise<Handlers>;
		const a = await load("a");
		const b = await load("b");
		assert.notEqual(a.handlePair, b.handlePair);
		const issued = (await (await a.handlePairingCode(new Request("http://x"))).json()) as { data: { code: string } };
		const res = await b.handlePair(
			new Request("http://x", { method: "POST", body: JSON.stringify({ code: issued.data.code, deviceName: "Phone" }) }),
		);
		assert.equal(res.status, 200);
	} finally {
		if (prior.h === undefined) delete process.env.LH_REMOTE_HOSTS; else process.env.LH_REMOTE_HOSTS = prior.h;
		if (prior.f === undefined) delete process.env.LH_REMOTE_DEVICES_FILE; else process.env.LH_REMOTE_DEVICES_FILE = prior.f;
	}
});

const draftInput = {
	toolCallId: "call-1",
	text: "t",
	confidence: 50,
	selection: null,
	clientUpdatedAt: "2026-03-01T11:59:00.000Z",
	deviceLabel: "phone",
};

test("a 200-char chat id is invalid_input, not internal", async () => {
	const dir = path.join(scratch(), "d");
	const id = "a".repeat(200);
	const req = new Request(`http://x/api/chats/${id}/draft`, { method: "PUT", body: JSON.stringify(draftInput) });
	const res = await handleDraft(req, id, dir);
	assert.equal(res.status, 400);
	const get = await handleDraft(new Request(`http://x/api/chats/${id}/draft?toolCallId=call-1`), id, dir);
	assert.equal(get.status, 400);
	assert.equal(saveDraft(dir, id, draftInput, () => 0).ok, false);
});

test("a 128-char chat id is still accepted", () => {
	const dir = path.join(scratch(), "d");
	assert.equal(saveDraft(dir, "a".repeat(128), draftInput, () => 0).ok, true);
});

test("draft files are written 0600 in a 0700 directory", () => {
	const dir = path.join(scratch(), "d");
	saveDraft(dir, "chat-1", draftInput, () => 0);
	assert.equal(fs.statSync(path.join(dir, "chat-1.json")).mode & 0o777, 0o600);
	assert.equal(fs.statSync(dir).mode & 0o777, 0o700);
});

let dir = "";
beforeEach(() => {
	dir = path.join(scratch(), "d");
});

test("a failed rename leaves no tmp file", () => {
	fs.mkdirSync(path.join(dir, "chat-1.json"), { recursive: true });
	assert.throws(() => saveDraft(dir, "chat-1", draftInput, () => 0));
	assert.deepEqual(fs.readdirSync(dir).filter((f) => f.endsWith(".tmp")), []);
});
