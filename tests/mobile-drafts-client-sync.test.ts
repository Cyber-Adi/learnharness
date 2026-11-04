import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDraftSync, createSyncLifecycle } from "../components/mobile/drafts/draft-sync.ts";
import { DRAFT_MAX_BYTES, type WireFields } from "../components/mobile/drafts/draft-wire.ts";
import { fakeClock, recorder } from "./mobile-drafts-client-helpers.ts";

const fields = (text: string, over: Partial<WireFields> = {}): WireFields => ({
	toolCallId: "call-1",
	text,
	confidence: 50,
	selection: null,
	deviceLabel: "phone",
	...over,
});

function setup(results: readonly boolean[] = []) {
	const clock = fakeClock();
	const rec = recorder(results);
	const sync = createDraftSync({ send: rec.send, now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
	return { clock, rec, sync };
}

describe("draft sync scheduler (SYNC-4)", () => {
	it("typing does not send before 1 s of idle", () => {
		const { clock, rec, sync } = setup();
		sync.update(fields("a"));
		clock.advance(900);
		sync.update(fields("ab"));
		clock.advance(900);
		assert.equal(rec.calls.length, 0);
	});

	it("1 s after the last keystroke the draft is sent once", async () => {
		const { clock, rec, sync } = setup();
		sync.update(fields("a"));
		clock.advance(500);
		sync.update(fields("ab"));
		clock.advance(1000);
		await Promise.resolve();
		assert.equal(rec.calls.length, 1);
		assert.equal(rec.calls[0]?.body.text, "ab");
		assert.equal(rec.calls[0]?.options.keepalive, false);
	});

	it("an unchanged draft is not sent twice", async () => {
		const { clock, rec, sync } = setup();
		sync.update(fields("same"));
		clock.advance(1000);
		await sync.flush("idle");
		sync.update(fields("same"));
		clock.advance(1000);
		await sync.flush("hidden");
		assert.equal(rec.calls.length, 1);
	});

	it("hidden and pagehide flush immediately with keepalive", async () => {
		const { rec, sync } = setup();
		sync.update(fields("one"));
		await sync.flush("hidden");
		sync.update(fields("two"));
		await sync.flush("pagehide");
		assert.deepEqual(rec.calls.map((c) => [c.body.text, c.options.keepalive]), [["one", true], ["two", true]]);
	});

	it("send flushes with keepalive before the answer is posted", async () => {
		const { clock, rec, sync } = setup();
		sync.update(fields("final"));
		await sync.flush("send");
		assert.equal(rec.calls.length, 1);
		assert.equal(rec.calls[0]?.options.keepalive, true);
		assert.equal(clock.pending(), 0);
	});

	it("clientUpdatedAt is the time of the last edit, not the time of sending", async () => {
		const { clock, rec, sync } = setup();
		sync.update(fields("typed"));
		const editedAt = new Date(clock.now()).toISOString();
		clock.advance(5000);
		await sync.flush("hidden");
		assert.equal(rec.calls[0]?.body.clientUpdatedAt, editedAt);
	});

	it("an oversized thinking field is truncated to fit the 32 KB cap", async () => {
		const { rec, sync } = setup();
		sync.update(fields("€".repeat(15000)));
		await sync.flush("hidden");
		const body = rec.calls[0]?.body;
		assert.ok(body);
		assert.ok(Buffer.byteLength(JSON.stringify(body)) <= DRAFT_MAX_BYTES);
		assert.ok(body.text.length > 1000 && body.text.length < 15000);
		sync.update(fields("x".repeat(20000), { toolCallId: "call-2" }));
		await sync.flush("send");
		assert.ok((rec.calls[1]?.body.text.length ?? 99999) <= 16000);
	});

	it("a failed send keeps the draft dirty and the next flush retries", async () => {
		const { clock, rec, sync } = setup([false, true]);
		sync.update(fields("retry me"));
		clock.advance(1000);
		await Promise.resolve();
		assert.equal(rec.calls.length, 1);
		assert.equal(clock.pending(), 0, "no retry storm: no timer re-armed on failure");
		await sync.flush("hidden");
		assert.equal(rec.calls.length, 2);
		await sync.flush("hidden");
		assert.equal(rec.calls.length, 2);
	});

	it("a throwing send is treated as a failure", async () => {
		const clock = fakeClock();
		let attempts = 0;
		const sync = createDraftSync({
			send: async () => {
				attempts++;
				if (attempts === 1) throw new Error("offline");
				return true;
			},
			now: clock.now,
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer,
		});
		sync.update(fields("x"));
		await sync.flush("hidden");
		await sync.flush("hidden");
		assert.equal(attempts, 2);
	});

	it("dispose clears timers and flushes once if dirty", async () => {
		const { clock, rec, sync } = setup();
		sync.update(fields("bye"));
		sync.dispose();
		await Promise.resolve();
		assert.equal(clock.pending(), 0);
		assert.equal(rec.calls.length, 1);
		assert.equal(rec.calls[0]?.options.keepalive, true);
		sync.dispose();
		sync.update(fields("after"));
		clock.advance(2000);
		assert.equal(rec.calls.length, 1);
	});

	it("reset drops a dirty draft so clear cannot resurrect it", async () => {
		const { clock, rec, sync } = setup();
		sync.update(fields("gone"));
		sync.reset();
		await sync.flush("hidden");
		clock.advance(2000);
		assert.equal(rec.calls.length, 0);
	});
});

describe("draft sync stale and clear (G2)", () => {
	const stored = { initial: { selection: null, confidenceIndex: 2, thinking: "from desktop" }, origin: "desktop" } as const;

	it("a stale write adopts the stored draft instead of dropping silently", async () => {
		const clock = fakeClock();
		const adopted: unknown[] = [];
		const sync = createDraftSync({
			send: async () => ({ delivered: true, stale: true, stored }),
			now: clock.now,
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer,
			onStale: (s) => adopted.push(s),
		});
		sync.update(fields("older"));
		await sync.flush("hidden");
		assert.deepEqual(adopted, [stored]);
		await sync.flush("hidden");
		assert.equal(adopted.length, 1, "nothing stays dirty after a stale answer");
	});

	it("a PUT in flight when clear runs cannot leave a draft behind", async () => {
		const clock = fakeClock();
		const events: string[] = [];
		const adopted: unknown[] = [];
		let release: (v: boolean) => void = () => undefined;
		const sync = createDraftSync({
			send: () => {
				events.push("put-start");
				return new Promise<boolean>((resolve) => {
					release = (v) => {
						events.push("put-end");
						resolve(v);
					};
				});
			},
			now: clock.now,
			setTimer: clock.setTimer,
			clearTimer: clock.clearTimer,
			onStale: (s) => adopted.push(s),
		});
		sync.update(fields("typed"));
		void sync.flush("send");
		const cleared = sync.clear(async () => {
			events.push("delete");
			return true;
		});
		assert.equal(clock.pending(), 0, "idle timer cancelled");
		await Promise.resolve();
		assert.deepEqual(events, ["put-start"], "delete waits for the PUT");
		release(true);
		await cleared;
		assert.deepEqual(events, ["put-start", "put-end", "delete"]);
		await sync.flush("hidden");
		assert.equal(events.filter((e) => e === "put-start").length, 1, "nothing resurrected after clear");
		assert.equal(adopted.length, 0);
	});

	it("the hook keeps syncing after a StrictMode remount", async () => {
		const made: string[] = [];
		const life = createSyncLifecycle(() => {
			const id = `sync-${made.length + 1}`;
			made.push(id);
			const sent: string[] = [];
			const clock = fakeClock();
			const sync = createDraftSync({ send: async (b) => (sent.push(b.text), true), now: clock.now, setTimer: clock.setTimer, clearTimer: clock.clearTimer });
			return Object.assign(sync, { sent });
		});
		const detach1 = life.attach();
		detach1(); // StrictMode disposes the first effect run
		const detach2 = life.attach();
		life.update(fields("after remount"));
		await life.flush("hidden");
		assert.equal(made.length, 2, "a fresh scheduler per effect run");
		assert.equal((life.current() as unknown as { sent: string[] }).sent[0], "after remount");
		detach2();
		life.update(fields("ignored"));
		assert.equal(life.current(), null);
	});
});
