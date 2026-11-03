import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { after, beforeEach, describe, it } from "node:test";
import { clearDraft, getDraft, saveDraft } from "../src/server/remote/drafts.ts";

const roots: string[] = [];
let dir = "";
beforeEach(() => {
	dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "lh-drafts-")), "drafts");
	roots.push(path.dirname(dir));
});
after(() => {
	for (const r of roots) fs.rmSync(r, { recursive: true, force: true });
});

const NOW = Date.parse("2026-03-01T12:00:00.000Z");
const now = () => NOW;
const draft = (over: Record<string, unknown> = {}) => ({
	toolCallId: "call-1",
	text: "my thinking",
	confidence: 70,
	selection: { values: ["Mercury"] },
	clientUpdatedAt: "2026-03-01T11:59:00.000Z",
	deviceLabel: "desktop",
	...over,
});

describe("draft store (SYNC-4)", () => {
	it("saveDraft stores and getDraft reads back a draft", () => {
		const res = saveDraft(dir, "chat-1", draft(), now);
		assert.ok(res.ok);
		assert.equal(res.stale, false);
		assert.equal(res.draft.savedAt, "2026-03-01T12:00:00.000Z");
		assert.deepEqual(getDraft(dir, "chat-1", "call-1"), res.draft);
		assert.equal(getDraft(dir, "chat-1", "call-1")?.deviceLabel, "desktop");
		assert.equal(fs.readdirSync(dir).join(), "chat-1.json", "no temp files left behind");
	});

	it("an older clientUpdatedAt loses to the stored draft and reports stale", () => {
		const first = saveDraft(dir, "chat-1", draft({ text: "newer", clientUpdatedAt: "2026-03-01T11:59:30.000Z" }), now);
		assert.ok(first.ok);
		const second = saveDraft(dir, "chat-1", draft({ text: "older", deviceLabel: "phone" }), now);
		assert.ok(second.ok);
		assert.equal(second.stale, true);
		assert.equal(second.draft.text, "newer");
		assert.equal(getDraft(dir, "chat-1", "call-1")?.text, "newer");
		const third = saveDraft(dir, "chat-1", draft({ text: "newest", clientUpdatedAt: "2026-03-01T11:59:59.000Z" }), now);
		assert.ok(third.ok && !third.stale);
		assert.equal(getDraft(dir, "chat-1", "call-1")?.text, "newest");
	});

	it("a draft for a new toolCallId replaces an older call's draft regardless of timestamp", () => {
		saveDraft(dir, "chat-1", draft({ clientUpdatedAt: "2026-03-01T11:59:50.000Z" }), now);
		const res = saveDraft(dir, "chat-1", draft({ toolCallId: "call-2" }), now);
		assert.ok(res.ok && !res.stale);
		assert.equal(getDraft(dir, "chat-1", "call-2")?.toolCallId, "call-2");
		assert.equal(getDraft(dir, "chat-1", "call-1"), null);
	});

	it("a draft for a different toolCallId reads as null", () => {
		saveDraft(dir, "chat-1", draft(), now);
		assert.equal(getDraft(dir, "chat-1", "call-other"), null);
		assert.equal(getDraft(dir, "chat-none", "call-1"), null);
	});

	it("a draft over 32 KB is rejected as invalid_input", () => {
		const big = draft({ text: "x".repeat(16000), selection: { blob: "y".repeat(20000) } });
		assert.deepEqual(saveDraft(dir, "chat-1", big, now), { ok: false, code: "invalid_input" });
		assert.equal(fs.existsSync(dir), false);
	});

	it("rejects out-of-contract bodies", () => {
		const bad: unknown[] = [
			draft({ text: "x".repeat(16001) }),
			draft({ confidence: 101 }),
			draft({ confidence: 1.5 }),
			draft({ clientUpdatedAt: "yesterday" }),
			draft({ deviceLabel: "tablet" }),
			draft({ extra: 1 }),
			draft({ selection: { blob: "y".repeat(9000) } }),
			null,
			"text",
		];
		for (const b of bad) assert.deepEqual(saveDraft(dir, "chat-1", b, now), { ok: false, code: "invalid_input" });
		assert.ok(saveDraft(dir, "chat-1", draft({ confidence: null, selection: null }), now).ok);
	});

	it("an invalid chat id is rejected before touching the filesystem", () => {
		for (const id of ["../evil", "a/b", "", "a.b", "x".repeat(0)]) {
			assert.deepEqual(saveDraft(dir, id, draft(), now), { ok: false, code: "invalid_input" });
			assert.equal(getDraft(dir, id, "call-1"), null);
			assert.equal(clearDraft(dir, id), false);
		}
		assert.equal(fs.existsSync(dir), false);
		assert.equal(fs.existsSync(path.join(path.dirname(dir), "evil.json")), false);
	});

	it("a corrupt stored file reads as no draft and is replaced by the next save", () => {
		fs.mkdirSync(dir, { recursive: true });
		fs.writeFileSync(path.join(dir, "chat-1.json"), "{not json");
		assert.equal(getDraft(dir, "chat-1", "call-1"), null);
		assert.ok(saveDraft(dir, "chat-1", draft(), now).ok);
	});

	it("clearDraft removes only that chat's draft", () => {
		saveDraft(dir, "chat-1", draft(), now);
		saveDraft(dir, "chat-2", draft(), now);
		assert.equal(clearDraft(dir, "chat-1"), true);
		assert.equal(getDraft(dir, "chat-1", "call-1"), null);
		assert.ok(getDraft(dir, "chat-2", "call-1"));
		assert.equal(clearDraft(dir, "chat-1"), false);
	});

	it("clearDraft with a toolCallId keeps a draft for a different call", () => {
		saveDraft(dir, "chat-1", draft(), now);
		assert.equal(clearDraft(dir, "chat-1", "call-other"), false);
		assert.ok(getDraft(dir, "chat-1", "call-1"));
		assert.equal(clearDraft(dir, "chat-1", "call-1"), true);
	});
});
