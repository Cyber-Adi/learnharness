import type { QuestionDraft } from "@/src/core";
import { loadDraft, putDraft, type FetchLike } from "./draft-client.ts";
import { createDraftSync, type DraftSync, type FlushReason } from "./draft-sync.ts";
import { fromDesktopDraft, toDesktopDraft, toWireFields } from "./draft-wire.ts";

export interface DesktopBridgeDeps {
	readonly chatId: string;
	readonly fetchFn: FetchLike;
	readonly now: () => number;
	readonly setTimer: (fn: () => void, ms: number) => unknown;
	readonly clearTimer: (handle: unknown) => void;
}
export interface SeedRequest {
	readonly key: string;
	readonly toolCallId: string;
	readonly get: (key: string) => QuestionDraft | undefined;
	readonly save: (key: string, draft: QuestionDraft) => void;
}
export interface DesktopBridge {
	readonly sync: DraftSync;
	onQuestionDraft(key: string, toolCallId: string, draft: QuestionDraft): void;
	seed(req: SeedRequest): Promise<boolean>;
	flush(reason: FlushReason): void;
	dispose(): void;
}

/** Desktop side of SYNC-4: pushes question drafts up, pulls a phone draft into the dock. */
export function createDesktopBridge(deps: DesktopBridgeDeps): DesktopBridge {
	const sync = createDraftSync({
		send: (body, options) => putDraft(deps.fetchFn, deps.chatId, body, options.keepalive),
		now: deps.now,
		setTimer: deps.setTimer,
		clearTimer: deps.clearTimer,
	});
	let seeding = false;
	return {
		sync,
		onQuestionDraft(_key, toolCallId, draft) {
			if (seeding) return; // a phone draft landing in the dock is not a desktop edit
			const sheet = fromDesktopDraft(draft);
			if (sheet) sync.update(toWireFields(sheet, toolCallId, "desktop"));
		},
		async seed(req) {
			if (req.get(req.key)) return false;
			const { initial, origin } = await loadDraft(deps.fetchFn, deps.chatId, req.toolCallId);
			if (initial === null || origin !== "phone" || req.get(req.key)) return false;
			seeding = true;
			try {
				req.save(req.key, toDesktopDraft(initial));
			} finally {
				seeding = false;
			}
			return true;
		},
		flush: (reason) => void sync.flush(reason),
		dispose: () => sync.dispose(),
	};
}
