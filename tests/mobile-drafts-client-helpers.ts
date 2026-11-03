import type { SendOptions } from "../components/mobile/drafts/draft-sync.ts";
import type { WireDraft } from "../components/mobile/drafts/draft-wire.ts";

interface Timer {
	readonly id: number;
	readonly at: number;
	readonly fn: () => void;
}

export function fakeClock(start = Date.parse("2026-03-01T12:00:00.000Z")) {
	let time = start;
	let nextId = 1;
	let timers: readonly Timer[] = [];
	return {
		now: (): number => time,
		setTimer: (fn: () => void, ms: number): unknown => {
			const id = nextId++;
			timers = [...timers, { id, at: time + ms, fn }];
			return id;
		},
		clearTimer: (handle: unknown): void => {
			timers = timers.filter((t) => t.id !== handle);
		},
		pending: (): number => timers.length,
		advance(ms: number): void {
			const target = time + ms;
			for (;;) {
				const due = [...timers].filter((t) => t.at <= target).sort((a, b) => a.at - b.at)[0];
				if (!due) break;
				timers = timers.filter((t) => t.id !== due.id);
				time = due.at;
				due.fn();
			}
			time = target;
		},
	};
}

export interface SentCall {
	readonly body: WireDraft;
	readonly options: SendOptions;
}
export function recorder(results: readonly boolean[] = []) {
	const calls: SentCall[] = [];
	return {
		calls,
		send: async (body: WireDraft, options: SendOptions): Promise<boolean> => {
			calls.push({ body, options });
			return results[calls.length - 1] ?? true;
		},
	};
}
