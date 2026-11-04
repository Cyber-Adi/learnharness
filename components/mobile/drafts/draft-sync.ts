import type { LoadedDraft, PutResult } from "./draft-client.ts";
import { fitWire, type WireDraft, type WireFields } from "./draft-wire.ts";

export type FlushReason = "idle" | "hidden" | "pagehide" | "send";
export interface SendOptions {
	readonly keepalive: boolean;
}
export interface DraftSyncDeps {
	readonly send: (body: WireDraft, options: SendOptions) => Promise<boolean | PutResult>;
	/** The server held a newer draft; adopt it. Not called after reset or clear. */
	readonly onStale?: (stored: LoadedDraft) => void;
	readonly now: () => number;
	readonly setTimer: (fn: () => void, ms: number) => unknown;
	readonly clearTimer: (handle: unknown) => void;
	readonly idleMs?: number;
}
export interface DraftSync {
	update(draft: WireFields): void;
	flush(reason: FlushReason): Promise<void>;
	/** Forget the pending draft without sending (after the server copy is deleted). */
	reset(): void;
	/** Cancel pending work, wait for any in-flight PUT, then run `remove`. A late PUT result is ignored. */
	clear(remove: () => Promise<boolean>): Promise<boolean>;
	dispose(): void;
}

const keyOf = (f: WireFields): string => JSON.stringify([f.toolCallId, f.text, f.confidence, f.selection, f.deviceLabel]);

/** Debounced, change-aware draft sender. All effects injected; no globals. */
export function createDraftSync(deps: DraftSyncDeps): DraftSync {
	const idleMs = deps.idleMs ?? 1000;
	let latest: WireDraft | null = null;
	let sentKey: string | null = null;
	let inFlightKey: string | null = null;
	let timer: unknown = null;
	let disposed = false;
	let epoch = 0;
	let inFlight: Promise<void> | null = null;

	const disarm = (): void => {
		if (timer !== null) deps.clearTimer(timer);
		timer = null;
	};

	async function settle(key: string, body: WireDraft, keepalive: boolean, mine: number): Promise<void> {
		let res: PutResult = { delivered: false, stale: false, stored: null }; // failure stays dirty; the next flush retries
		try {
			const out = await deps.send(body, { keepalive });
			res = typeof out === "boolean" ? { delivered: out, stale: false, stored: null } : out;
		} catch {
			// keep the failed result
		}
		if (mine !== epoch) return; // reset or clear ran while this PUT was in flight
		inFlightKey = null;
		if (res.delivered) sentKey = key;
		if (res.delivered && res.stale && res.stored !== null) deps.onStale?.(res.stored);
	}

	function run(keepalive: boolean): Promise<void> {
		disarm();
		if (latest === null) return Promise.resolve();
		const key = keyOf(latest);
		if (key === sentKey || key === inFlightKey) return inFlight ?? Promise.resolve();
		inFlightKey = key;
		const task = settle(key, fitWire(latest), keepalive, epoch);
		inFlight = task;
		void task.then(() => {
			if (inFlight === task) inFlight = null;
		});
		return task;
	}

	return {
		update(draft) {
			if (disposed) return;
			latest = { ...draft, clientUpdatedAt: new Date(deps.now()).toISOString() };
			disarm();
			timer = deps.setTimer(() => void run(false), idleMs);
		},
		flush: (reason) => run(reason !== "idle"),
		reset() {
			disarm();
			latest = null;
			sentKey = null;
			inFlightKey = null;
			epoch += 1;
		},
		async clear(remove) {
			this.reset();
			const pending = inFlight;
			if (pending !== null) await pending;
			return remove();
		},
		dispose() {
			if (disposed) return;
			disarm();
			void run(true);
			disposed = true;
		},
	};
}

export interface SyncLifecycle<T extends DraftSync> {
	/** Create a scheduler for this effect run; the returned function disposes it. Safe to call again (StrictMode). */
	attach(): () => void;
	update(draft: WireFields): void;
	flush(reason: FlushReason): Promise<void>;
	clear(remove: () => Promise<boolean>): Promise<boolean>;
	current(): T | null;
}

/** The scheduler lives per effect run, so a StrictMode dispose/re-run gets a fresh, live one. */
export function createSyncLifecycle<T extends DraftSync>(make: () => T): SyncLifecycle<T> {
	let sync: T | null = null;
	return {
		attach() {
			const mine = make();
			sync = mine;
			return () => {
				mine.dispose();
				if (sync === mine) sync = null;
			};
		},
		update: (draft) => sync?.update(draft),
		flush: (reason) => sync?.flush(reason) ?? Promise.resolve(),
		clear: (remove) => sync?.clear(remove) ?? remove(),
		current: () => sync,
	};
}
