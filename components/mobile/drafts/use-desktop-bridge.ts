"use client";

import { pendingQuestionOf, type LhMessage } from "@/src/core";
import { useCallback, useEffect, useRef } from "react";
import type { SessionModel } from "@/components/session-core";
import { createDesktopBridge, type DesktopBridge } from "./desktop-bridge.ts";

/** SYNC-4 desktop side: push the dock's drafts to the server, pull a phone draft into the dock. */
export function useDesktopDraftBridge(model: SessionModel, chatId: string, messages: readonly LhMessage[], enabled: boolean, onSeeded: () => void): (toolCallId: string) => void {
	const bridgeRef = useRef<DesktopBridge | null>(null);
	const onSeededRef = useRef(onSeeded);
	onSeededRef.current = onSeeded;

	useEffect(() => {
		if (!enabled) return;
		const bridge = createDesktopBridge({
			chatId,
			fetchFn: (input, init) => fetch(input, init),
			now: Date.now,
			setTimer: (fn, ms) => setTimeout(fn, ms),
			clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
		});
		bridgeRef.current = bridge;
		model.onQuestionDraft = bridge.onQuestionDraft;
		const onHide = (): void => {
			if (document.visibilityState === "hidden") bridge.flush("hidden");
		};
		const onPageHide = (): void => bridge.flush("pagehide");
		document.addEventListener("visibilitychange", onHide);
		window.addEventListener("pagehide", onPageHide);
		return () => {
			document.removeEventListener("visibilitychange", onHide);
			window.removeEventListener("pagehide", onPageHide);
			model.onQuestionDraft = undefined;
			bridgeRef.current = null;
			bridge.dispose();
		};
	}, [enabled, model, chatId]);

	const pending = enabled ? pendingQuestionOf(messages) : null;
	const key = pending?.key ?? null;
	const toolCallId = pending?.toolCallId ?? null;
	useEffect(() => {
		const bridge = bridgeRef.current;
		if (!bridge || key === null || toolCallId === null) return;
		void bridge
			.seed({ key, toolCallId, get: (k) => model.questionDraft(k), save: (k, d) => model.saveQuestionDraft(k, d) })
			.then((seeded) => seeded && onSeededRef.current());
	}, [enabled, model, key, toolCallId]);

	return useCallback((id: string) => void bridgeRef.current?.clearDraft(id), []);
}
