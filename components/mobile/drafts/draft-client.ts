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

export async function putDraft(fetchFn: FetchLike, chatId: string, body: WireDraft, keepalive: boolean): Promise<boolean> {
	try {
		const res = await fetchFn(base(chatId), { method: "PUT", keepalive, headers: { "content-type": "application/json" }, body: JSON.stringify(body) });
		return OkEnvelope.safeParse(await okJson(res)).success;
	} catch {
		return false;
	}
}

export async function deleteDraft(fetchFn: FetchLike, chatId: string, toolCallId: string): Promise<boolean> {
	try {
		return OkEnvelope.safeParse(await okJson(await fetchFn(withCall(chatId, toolCallId), { method: "DELETE" }))).success;
	} catch {
		return false;
	}
}
