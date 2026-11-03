"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { SheetDraft } from "../session/sheet-draft.ts";
import { deleteDraft, loadDraft, putDraft, type FetchLike } from "./draft-client.ts";
import { createDraftSync, type FlushReason } from "./draft-sync.ts";
import { toWireFields, type DeviceLabel } from "./draft-wire.ts";

export interface UseDraftSyncOptions {
	readonly chatId: string;
	readonly toolCallId: string;
	readonly deviceLabel: DeviceLabel;
}
export interface DraftSyncApi {
	readonly initial: SheetDraft | null;
	readonly origin: DeviceLabel | null;
	update(draft: SheetDraft): void;
	flush(reason: FlushReason): void;
	clear(): void;
}
interface Loaded {
	readonly key: string;
	readonly initial: SheetDraft | null;
	readonly origin: DeviceLabel | null;
}

const sameOriginFetch: FetchLike = (input, init) => fetch(input, init);

export function useDraftSync({ chatId, toolCallId, deviceLabel }: UseDraftSyncOptions): DraftSyncApi {
	const key = `${chatId}\u0000${toolCallId}`;
	const [loaded, setLoaded] = useState<Loaded | null>(null);

	const sync = useMemo(
		() =>
			createDraftSync({
				send: (body, options) => putDraft(sameOriginFetch, chatId, body, options.keepalive),
				now: Date.now,
				setTimer: (fn, ms) => setTimeout(fn, ms),
				clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
			}),
		[chatId, toolCallId],
	);

	useEffect(() => {
		let live = true;
		void loadDraft(sameOriginFetch, chatId, toolCallId).then((res) => {
			if (live) setLoaded({ key, ...res });
		});
		return () => {
			live = false;
		};
	}, [chatId, toolCallId, key]);

	useEffect(() => {
		const onHide = (): void => {
			if (document.visibilityState === "hidden") void sync.flush("hidden");
		};
		const onPageHide = (): void => void sync.flush("pagehide");
		document.addEventListener("visibilitychange", onHide);
		window.addEventListener("pagehide", onPageHide);
		return () => {
			document.removeEventListener("visibilitychange", onHide);
			window.removeEventListener("pagehide", onPageHide);
			sync.dispose();
		};
	}, [sync]);

	const update = useCallback((draft: SheetDraft) => sync.update(toWireFields(draft, toolCallId, deviceLabel)), [sync, toolCallId, deviceLabel]);
	const flush = useCallback((reason: FlushReason) => void sync.flush(reason), [sync]);
	const clear = useCallback(() => {
		sync.reset();
		setLoaded({ key, initial: null, origin: null });
		void deleteDraft(sameOriginFetch, chatId, toolCallId);
	}, [sync, key, chatId, toolCallId]);

	const current = loaded !== null && loaded.key === key ? loaded : null;
	return { initial: current?.initial ?? null, origin: current?.origin ?? null, update, flush, clear };
}
