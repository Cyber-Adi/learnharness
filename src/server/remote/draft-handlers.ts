import * as path from "node:path";
import { z } from "zod";
import { PATHS } from "../../../config.ts";
import { remoteError, ERROR_STATUS, ok, type ErrorCode } from "./errors.ts";
import { DRAFT_MAX_BYTES, clearDraft, getDraft, isValidChatId, saveDraft } from "./drafts.ts";

const NO_STORE = { "Cache-Control": "no-store" } as const;
const CallId = z.string().min(1).max(200);

const fail = (code: ErrorCode): Response => Response.json(remoteError(code), { status: ERROR_STATUS[code], headers: NO_STORE });
const success = (data: unknown): Response => Response.json(ok(data), { headers: NO_STORE });
const defaultDir = (): string => path.join(PATHS.data, "drafts");

function target(req: Request, chatId: string): string | null {
	if (!isValidChatId(chatId)) return null;
	const parsed = CallId.safeParse(new URL(req.url).searchParams.get("toolCallId"));
	return parsed.success ? parsed.data : null;
}

/** SYNC-4 draft transport. `dir` is injectable for tests; the default is <data>/drafts. */
export async function handleDraft(req: Request, chatId: string, dir: string = defaultDir()): Promise<Response> {
	try {
		if (req.method === "PUT") return await put(req, chatId, dir);
		if (req.method !== "GET" && req.method !== "DELETE") return fail("invalid_input");
		const toolCallId = target(req, chatId);
		if (toolCallId === null) return fail("invalid_input");
		if (req.method === "GET") return success(getDraft(dir, chatId, toolCallId));
		return success({ cleared: clearDraft(dir, chatId, toolCallId) });
	} catch {
		return fail("internal");
	}
}

async function put(req: Request, chatId: string, dir: string): Promise<Response> {
	const raw = await req.text();
	if (raw.length > DRAFT_MAX_BYTES * 2) return fail("invalid_input");
	let body: unknown;
	try {
		body = JSON.parse(raw);
	} catch {
		return fail("invalid_input");
	}
	const res = saveDraft(dir, chatId, body, Date.now);
	return res.ok ? success({ draft: res.draft, stale: res.stale }) : fail(res.code);
}
