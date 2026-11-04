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
export const SELECTION_MAX_BYTES = 24 * 1024;
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

const encoder = new TextEncoder();
const byteLen = (v: unknown): number => encoder.encode(JSON.stringify(v) ?? "").length;
const SELECTION_STRINGS = ["text", "other", "readingThinking"] as const;

const cut = (value: string, drop: number): string => {
	const next = value.slice(0, Math.max(0, value.length - drop));
	return /[\ud800-\udbff]$/.test(next) ? next.slice(0, -1) : next;
};

interface Fields {
	readonly thinking: string;
	readonly sel: Readonly<Record<string, unknown>> | null;
}

const asRecord = (v: unknown): Readonly<Record<string, unknown>> | null =>
	typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;

const assemble = (wire: WireDraft, f: Fields): WireDraft => ({ ...wire, text: f.thinking, selection: f.sel ?? wire.selection });

/** Longest trimmable string among thinking and the selection's text fields, or null when all are empty. */
function longest(f: Fields): { readonly name: "thinking" | (typeof SELECTION_STRINGS)[number]; readonly len: number; readonly value: string } | null {
	let best: { name: "thinking" | (typeof SELECTION_STRINGS)[number]; len: number; value: string } | null = null;
	const consider = (name: "thinking" | (typeof SELECTION_STRINGS)[number], value: unknown): void => {
		if (typeof value === "string" && value.length > 0 && (best === null || value.length > best.len)) best = { name, len: value.length, value };
	};
	consider("thinking", f.thinking);
	for (const k of SELECTION_STRINGS) consider(k, f.sel?.[k]);
	return best;
}

function trim(f: Fields, name: string, drop: number): Fields {
	if (name === "thinking") return { ...f, thinking: cut(f.thinking, drop) };
	const current = f.sel?.[name];
	return typeof current === "string" ? { ...f, sel: { ...f.sel, [name]: cut(current, drop) } } : f;
}

/**
 * Fit the body under the server's caps (whole body DRAFT_MAX_BYTES, selection SELECTION_MAX_BYTES):
 * truncate every string field, longest first, never send an invalid body.
 */
export function fitWire(wire: WireDraft): WireDraft {
	let f: Fields = { thinking: wire.text.slice(0, TEXT_MAX_CHARS), sel: asRecord(wire.selection) };
	for (const k of SELECTION_STRINGS) {
		const v = f.sel?.[k];
		if (typeof v === "string" && v.length > TEXT_MAX_CHARS) f = trim(f, k, v.length - TEXT_MAX_CHARS);
	}
	for (;;) {
		const over = Math.max(byteLen(assemble(wire, f)) - DRAFT_MAX_BYTES, byteLen(f.sel ?? wire.selection) - SELECTION_MAX_BYTES);
		if (over <= 0) break;
		const target = longest(f);
		// Nothing left to trim: a non-string payload is too big, so drop the selection rather than send a bad body.
		if (target === null) return { ...wire, text: f.thinking, selection: null };
		// Cut by the field's own bytes-per-char so multibyte text is not over-trimmed.
		const perChar = Math.max(1, byteLen(target.value) / target.len);
		f = trim(f, target.name, Math.max(1, Math.min(target.len, Math.ceil(over / perChar))));
	}
	const out = assemble(wire, f);
	return out.text === wire.text && out.selection === wire.selection ? wire : out;
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
