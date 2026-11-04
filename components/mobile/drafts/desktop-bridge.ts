import type { QuestionDraft } from "@/src/core";
import { deleteDraft, loadDraft, putDraft, type FetchLike } from "./draft-client.ts";
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
	clearDraft(toolCallId: string): Promise<void>;
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
	const touched = new Set<string>(); // calls the learner has edited since mount: never reseeded
	return {
		sync,
		onQuestionDraft(_key, toolCallId, draft) {
			if (seeding) return; // a phone draft landing in the dock is not a desktop edit
			touched.add(toolCallId);
			const sheet = fromDesktopDraft(draft);
			if (sheet) sync.update(toWireFields(sheet, toolCallId, "desktop"));
		},
		async seed(req) {
			if (req.get(req.key) || touched.has(req.toolCallId)) return false;
			const { initial, origin } = await loadDraft(deps.fetchFn, deps.chatId, req.toolCallId);
			if (initial === null || origin !== "phone" || req.get(req.key) || touched.has(req.toolCallId)) return false;
			seeding = true;
			try {
				req.save(req.key, toDesktopDraft(initial));
			} finally {
				seeding = false;
			}
			return true;
		},
		async clearDraft(toolCallId) {
			sync.reset();
			await deleteDraft(deps.fetchFn, deps.chatId, toolCallId);
		},
		flush: (reason) => void sync.flush(reason),
		dispose: () => sync.dispose(),
	};
}

/** The bridge runs only inside the mobile-shell build; flag-off desktops make no draft calls. */
export function desktopDraftSyncMode(flag: string | undefined): "desktop" | undefined {
	return flag === "1" ? "desktop" : undefined;
}
