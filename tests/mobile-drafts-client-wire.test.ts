import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CONFIDENCE_STOPS, emptyDockSelection, type QuestionDraft } from "../src/core/question-core.ts";
import { DRAFT_MAX_BYTES, SELECTION_MAX_BYTES, fitWire, fromDesktopDraft, fromWire, toDesktopDraft, toWire, type ServerDraft } from "../components/mobile/drafts/draft-wire.ts";
import type { SheetDraft } from "../components/mobile/session/sheet-draft.ts";

const AT = "2026-03-01T12:00:00.000Z";

describe("draft wire mapping (SYNC-4)", () => {
	it("toWire and fromWire round trip", () => {
		const sheet: SheetDraft = { selection: { picked: [1] }, confidenceIndex: 4, thinking: "because" };
		const wire = toWire(sheet, "call-1", "phone", AT);
		assert.deepEqual(wire, { toolCallId: "call-1", text: "because", confidence: 90, selection: { picked: [1] }, clientUpdatedAt: AT, deviceLabel: "phone" });
		const back = fromWire({ ...wire, savedAt: AT } as ServerDraft);
		assert.deepEqual(back, sheet);
		assert.equal(toWire({ ...sheet, confidenceIndex: null }, "c", "phone", AT).confidence, null);
		assert.equal(fromWire({ ...wire, confidence: null, savedAt: AT } as ServerDraft).confidenceIndex, null);
	});

	it("confidence maps to the nearest stop", () => {
		const idx = (confidence: number): number | null =>
			fromWire({ ...toWire({ selection: null, confidenceIndex: 0, thinking: "" }, "c", "phone", AT), confidence, savedAt: AT } as ServerDraft).confidenceIndex;
		assert.equal(idx(0), 0);
		assert.equal(idx(41), 2);
		assert.equal(idx(61), 3);
		assert.equal(idx(96), 5);
		assert.equal(idx(100), CONFIDENCE_STOPS.length - 1);
	});

	it("a desktop QuestionDraft maps to a SheetDraft and back", () => {
		const draft: QuestionDraft = {
			form: { selection: { selected: new Set([0, 2]), otherSelected: true, dontKnow: false }, thinking: "why", other: "mine", text: "t", confidenceIndex: 3 },
			readingThinking: "reading",
		};
		const sheet = fromDesktopDraft(draft);
		assert.ok(sheet);
		assert.equal(sheet.thinking, "why");
		assert.equal(sheet.confidenceIndex, 3);
		JSON.stringify(sheet.selection);
		assert.deepEqual(toDesktopDraft(sheet), draft);
		assert.equal(fromDesktopDraft({}), null);
	});

	it("a foreign selection shape degrades to an empty dock selection", () => {
		const out = toDesktopDraft({ selection: { weird: true }, confidenceIndex: null, thinking: "keep" });
		assert.equal(out.form?.thinking, "keep");
		assert.deepEqual(out.form?.selection, emptyDockSelection());
		assert.equal(out.form?.confidenceIndex, 2);
	});
});

describe("fitWire (G2)", () => {
	const base = { toolCallId: "call-1", confidence: 50, deviceLabel: "phone", clientUpdatedAt: AT } as const;
	const sel = (over: Record<string, unknown>) => ({ selected: [], otherSelected: false, dontKnow: false, other: "", text: "", ...over });
	const bytes = (v: unknown): number => new TextEncoder().encode(JSON.stringify(v)).length;

	it("a 12000-character text answer still syncs", () => {
		const wire = { ...base, text: "t", selection: sel({ text: "x".repeat(12000) }) };
		assert.equal(fitWire(wire), wire, "a draft inside the caps is untouched");
		const big = { ...base, text: "t", selection: sel({ text: "\u20ac".repeat(12000), other: "o".repeat(9000), readingThinking: "r".repeat(9000) }) };
		const fit = fitWire(big);
		assert.ok(bytes(fit) <= DRAFT_MAX_BYTES, "whole body fits");
		assert.ok(bytes(fit.selection) <= SELECTION_MAX_BYTES, "selection fits");
		assert.ok((fit.selection as { text: string }).text.length > 1000, "text is trimmed, not dropped");
	});

	it("an oversized selection text never makes the body invalid", () => {
		const fit = fitWire({ ...base, text: "y".repeat(16000), selection: sel({ text: "x".repeat(20000) }) });
		assert.ok(bytes(fit) <= DRAFT_MAX_BYTES);
		assert.ok(bytes(fit.selection) <= SELECTION_MAX_BYTES);
	});

	it("fitWire works without Buffer", () => {
		const saved = globalThis.Buffer;
		Object.defineProperty(globalThis, "Buffer", { value: undefined, configurable: true, writable: true });
		try {
			const fit = fitWire({ ...base, text: "z".repeat(40000), selection: null });
			assert.ok(fit.text.length <= 16000);
		} finally {
			Object.defineProperty(globalThis, "Buffer", { value: saved, configurable: true, writable: true });
		}
	});
});
