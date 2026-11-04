import { z } from "zod";
import { fromWire, ServerDraft, type DeviceLabel, type WireDraft } from "./draft-wire.ts";
import type { SheetDraft } from "../session/sheet-draft.ts";

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;
export interface LoadedDraft {
	readonly initial: SheetDraft | null;
	readonly origin: DeviceLabel | null;
}
const NONE: LoadedDraft = Object.freeze({ initial: null, origin: null });
const GetEnvelope = z.object({ ok: z.literal(true), data: ServerDraft.nullable() });
const OkEnvelope = z.object({ ok: z.literal(true) });

const base = (chatId: string): string => `/api/chats/${encodeURIComponent(chatId)}/draft`;
const withCall = (chatId: string, toolCallId: string): string => `${base(chatId)}?toolCallId=${encodeURIComponent(toolCallId)}`;

async function okJson(res: Response): Promise<unknown> {
	return res.ok ? ((await res.json()) as unknown) : null;
}

/** GET the stored draft. Any failure degrades to "no draft". */
export async function loadDraft(fetchFn: FetchLike, chatId: string, toolCallId: string): Promise<LoadedDraft> {
	try {
		const parsed = GetEnvelope.safeParse(await okJson(await fetchFn(withCall(chatId, toolCallId))));
		const draft = parsed.success ? parsed.data.data : null;
		if (draft === null || draft.toolCallId !== toolCallId) return NONE;
		return { initial: fromWire(draft), origin: draft.deviceLabel };
	} catch {
		return NONE;
	}
}

export interface PutResult {
	readonly delivered: boolean;
	/** The server kept a newer copy; `stored` is that copy so the caller can adopt it. */
	readonly stale: boolean;
	readonly stored: LoadedDraft | null;
}
const PutEnvelope = z.object({ ok: z.literal(true), data: z.object({ draft: ServerDraft, stale: z.boolean() }) });
const FAILED: PutResult = Object.freeze({ delivered: false, stale: false, stored: null });

export async function putDraftDetailed(fetchFn: FetchLike, chatId: string, body: WireDraft, keepalive: boolean): Promise<PutResult> {
	try {
		const res = await fetchFn(base(chatId), { method: "PUT", keepalive, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
		const json = await okJson(res);
		const full = PutEnvelope.safeParse(json);
		if (full.success) {
			const { draft, stale } = full.data.data;
			return { delivered: true, stale, stored: stale ? { initial: fromWire(draft), origin: draft.deviceLabel } : null };
		}
		return OkEnvelope.safeParse(json).success ? { delivered: true, stale: false, stored: null } : FAILED;
	} catch {
		return FAILED;
	}
}

/** Boolean form kept for the desktop bridge. */
export async function putDraft(fetchFn: FetchLike, chatId: string, body: WireDraft, keepalive: boolean): Promise<boolean> {
	return (await putDraftDetailed(fetchFn, chatId, body, keepalive)).delivered;
}

export async function deleteDraft(fetchFn: FetchLike, chatId: string, toolCallId: string): Promise<boolean> {
	try {
		return OkEnvelope.safeParse(await okJson(await fetchFn(withCall(chatId, toolCallId), { method: "DELETE" }))).success;
	} catch {
		return false;
	}
}
