import * as fs from "node:fs";
import * as path from "node:path";
import { z } from "zod";

/** Same rule as upstream's chat-store id check (src/store/chats.ts). */
const CHAT_ID = /^[A-Za-z0-9_-]{1,128}$/;
export const DRAFT_MAX_BYTES = 32 * 1024;
const SELECTION_MAX_BYTES = 8 * 1024;
const sizeOf = (v: unknown): number => Buffer.byteLength(JSON.stringify(v) ?? "");

export const DraftInput = z.strictObject({
	toolCallId: z.string().min(1).max(200),
	text: z.string().max(16000),
	confidence: z.number().int().min(0).max(100).nullable(),
	selection: z.json().refine((v) => sizeOf(v) <= SELECTION_MAX_BYTES),
	clientUpdatedAt: z.iso.datetime({ offset: true }),
	deviceLabel: z.enum(["desktop", "phone"]),
});
export type DraftInput = z.infer<typeof DraftInput>;
export const Draft = DraftInput.extend({ savedAt: z.iso.datetime() }).strict();
export type Draft = z.infer<typeof Draft>;

export type DraftResult =
	| { readonly ok: false; readonly code: "invalid_input" }
	| { readonly ok: true; readonly draft: Draft; readonly stale: boolean };

export const isValidChatId = (id: string): boolean => CHAT_ID.test(id);
const fileOf = (dir: string, chatId: string): string => path.join(dir, `${chatId}.json`);

function readStored(dir: string, chatId: string): Draft | null {
	if (!isValidChatId(chatId)) return null;
	try {
		const parsed = Draft.safeParse(JSON.parse(fs.readFileSync(fileOf(dir, chatId), "utf8")));
		return parsed.success ? parsed.data : null;
	} catch {
		return null; // missing or corrupt: no draft
	}
}

function writeAtomic(dir: string, chatId: string, draft: Draft): void {
	fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
	const tmp = path.join(dir, `.${chatId}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`);
	try {
		fs.writeFileSync(tmp, JSON.stringify(draft), { mode: 0o600 });
		fs.renameSync(tmp, fileOf(dir, chatId));
	} catch (err: unknown) {
		fs.rmSync(tmp, { force: true });
		throw err;
	}
}

/** Last writer wins by clientUpdatedAt within one question; a new question replaces the old draft. */
export function saveDraft(dir: string, chatId: string, input: unknown, now: () => number): DraftResult {
	if (!isValidChatId(chatId) || sizeOf(input) > DRAFT_MAX_BYTES) return { ok: false, code: "invalid_input" };
	const parsed = DraftInput.safeParse(input);
	if (!parsed.success) return { ok: false, code: "invalid_input" };
	const stored = readStored(dir, chatId);
	if (
		stored !== null &&
		stored.toolCallId === parsed.data.toolCallId &&
		Date.parse(parsed.data.clientUpdatedAt) < Date.parse(stored.clientUpdatedAt)
	) {
		return { ok: true, draft: stored, stale: true };
	}
	const draft: Draft = { ...parsed.data, savedAt: new Date(now()).toISOString() };
	writeAtomic(dir, chatId, draft);
	return { ok: true, draft, stale: false };
}

export function getDraft(dir: string, chatId: string, toolCallId: string): Draft | null {
	const stored = readStored(dir, chatId);
	return stored !== null && stored.toolCallId === toolCallId ? stored : null;
}

/** Remove this chat's draft (when the answer lands); with toolCallId, only if it is for that call. */
export function clearDraft(dir: string, chatId: string, toolCallId?: string): boolean {
	if (!isValidChatId(chatId)) return false;
	const stored = readStored(dir, chatId);
	if (stored !== null && toolCallId !== undefined && stored.toolCallId !== toolCallId) return false;
	try {
		fs.unlinkSync(fileOf(dir, chatId));
		return true;
	} catch {
		return false;
	}
}
