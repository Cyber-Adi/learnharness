import { CONFIDENCE_STOPS, DEFAULT_CONFIDENCE_INDEX, type QuestionDraft } from "@/src/core";
import { z } from "zod";
import type { SheetDraft } from "../session/sheet-draft.ts";

export type DeviceLabel = "desktop" | "phone";
export interface WireFields {
	readonly toolCallId: string;
	readonly text: string;
	readonly confidence: number | null;
	readonly selection: unknown;
	readonly deviceLabel: DeviceLabel;
}
export interface WireDraft extends WireFields {
	readonly clientUpdatedAt: string;
}

// Mirrors src/server/remote/drafts.ts (client may not import server code).
export const DRAFT_MAX_BYTES = 32 * 1024;
const TEXT_MAX_CHARS = 16000;

export const ServerDraft = z.object({
	toolCallId: z.string().min(1),
	text: z.string(),
	confidence: z.number().int().min(0).max(100).nullable(),
	selection: z.json(),
	clientUpdatedAt: z.string(),
	deviceLabel: z.enum(["desktop", "phone"]),
	savedAt: z.string(),
});
export type ServerDraft = z.infer<typeof ServerDraft>;

const toJson = (value: unknown): unknown => {
	if (value === undefined) return null;
	try {
		return JSON.parse(JSON.stringify(value)) as unknown;
	} catch {
		return null;
	}
};

export const toWireFields = (sheet: SheetDraft, toolCallId: string, deviceLabel: DeviceLabel): WireFields => {
	const stop = sheet.confidenceIndex === null ? undefined : CONFIDENCE_STOPS[Math.round(sheet.confidenceIndex)];
	return { toolCallId, text: sheet.thinking, confidence: stop ?? null, selection: toJson(sheet.selection), deviceLabel };
};

export const toWire = (sheet: SheetDraft, toolCallId: string, deviceLabel: DeviceLabel, clientUpdatedAt: string): WireDraft => ({
	...toWireFields(sheet, toolCallId, deviceLabel),
	clientUpdatedAt,
});

function nearestStopIndex(confidence: number): number {
	let best = 0;
	CONFIDENCE_STOPS.forEach((stop, i) => {
		if (Math.abs(stop - confidence) < Math.abs((CONFIDENCE_STOPS[best] ?? 0) - confidence)) best = i;
	});
	return best;
}

export const fromWire = (draft: ServerDraft): SheetDraft => ({
	selection: draft.selection,
	confidenceIndex: draft.confidence === null ? null : nearestStopIndex(draft.confidence),
	thinking: draft.text,
});

/** Fit the body under the server's caps: truncate thinking, never send an invalid body. */
export function fitWire(wire: WireDraft): WireDraft {
	let text = wire.text.slice(0, TEXT_MAX_CHARS);
	const bytes = (t: string): number => Buffer.byteLength(JSON.stringify({ ...wire, text: t }));
	const over = bytes(text) - DRAFT_MAX_BYTES;
	// Each removed char frees at least one byte, so cutting `over` chars always fits.
	if (over > 0) text = text.slice(0, Math.max(0, text.length - over));
	if (/[\ud800-\udbff]$/.test(text)) text = text.slice(0, -1);
	return text === wire.text ? wire : { ...wire, text };
}

const DesktopSelection = z.object({
	selected: z.array(z.number().int().min(0)),
	otherSelected: z.boolean(),
	dontKnow: z.boolean(),
	other: z.string(),
	text: z.string(),
	readingThinking: z.string().optional(),
});

/** Desktop QuestionDraft -> sheet draft. The desktop-only fields ride in `selection`. */
export function fromDesktopDraft(draft: QuestionDraft): SheetDraft | null {
	const { form, readingThinking } = draft;
	if (!form && readingThinking === undefined) return null;
	const selection = {
		selected: [...(form?.selection.selected ?? [])].sort((a, b) => a - b),
		otherSelected: form?.selection.otherSelected ?? false,
		dontKnow: form?.selection.dontKnow ?? false,
		other: form?.other ?? "",
		text: form?.text ?? "",
		...(readingThinking === undefined ? {} : { readingThinking }),
	};
	return { selection, confidenceIndex: form ? form.confidenceIndex : null, thinking: form?.thinking ?? "" };
}

export function toDesktopDraft(sheet: SheetDraft): QuestionDraft {
	const parsed = DesktopSelection.safeParse(sheet.selection);
	const sel = parsed.success ? parsed.data : null;
	const index = sheet.confidenceIndex;
	return {
		form: {
			selection: { selected: new Set(sel?.selected ?? []), otherSelected: sel?.otherSelected ?? false, dontKnow: sel?.dontKnow ?? false },
			thinking: sheet.thinking,
			other: sel?.other ?? "",
			text: sel?.text ?? "",
			confidenceIndex: index === null ? DEFAULT_CONFIDENCE_INDEX : index,
		},
		...(sel?.readingThinking === undefined ? {} : { readingThinking: sel.readingThinking }),
	};
}
