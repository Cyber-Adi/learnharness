import { fitWire, type WireDraft, type WireFields } from "./draft-wire.ts";

export type FlushReason = "idle" | "hidden" | "pagehide" | "send";
export interface SendOptions {
	readonly keepalive: boolean;
}
export interface DraftSyncDeps {
	readonly send: (body: WireDraft, options: SendOptions) => Promise<boolean>;
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

	const disarm = (): void => {
		if (timer !== null) deps.clearTimer(timer);
		timer = null;
	};

	async function run(keepalive: boolean): Promise<void> {
		disarm();
		if (latest === null) return;
		const key = keyOf(latest);
		if (key === sentKey || key === inFlightKey) return;
		inFlightKey = key;
		let delivered = false;
		try {
			delivered = await deps.send(fitWire(latest), { keepalive });
		} catch {
			delivered = false; // stays dirty; the next flush retries
		}
		if (inFlightKey === key) inFlightKey = null;
		if (delivered) sentKey = key;
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
		},
		dispose() {
			if (disposed) return;
			disarm();
			void run(true);
			disposed = true;
		},
	};
}
