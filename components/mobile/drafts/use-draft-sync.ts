"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { SheetDraft } from "../session/sheet-draft.ts";
import { deleteDraft, loadDraft, putDraftDetailed, type FetchLike, type LoadedDraft } from "./draft-client.ts";
import { createDraftSync, createSyncLifecycle, type FlushReason } from "./draft-sync.ts";
import { toWireFields, type DeviceLabel } from "./draft-wire.ts";

export interface UseDraftSyncOptions {
	readonly chatId: string;
	readonly toolCallId: string;
	readonly deviceLabel: DeviceLabel;
}
export interface DraftSyncApi {
	readonly initial: SheetDraft | null;
	readonly origin: DeviceLabel | null;
	/** Bumps each time the hook adopts a stored draft after load (a stale write lost to a newer copy). */
	readonly version: number;
	update(draft: SheetDraft): void;
	flush(reason: FlushReason): void;
	clear(): void;
}
interface Loaded {
	readonly key: string;
	readonly initial: SheetDraft | null;
	readonly origin: DeviceLabel | null;
	readonly version: number;
}

const sameOriginFetch: FetchLike = (input, init) => fetch(input, init);

export function useDraftSync({ chatId, toolCallId, deviceLabel }: UseDraftSyncOptions): DraftSyncApi {
	const key = `${chatId}\u0000${toolCallId}`;
	const [loaded, setLoaded] = useState<Loaded | null>(null);

	const adopt = useRef<(stored: LoadedDraft) => void>(() => undefined);
	adopt.current = (stored) => setLoaded((prev) => ({ key, ...stored, version: (prev?.key === key ? prev.version : 0) + 1 }));

	// The scheduler is created inside the effect so a StrictMode dispose/re-run never leaves a dead one.
	const life = useMemo(
		() =>
			createSyncLifecycle(() =>
				createDraftSync({
					send: (body, options) => putDraftDetailed(sameOriginFetch, chatId, body, options.keepalive),
					onStale: (stored) => adopt.current(stored),
					now: Date.now,
					setTimer: (fn, ms) => setTimeout(fn, ms),
					clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
				}),
			),
		[chatId, toolCallId],
	);

	useEffect(() => {
		let live = true;
		void loadDraft(sameOriginFetch, chatId, toolCallId).then((res) => {
			if (live) setLoaded((prev) => ({ key, ...res, version: prev?.key === key ? prev.version : 0 }));
		});
		return () => {
			live = false;
		};
	}, [chatId, toolCallId, key]);

	useEffect(() => {
		const detach = life.attach();
		const onHide = (): void => {
			if (document.visibilityState === "hidden") void life.flush("hidden");
		};
		const onPageHide = (): void => void life.flush("pagehide");
		document.addEventListener("visibilitychange", onHide);
		window.addEventListener("pagehide", onPageHide);
		return () => {
			document.removeEventListener("visibilitychange", onHide);
			window.removeEventListener("pagehide", onPageHide);
			detach();
		};
	}, [life]);

	const update = useCallback((draft: SheetDraft) => life.update(toWireFields(draft, toolCallId, deviceLabel)), [life, toolCallId, deviceLabel]);
	const flush = useCallback((reason: FlushReason) => void life.flush(reason), [life]);
	const clear = useCallback(() => {
		setLoaded((prev) => ({ key, initial: null, origin: null, version: prev?.key === key ? prev.version : 0 }));
		// Cancels the idle timer, waits out any in-flight PUT, then deletes, so no PUT lands after the DELETE.
		void life.clear(() => deleteDraft(sameOriginFetch, chatId, toolCallId));
	}, [life, key, chatId, toolCallId]);

	const current = loaded !== null && loaded.key === key ? loaded : null;
	return { initial: current?.initial ?? null, origin: current?.origin ?? null, version: current?.version ?? 0, update, flush, clear };
}
